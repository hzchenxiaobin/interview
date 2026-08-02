import type { ParsedQuestion, RepoFile } from "@interview/contracts";
import {
  extractTables,
  findSection,
  joinTags,
  parseMetaLines,
  splitSections,
  type ParseOutput,
} from "./utils.js";

const DIFFICULTY_DIRS = new Set(["easy", "medium", "hard"]);

/**
 * leetgpu 仓库 → category=cuda
 * 结构：{easy|medium|hard}/{题号}_{slug}/leetgpu-*-solution.md（目录 slug 与文件 slug
 * 不总是一致，在目录内按文件名匹配；题号跨目录撞号，sourceKey 用目录名）。
 * 容忍缺节（如 hard/74_gpt2_block 无"性能分析与优化"节）。
 */
export function parse(repoFiles: RepoFile[]): ParseOutput {
  const questions: ParsedQuestion[] = [];
  const skipped: string[] = [];

  for (const file of repoFiles) {
    const segments = file.path.split("/");
    if (segments.length !== 3 || !DIFFICULTY_DIRS.has(segments[0])) continue;
    if (!/^leetgpu-.*-solution\.md$/.test(segments[2])) continue;

    const question = parseSolution(
      file.content,
      segments[0] as "easy" | "medium" | "hard",
      segments[1],
    );
    if (question) questions.push(question);
    else skipped.push(file.path);
  }
  return { questions, skipped };
}

function parseSolution(
  md: string,
  difficulty: "easy" | "medium" | "hard",
  dirName: string,
): ParsedQuestion | null {
  const sections = splitSections(md, 2);
  const overview = findSection(sections, /^题目概述/);
  if (!overview) return null;

  const meta = parseMetaLines(overview.body);
  const link = meta.get("链接") ?? "";

  // "- **标题 / 题号**：Vector Addition（#1，easy）"
  const titleLine = meta.get("标题 / 题号") ?? "";
  const titleMatch = /^(.+?)（#(\d+)[，,]/.exec(titleLine);
  const dirNumber = /^(\d+)_/.exec(dirName)?.[1] ?? "";
  const title = titleMatch?.[1]?.trim() || dirName.replace(/^\d+_/, "").replace(/_/g, " ");
  const number = titleMatch?.[2] ?? dirNumber;

  const gpuDesign = findSection(sections, /^GPU 设计/);
  const perf = findSection(sections, /^性能分析/);
  const complexity = findSection(sections, /^复杂度分析/);

  // content = 题目概述 + GPU 设计（保留小节标题）
  const contentParts = [overview.body];
  if (gpuDesign?.body) contentParts.push(`## GPU 设计\n\n${gpuDesign.body}`);

  // keyPoints = 复杂度分析节原文 + 性能分析节中的 ncu 指标表（表头含"指标"）
  const keyPointsParts: string[] = [];
  if (complexity?.body) keyPointsParts.push(complexity.body);
  if (perf) {
    const ncuTables = extractTables(perf.body).filter((t) => t.includes("指标"));
    if (ncuTables.length > 0) keyPointsParts.push(ncuTables.join("\n\n"));
  }

  return {
    category: "cuda",
    title: number ? `${number}. ${title}` : title,
    content: contentParts.join("\n\n"),
    difficulty,
    tags: joinTags(meta.get("标签") ?? ""),
    followUps: perf ? perfToFollowUps(perf.body) : [],
    keyPoints: keyPointsParts.join("\n\n"),
    source: number ? `LeetGPU #${number}` : link,
    sourceKey: `leetgpu:${difficulty}/${dirName}`,
  };
}

/**
 * "性能分析与优化"节 → 追问（规则化）：
 * - 小节标题（### x.y Title）→ "如何进行{Title}？"；
 * - 编号/项目符号要点的首个分句 → "{要点}的原理是什么，怎么做？"；
 * - 回退：表头含"优化方向"的表格，取每行首列要点。
 */
function perfToFollowUps(body: string): string[] {
  const followUps: string[] = [];
  const subSections = splitSections(body, 3);
  for (const sub of subSections) {
    const name = sub.name.replace(/[：:].*$/, "").trim();
    if (name && !/编译与运行/.test(name)) followUps.push(`如何进行${name}？`);
  }
  for (const m of body.matchAll(/^\d+\.\s+(?:\*\*(.+?)\*\*[：:]?\s*|(.+))$/gm)) {
    const point = (m[1] ?? m[2] ?? "").split(/[，。：:]/)[0].trim();
    if (point && point.length <= 40) followUps.push(`${point}的原理是什么，怎么做？`);
  }
  if (followUps.length === 0) {
    for (const table of extractTables(body)) {
      if (!/优化方向|优化手段|优化点/.test(table.split("\n")[0])) continue;
      for (const row of table.split("\n").slice(2)) {
        const cell = row.split("|")[1]?.replace(/\*\*/g, "").replace(/`/g, "").trim();
        if (cell && cell.length <= 40) followUps.push(`${cell}的原理是什么，怎么做？`);
      }
    }
  }
  return followUps.slice(0, 6);
}
