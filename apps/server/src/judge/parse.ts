// ---------------------------------------------------------------------------
// 判题输入解析：从仓库题解提取参考代码与方法签名，从题面提取示例测试用例。
// LeetCode 不公开完整测试集（README V3 注记），评测用题面示例用例。
// ---------------------------------------------------------------------------

export interface ParamSpec {
  name: string;
  /** 规范化类型（C++）：int / long long / double / bool / char / string / vector<...> */
  type: string;
  /** 原始声明（生成 starter code 用，C++） */
  raw: string;
}

export interface MethodSpec {
  name: string;
  params: ParamSpec[];
  returnType: string;
}

/** 判题驱动支持的 C++ 类型（链表/树/设计类暂不支持） */
const SUPPORTED_TYPES = new Set([
  "int",
  "long long",
  "double",
  "float",
  "bool",
  "char",
  "string",
  "vector<int>",
  "vector<long long>",
  "vector<double>",
  "vector<char>",
  "vector<string>",
  "vector<vector<int>>",
  "vector<vector<long long>>",
  "vector<vector<char>>",
  "vector<vector<string>>",
  "vector<vector<double>>",
]);

export function isSupportedType(type: string): boolean {
  return SUPPORTED_TYPES.has(type);
}

/** 规范化 C++ 类型：去 const/&/* 与多余空白 */
export function canonicalType(raw: string): string {
  return raw
    .replace(/\bconst\b/g, "")
    .replace(/[&*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s*<\s*/g, "<")
    .replace(/\s*>\s*/g, ">")
    .replace(/\s*,\s*/g, ",");
}

/** 从题解 markdown 提取某语言的参考代码块（### C++ / ### Python 小节，标题可带后缀如"（迭代法）"） */
export function extractReferenceCode(md: string, language: "cpp" | "python"): string | null {
  const heading = language === "cpp" ? /^###\s*C\+\+/m : /^###\s*Python/m;
  const h = heading.exec(md);
  if (!h) return null;
  const rest = md.slice(h.index + h[0].length);
  const end = /^#{2,3}\s/m.exec(rest);
  const section = end ? rest.slice(0, end.index) : rest;
  const fence = /```(?:cpp|c\+\+|python|py)?\s*\n([\s\S]*?)```/.exec(section);
  return fence ? fence[1].trim() : null;
}

/** 解析 C++ 参考代码的 Solution 方法签名 */
export function parseCppSignature(code: string): MethodSpec | null {
  const cls = /class\s+Solution\s*(?::\s*public\s+\w+)?\s*\{([\s\S]*)\}\s*;/.exec(code);
  if (!cls) return null;
  // 剥离访问控制与 static，避免被吞进返回类型
  const body = cls[1].replace(/\b(public|private|protected)\s*:/g, " ").replace(/\bstatic\s+/g, "");
  const m = /([\w:<>,\s&*]+?)\s+(\w+)\s*\(([^)]*)\)\s*\{/.exec(body);
  if (!m) return null;
  const returnType = canonicalType(m[1]);
  const params = splitTopLevel(m[3], ",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const noDefault = p.split("=")[0].trim();
      const pm = /^(.+?)\s+(\w+)$/.exec(noDefault);
      if (!pm) return null;
      return { raw: noDefault, type: canonicalType(pm[1]), name: pm[2] };
    });
  if (params.some((p) => p == null)) return null;
  return { name: m[2], params: params as ParamSpec[], returnType };
}

/** 解析 Python 参考代码的 Solution 方法签名（类型取自 C++ 签名，此处只需名字） */
export function parsePythonSignature(code: string): Omit<MethodSpec, "returnType"> | null {
  const m = /def\s+(\w+)\s*\(\s*self\s*((?:,[^)]*)?)\)\s*(?:->\s*([^:]+))?\s*:/.exec(code);
  if (!m) return null;
  const params = splitTopLevel(m[2], ",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const name = p.split(":")[0].split("=")[0].trim();
      return name ? { name, type: "", raw: name } : null;
    });
  if (params.some((p) => p == null)) return null;
  return { name: m[1], params: params as ParamSpec[] };
}

