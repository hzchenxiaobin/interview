import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildCppSource, buildPythonSource } from "./driver.js";
import type { ExampleCase, MethodSpec } from "./parse.js";

// ---------------------------------------------------------------------------
// 判题运行编排：临时目录 + 编译（C++）+ 逐用例执行 + 结果比对。
// 注意：用户代码在本机直接执行（个人工具定位），仅以超时与临时目录做约束。
// ---------------------------------------------------------------------------

const COMPILE_TIMEOUT_MS = 30_000;
const RUN_TIMEOUT_MS = 8_000;
const MAX_OUTPUT = 64 * 1024;

export interface CaseResult {
  input: string;
  expected: string;
  actual: string;
  pass: boolean;
  /** 运行错误（超时/运行时错误），通过时为 null */
  error: string | null;
}

export interface JudgeRunResult {
  status: "ok" | "compile_error" | "no_cases";
  compileError?: string;
  cases: CaseResult[];
  passed: number;
  total: number;
}

export function runJudge(opts: {
  language: "cpp" | "python";
  code: string;
  spec: MethodSpec;
  cases: ExampleCase[];
}): JudgeRunResult {
  const { language, code, spec, cases } = opts;
  if (cases.length === 0) return { status: "no_cases", cases: [], passed: 0, total: 0 };

  const workDir = mkdtempSync(path.join(tmpdir(), "judge-"));
  try {
    const bin = language === "cpp" ? compile(workDir, code, spec) : preparePython(workDir, code, spec.name);
    if (typeof bin !== "string") return bin; // compile_error

    const results = cases.map((c) => runCase(workDir, bin, language, c));
    const passed = results.filter((r) => r.pass).length;
    return { status: "ok", cases: results, passed, total: results.length };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

/** 编译 C++；成功返回可执行文件名，失败返回 JudgeRunResult */
function compile(workDir: string, userCode: string, spec: MethodSpec): string | JudgeRunResult {
  writeFileSync(path.join(workDir, "main.cpp"), buildCppSource(userCode, spec));
  try {
    execFileSync("g++", ["-std=c++17", "-O2", "-o", "main", "main.cpp"], {
      cwd: workDir,
      timeout: COMPILE_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return "main";
  } catch (err) {
    const e = err as { stderr?: Buffer; message: string };
    return {
      status: "compile_error",
      compileError: (e.stderr?.toString() || e.message).slice(0, 4000),
      cases: [],
      passed: 0,
      total: 0,
    };
  }
}

function preparePython(workDir: string, userCode: string, methodName: string): string {
  writeFileSync(path.join(workDir, "main.py"), buildPythonSource(userCode, methodName));
  return "main.py";
}

function runCase(workDir: string, bin: string, language: "cpp" | "python", c: ExampleCase): CaseResult {
  const inputJson = buildInputJson(c);
  const base = { input: c.input, expected: c.expected };
  if (!inputJson) {
    return { ...base, actual: "", pass: false, error: "用例输入不是合法 JSON，跳过" };
  }
  const [cmd, args] =
    language === "cpp" ? [path.join(workDir, bin), []] : ["python3", [path.join(workDir, bin)]];
  try {
    const out = execFileSync(cmd, args, {
      cwd: workDir,
      input: inputJson,
      timeout: RUN_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const actual = out.toString().trim();
    return { ...base, actual, pass: outputsEqual(actual, c.expected), error: null };
  } catch (err) {
    const e = err as { killed?: boolean; signal?: string; stderr?: Buffer; stdout?: Buffer; message: string };
    const actual = (e.stdout?.toString() ?? "").trim();
    const stderr = (e.stderr?.toString() ?? "").trim();
    const error = e.killed || e.signal === "SIGTERM" ? `运行超时（>${RUN_TIMEOUT_MS / 1000}s）` : stderr.slice(0, 2000) || e.message;
    return { ...base, actual, pass: false, error };
  }
}

/** 示例参数 → JSON 对象文本（参数名来自题面赋值，顺序即签名顺序） */
function buildInputJson(c: ExampleCase): string | null {
  try {
    const obj: Record<string, unknown> = {};
    for (const a of c.args) obj[a.name] = JSON.parse(a.value);
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 输出比对：JSON 深比较（数值容差 1e-5）；失败再试无序数组规范化；兜底字符串
// ---------------------------------------------------------------------------

export function outputsEqual(actual: string, expected: string): boolean {
  if (actual.trim() === expected.trim()) return true;
  const a = tryJson(actual);
  const e = tryJson(expected);
  if (a.ok && e.ok) {
    if (deepEqual(a.v, e.v)) return true;
    // 无序兜底仅用于二维数组（如字母异位词分组），一维数组顺序敏感
    if (Array.isArray(a.v) && Array.isArray(e.v) && a.v.every(Array.isArray) && e.v.every(Array.isArray)) {
      return canonical(a.v) === canonical(e.v);
    }
  }
  return false;
}

function tryJson(s: string): { ok: true; v: unknown } | { ok: false } {
  try {
    return { ok: true, v: JSON.parse(s) };
  } catch {
    return { ok: false };
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

/** 无序比较兜底：递归排序数组（如字母异位词分组答案顺序不限） */
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    const items = v.map(canonical).sort();
    return `[${items.join(",")}]`;
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${JSON.stringify(k)}:${canonical(x)}`)
      .sort();
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(v) ?? "";
}
