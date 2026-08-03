import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ParsedQuestion, RepoFile } from "@interview/contracts";
import {
  findSection,
  joinTags,
  mapDifficulty,
  parseMetaLines,
  splitSections,
  type ParseOutput,
} from "./utils.js";

/**
 * leetcode 仓库 → category=leetcode
 * 结构：solution/{区间}/{题号}_{题名}.md，元数据在 H1 后、第一个 ## 前；
 * followUps 取"面试要点"节（两种格式），keyPoints = 面试要点答案 + 复杂度分析节。
 * 白名单两层收敛：仓库 hot-interview.md（270 道高频）∩ 本地 leetcode-hot150.txt
 * （150 道最高频，剔除同类简单题）；任一缺失时只用另一层，都缺失则全量导入。
 */
export function parse(repoFiles: RepoFile[]): ParseOutput {
  const questions: ParsedQuestion[] = [];
  const skipped: string[] = [];
  const whitelist = combinedWhitelist(repoFiles);

  for (const file of repoFiles) {
    const segments = file.path.split("/");
    // 只收 solution/{区间}/{题名}.md（SKILL.md 等已在 github.ts 过滤，此处自包含再校验）
    if (segments.length !== 3 || segments[0] !== "solution") continue;
    const baseName = segments[2];
    if (!baseName.endsWith(".md") || baseName === "SKILL.md") continue;
    if (whitelist && !whitelist.has(file.path)) continue;

    const question = parseSolution(file.path, file.content, baseName.slice(0, -3));
    if (question) questions.push(question);
    else skipped.push(file.path);
  }
  return { questions, skipped };
}

function combinedWhitelist(repoFiles: RepoFile[]): Set<string> | null {
  const remote = hotWhitelist(repoFiles);
  const local = localHotWhitelist();
  if (remote && local) return new Set([...remote].filter((p) => local.has(p)));
  return remote ?? local;
}

/** 从 hot-interview.md 提取"站内题解"链接路径作为白名单；文件缺失或无链接时返回 null（不过滤） */
function hotWhitelist(repoFiles: RepoFile[]): Set<string> | null {
  const hot = repoFiles.find((f) => f.path === "hot-interview.md");
  if (!hot) return null;
  const paths = [...hot.content.matchAll(/站内题解\]\((solution\/[^)]+?\.md)\)/g)].map((m) => m[1]);
  return paths.length > 0 ? new Set(paths) : null;
}

/** 本地 150 道最高频题清单（与本模块同目录）；文件缺失或为空时返回 null（不过滤） */
function localHotWhitelist(): Set<string> | null {
  try {
    const path = fileURLToPath(new URL("./leetcode-hot150.txt", import.meta.url));
    const lines = readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length > 0 ? new Set(lines) : null;
  } catch {
    return null;
  }
}

function parseSolution(path: string, md: string, fileBase: string): ParsedQuestion | null {
  const h1 = /^# (.+)$/m.exec(md);
  if (!h1) return null;

  // 元数据块：H1 之后、第一个 ## 之前
  const afterH1 = md.slice(md.indexOf(h1[0]) + h1[0].length);
  const firstH2 = /^## /m.exec(afterH1);
  const metaBlock = firstH2 ? afterH1.slice(0, firstH2.index) : afterH1;
  const meta = parseMetaLines(metaBlock);

  const difficultyText = meta.get("难度");
  const linkText = meta.get("链接");
  if (!difficultyText || !linkText) return null;

  const sections = splitSections(md, 2);
  const overview = findSection(sections, /^题目概述/);
  const interview = findSection(sections, /^面试要点/);
  const complexity = findSection(sections, /^复杂度分析/);
  if (!overview || !overview.body) return null;

  // source：链接文本如 "[53. 最大子数组和](...)" / "[剑指 Offer 51. ...](...)" → "LeetCode 53"
  const linkMatch = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(linkText);
  const source = linkMatch ? `LeetCode ${(/(\d+)/.exec(linkMatch[1])?.[1]) ?? linkMatch[1]}` : "";

  const pairs = interview ? parseInterviewSection(interview.body) : [];
  const followUps = pairs.map((p) => p.question);

  const keyPointsParts: string[] = [];
  if (pairs.length > 0) {
    keyPointsParts.push(pairs.map((p) => `**${p.question}**\n${p.answer}`).join("\n\n"));
  }
  if (complexity?.body) keyPointsParts.push(complexity.body);

  return {
    category: "leetcode",
    title: fileBase.replace("_", ". "),
    content: overview.body,
    difficulty: mapDifficulty(difficultyText),
    tags: joinTags(meta.get("标签") ?? ""),
    followUps,
    keyPoints: keyPointsParts.join("\n\n"),
    source,
    sourceKey: `leetcode:${path}`,
  };
}

/**
 * "面试要点"节两种格式：
 * a) `1. **问题？**` + 三空格缩进的 `- 答案` 列表（主流）；
 * b) `**Q1：问题？**` + `> 答案` 引用块（少数）。
 */
function parseInterviewSection(body: string): Array<{ question: string; answer: string }> {
  const pairs: Array<{ question: string; answer: string }> = [];
  const lines = body.split("\n");

  let currentAnswer: string[] | null = null;
  const flush = () => {
    if (currentAnswer && pairs.length > 0) {
      pairs[pairs.length - 1].answer = currentAnswer.join("\n").trim();
    }
    currentAnswer = null;
  };

  for (const line of lines) {
    const numbered = /^\d+\.\s+\*\*(.+?)\*\*\s*$/.exec(line);
    const qStyle = /^\*\*Q\d*：(.+?)\*\*\s*$/.exec(line);
    let question = numbered?.[1] ?? qStyle?.[1];
    let inlineAnswer = "";
    if (!question && /^\d+\.\s+/.test(line)) {
      // 第三种形态：问答同行，如 `1. **为什么** `x` **而不是** `y`：因为……`
      const inline = /^\d+\.\s+(.+?)[：:]\s*(.+)$/.exec(line);
      if (inline) {
        question = inline[1].replace(/\*\*/g, "");
        inlineAnswer = inline[2];
      }
    }
    if (question) {
      flush();
      pairs.push({ question: question.trim(), answer: "" });
      currentAnswer = [];
      if (inlineAnswer) currentAnswer.push(inlineAnswer.trim());
      continue;
    }
    if (currentAnswer) {
      const bullet = /^\s+- (.+)$/.exec(line);
      const quote = /^> (.+)$/.exec(line);
      const text = bullet?.[1] ?? quote?.[1];
      if (text) currentAnswer.push(text.trim());
    }
  }
  flush();
  return pairs;
}