/** 判断 C++ 签名是否所有类型都被驱动支持；不支持时给出原因 */
export function unsupportedReason(spec: MethodSpec): string | null {
  const bad = [spec.returnType, ...spec.params.map((p) => p.type)].filter((t) => !isSupportedType(t));
  if (bad.length === 0) return null;
  return `暂不支持类型：${[...new Set(bad)].join("、")}（链表/树/嵌套过深的题目暂不支持在线评测）`;
}

// ---------------------------------------------------------------------------
// 示例测试用例解析
// ---------------------------------------------------------------------------

export interface ExampleArg {
  name: string;
  /** JSON 文本（LeetCode 输入值均为 JSON 字面量） */
  value: string;
}

export interface ExampleCase {
  /** 原始输入文本（界面展示） */
  input: string;
  args: ExampleArg[];
  /** 期望输出文本（JSON 字面量） */
  expected: string;
}

/** 从题面 content 提取示例用例（```text 块中的 输入/输出 对） */
export function parseExamples(content: string): ExampleCase[] {
  const cases: ExampleCase[] = [];
  for (const fence of content.matchAll(/```\w*\n([\s\S]*?)```/g)) {
    const block = fence[1];
    const m = /输入[:：]\s*\n?([\s\S]*?)输出[:：]\s*\n?([\s\S]*?)(?:\n\s*解释|$)/.exec(block);
    if (!m) continue;
    const input = m[1].trim();
    const expected = m[2].split("\n")[0].trim();
    const args = parseAssignments(input);
    if (args.length > 0 && expected) cases.push({ input, args, expected });
  }
  return cases;
}

/** 解析 `name = value` 赋值（值按括号配平支持跨行；同行逗号分隔的多赋值也会拆开） */
function parseAssignments(text: string): ExampleArg[] {
  const args: ExampleArg[] = [];
  let current: ExampleArg | null = null;
  let depth = 0;
  for (const line of text.split("\n")) {
    for (const seg of splitAssignments(line)) {
      const assign = /^\s*([\w\u4e00-\u9fa5]+)\s*=\s*(.*)$/.exec(seg);
      if (assign && depth === 0) {
        if (current) args.push(current);
        current = { name: assign[1], value: assign[2].trim() };
        depth = bracketDelta(current.value);
      } else if (current) {
        current.value += seg.trim();
        depth += bracketDelta(seg);
      }
      if (current && depth <= 0) {
        args.push(current);
        current = null;
        depth = 0;
      }
    }
  }
  if (current) args.push(current);
  return args;
}

/** 把 `a = 1, b = "x"` 拆成独立赋值段（顶层逗号 + 后随 `name =`；忽略字符串内的逗号） */
function splitAssignments(line: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let cur = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== "\\") inStr = !inStr;
    else if (!inStr && (ch === "[" || ch === "{")) depth += 1;
    else if (!inStr && (ch === "]" || ch === "}")) depth -= 1;
    if (ch === "," && !inStr && depth === 0 && /^\s*[\w\u4e00-\u9fa5]+\s*=/.test(line.slice(i + 1))) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  parts.push(cur);
  return parts;
}

function bracketDelta(s: string): number {
  let d = 0;
  for (const ch of s) {
    if (ch === "[" || ch === "{") d += 1;
    else if (ch === "]" || ch === "}") d -= 1;
  }
  return d;
}

/** 按顶层分隔符切分（考虑 <> 嵌套） */
export function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of text) {
    if (ch === "<" || ch === "(" || ch === "[") depth += 1;
    else if (ch === ">" || ch === ")" || ch === "]") depth -= 1;
    if (ch === sep && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}
