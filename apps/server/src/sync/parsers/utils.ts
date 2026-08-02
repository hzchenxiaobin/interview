import type { ParsedQuestion, RepoFile } from "@interview/contracts";

export interface ParseOutput {
  questions: ParsedQuestion[];
  skipped: string[];
}

export interface Section {
  /** 标题原文（不含 # 与编号），如 "题目概述" */
  name: string;
  /** 标题完整文本（含编号），如 "1. 题目概述" */
  heading: string;
  /** 正文（原始 markdown，保留代码块） */
  body: string;
}

/**
 * 将 fenced code block（```...```）内的行替换为空行（保持行号不变），
 * 用于标题/结构识别，防止代码内 `# 注释` 被误判为标题。
 */
export function blankCodeFences(md: string): string {
  const lines = md.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        return "";
      }
      return inFence ? "" : line;
    })
    .join("\n");
}

/**
 * 按指定级别标题切分正文。标题识别基于剥离代码块后的文本，
 * 正文取自原文（保留代码块）。
 */
export function splitSections(md: string, level: 2 | 3): Section[] {
  const marker = "#".repeat(level);
  const headingRe = new RegExp(`^${marker} (?!#)(.+)$`);
  const skeleton = blankCodeFences(md).split("\n");
  const original = md.split("\n");

  const cuts: Array<{ line: number; heading: string }> = [];
  skeleton.forEach((line, i) => {
    const m = headingRe.exec(line.trimEnd());
    if (m) cuts.push({ line: i, heading: m[1].trim() });
  });

  return cuts.map((cut, idx) => {
    const end = idx + 1 < cuts.length ? cuts[idx + 1].line : original.length;
    return {
      heading: cut.heading,
      name: cut.heading.replace(/^\d+(\.\d+)*\.?\s*/, "").trim(),
      body: original
        .slice(cut.line + 1, end)
        .join("\n")
        .trim(),
    };
  });
}

/** 按名称（忽略编号）正则查找章节 */
export function findSection(sections: Section[], nameRe: RegExp): Section | undefined {
  return sections.find((s) => nameRe.test(s.name));
}

/** 解析 `- **键**：值` 形式的元数据行，返回 键→值 映射 */
export function parseMetaLines(text: string): Map<string, string> {
  const meta = new Map<string, string>();
  for (const m of text.matchAll(/^- \*\*(.+?)\*\*：\s*(.+)$/gm)) {
    meta.set(m[1].trim(), m[2].trim());
  }
  return meta;
}

/** 中文难度 → 枚举 */
export function mapDifficulty(text: string): "easy" | "medium" | "hard" {
  if (text.includes("简单")) return "easy";
  if (text.includes("困难")) return "hard";
  return "medium";
}

/** 顿号/逗号分隔的标签 → 逗号拼接 */
export function joinTags(text: string): string {
  return text
    .split(/[、,，]/)
    .map((t) => t.trim())
    .filter(Boolean)
    .join(",");
}

/** 提取章节内的所有 markdown 表格（连续的 | 开头行块） */
export function extractTables(text: string): string[] {
  const tables: string[] = [];
  let current: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("|")) {
      current.push(line);
    } else if (current.length > 0) {
      tables.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) tables.push(current.join("\n"));
  return tables;
}

export function repoFile(path: string, content: string): RepoFile {
  return { path, content };
}
