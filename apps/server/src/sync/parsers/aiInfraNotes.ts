import type { Category, ParsedQuestion, RepoFile } from "@interview/contracts";
import { blankCodeFences, splitSections, type ParseOutput } from "./utils.js";

/** 专题 → category 映射（全部归 knowledge；cuda 分类仅收 leetgpu 编程题） */
const TOPIC_CATEGORY: Record<string, Category> = {
  cpp: "knowledge",
  cuda: "knowledge",
  cute: "knowledge",
  cutlass: "knowledge",
  deepgemm: "knowledge",
  triton: "knowledge",
  moe: "knowledge",
  pytorch: "knowledge",
  shengteng: "knowledge",
  transformer: "knowledge",
  vllm: "knowledge",
};

/** 知识点条目正文下限（防碎片） */
const MIN_ENTRY_CHARS = 100;

const SOURCE_PREFIX = "ai-infra-notes";

/**
 * ai-infra-notes 仓库 → category=knowledge（cuda 分类仅收 leetgpu 编程题）
 * 解析范围：
 * - aiinfra/topics/interview/notes/us_interview_qa.md（`**Q：xxx**` + bullet 答案）
 * - aiinfra/topics/interview/notes/social_interview_qa.md（`### Q1 ✅ 项目题：xxx`）
 * - aiinfra/topics/{topic}/ 顶层 dayN.md / README.md（按 H3 切知识点条目）
 * - profiling/week{1,2,3}/day*\/README.md（STAR 素材题）
 * 其余 markdown 不在解析范围内，静默忽略；"面经 1.md" 无结构，记入 skipped。
 * 所有结构识别前先剥离 fenced code block。
 */
export function parse(repoFiles: RepoFile[]): ParseOutput {
  const questions: ParsedQuestion[] = [];
  const skipped: string[] = [];

  for (const file of repoFiles) {
    const segments = file.path.split("/");

    if (file.path.startsWith("aiinfra/topics/interview/notes/")) {
      const name = segments[segments.length - 1];
      if (name === "us_interview_qa.md") {
        questions.push(...parseUsInterviewQa(file.path, file.content));
      } else if (name === "social_interview_qa.md") {
        questions.push(...parseSocialInterviewQa(file.path, file.content));
      } else {
        // 面经类：无结构
        skipped.push(file.path);
      }
      continue;
    }

    const topicMatch = /^aiinfra\/topics\/([^/]+)\/[^/]+\.md$/.exec(file.path);
    if (topicMatch && TOPIC_CATEGORY[topicMatch[1]]) {
      const topic = topicMatch[1];
      questions.push(...parseTopicFile(file.path, file.content, topic));
      continue;
    }

    const dailyMatch = /^aiinfra\/daily\/(week\d+)\/(day\d+)\/README\.md$/.exec(file.path);
    if (dailyMatch) {
      const q = parseDailyReadme(file.path, file.content, dailyMatch[1], dailyMatch[2]);
      if (q) questions.push(q);
      else skipped.push(file.path);
      continue;
    }

    const profilingMatch = /^profiling\/(week[123])\/(day[^/]+)\/README\.md$/.exec(file.path);
    if (profilingMatch) {
      const q = parseProfilingReadme(file.path, file.content, profilingMatch[1], profilingMatch[2]);
      if (q) questions.push(q);
      else skipped.push(file.path);
      continue;
    }
    // 范围外文件（daily/、paper/、顶层 README 等）：静默忽略
  }
  return { questions, skipped };
}

/** us_interview_qa.md：`**Q：xxx**` 问题行 + 后续 bullet 答案 → 每条一题 */
function parseUsInterviewQa(path: string, md: string): ParsedQuestion[] {
  const skeleton = blankCodeFences(md);
  const out: ParsedQuestion[] = [];
  // 在 skeleton 上定位问题行，答案取自原文同区间（保留代码）
  const skeletonLines = skeleton.split("\n");
  const originalLines = md.split("\n");

  const cuts: Array<{ line: number; question: string }> = [];
  skeletonLines.forEach((line, i) => {
    const q = /^\*\*Q：(.+?)\*\*\s*$/.exec(line.trim());
    if (q) cuts.push({ line: i, question: q[1].trim() });
    // 标题行截断上一条答案
    else if (/^#{1,3} /.test(line.trim()) && cuts.length > 0) cuts.push({ line: i, question: "" });
  });

  let idx = 0;
  for (const cut of cuts) {
    const next = cuts[idx + 1];
    idx += 1;
    if (!cut.question) continue;
    const end = next ? next.line : originalLines.length;
    const answer = originalLines
      .slice(cut.line + 1, end)
      .join("\n")
      .trim();
    out.push({
      category: "knowledge",
      title: cut.question,
      content: cut.question,
      difficulty: "medium",
      tags: "面试题",
      followUps: [],
      keyPoints: answer,
      source: "AI Infra 面试题（北美面经篇）",
      sourceKey: `${SOURCE_PREFIX}:${path}#${out.length}`,
    });
  }
  return out;
}

/** social_interview_qa.md：`### Q1 ✅ 项目题：xxx` + 答案到下一个 Q 标题 → 每条一题 */
function parseSocialInterviewQa(path: string, md: string): ParsedQuestion[] {
  const skeleton = blankCodeFences(md);
  const sections = splitSections(skeleton, 3);
  const out: ParsedQuestion[] = [];
  for (const section of sections) {
    const m = /^Q(\d+)\s*[✅🔶]*\s*(.*)$/.exec(section.heading.trim());
    if (!m) continue;
    const rawTitle = m[2].trim();
    if (!rawTitle) continue;
    const isProject = rawTitle.includes("项目题");
    const title = rawTitle.replace(/^项目题[：:]\s*/, "");
    // 答案正文：skeleton 已剥离代码块，这里用 section.body（基于 skeleton 切分，无代码）
    const answer = section.body.trim();
    out.push({
      category: "knowledge",
      title,
      content: title,
      difficulty: "medium",
      tags: isProject ? "面试题,项目" : "面试题",
      followUps: [],
      keyPoints: answer,
      source: "AI Infra 社招面试实录",
      sourceKey: `${SOURCE_PREFIX}:${path}#${out.length}`,
    });
  }
  return out;
}

/** topics/{topic}/ 顶层 md：按 H3 切知识点条目，仅收正文 ≥100 字的 */
function parseTopicFile(path: string, md: string, topic: string): ParsedQuestion[] {  const sections = splitSections(md, 3);
  const out: ParsedQuestion[] = [];
  for (const section of sections) {
    const title = section.heading.trim();
    const body = section.body.trim();
    if (!title || body.length < MIN_ENTRY_CHARS) continue;
    out.push({
      category: TOPIC_CATEGORY[topic],
      title,
      content: body,
      difficulty: "medium",
      tags: topic,
      followUps: [],
      keyPoints: "",
      source: `ai-infra-notes/${topic}`,
      sourceKey: `${SOURCE_PREFIX}:${path}#${out.length}`,
    });
  }
  return out;
}

/** daily/weekN/dayM/README.md → 每天一题（category=knowledge）
 * content = 面试要点节之前的正文；followUps/keyPoints 取自「面试要点」节的
 * `N. **问题**` + <details> 答案；无面试要点节时 followUps 为空。 */
function parseDailyReadme(
  path: string,
  md: string,
  week: string,
  day: string,
): ParsedQuestion | null {
  const skeleton = blankCodeFences(md);
  const dayHeading = /^##\s+Day\s*\d+\s*[：:]\s*(.+)$/m.exec(skeleton);
  const topic = dayHeading?.[1]?.trim() || `${week} ${day}`;

  const sections = splitSections(skeleton, 3);
  const interview = sections.find((s) => /^面试要点/.test(s.name));

  // content：面试要点节之前的正文（学习材料）
  let content: string;
  if (interview) {
    const cut = skeleton.indexOf(`### ${interview.heading}`);
    content = (cut > 0 ? skeleton.slice(0, cut) : skeleton).trim();
  } else {
    content = md.trim();
  }
  if (content.length < MIN_ENTRY_CHARS) return null;

  // 面试要点：`N. **问题？**` + 后续 <details>…</details> 或普通文本答案
  const followUps: string[] = [];
  const keyPointsParts: string[] = [];
  if (interview) {
    const lines = interview.body.split("\n");
    let current: { q: string; a: string[] } | null = null;
    const flush = () => {
      if (!current) return;
      const answer = current.a
        .join("\n")
        .replace(/<\/?details>/g, "")
        .replace(/<summary>.*?<\/summary>/g, "")
        .trim();
      followUps.push(current.q);
      if (answer) keyPointsParts.push(`**${current.q}**\n${answer}`);
      current = null;
    };
    for (const line of lines) {
      const q = /^\d+\.\s+\*\*(.+?)\*\*\s*$/.exec(line.trim());
      if (q) {
        flush();
        current = { q: q[1].trim(), a: [] };
      } else if (current) {
        current.a.push(line);
      }
    }
    flush();
  }

  return {
    category: "knowledge",
    title: `${week}/${day} ${topic}`,
    content,
    difficulty: "medium",
    tags: `daily,${week}`,
    followUps,
    keyPoints: keyPointsParts.join("\n\n"),
    source: `ai-infra-notes/daily/${week}`,
    sourceKey: `${SOURCE_PREFIX}:${path}#0`,
  };
}

/** profiling/weekN/dayM/README.md → category=knowledge 的 STAR 素材题 */
function parseProfilingReadme(
  path: string,
  md: string,
  week: string,
  day: string,
): ParsedQuestion | null {
  const h1 = /^# (.+)$/m.exec(blankCodeFences(md));
  if (!h1) return null;
  // H1 形如 "Week 1 Day 1 — hello_gpu & Vector Add Profiling"，去掉日期前缀
  const topic = h1[1].replace(/^Week\s*\d+\s*Day\s*\d+\s*[—–-]\s*/i, "").trim() || h1[1].trim();

  // keyPoints = "关键洞察" / "瓶颈判定" 小节原文（标题小节或 **加粗** 行两种形态）
  const keyPointsParts: string[] = [];
  for (const level of [2, 3] as const) {
    for (const section of splitSections(md, level)) {
      if (/关键洞察|瓶颈判定/.test(section.name) && section.body) {
        keyPointsParts.push(`**${section.name}**\n${section.body.trim()}`);
      }
    }
  }
  // `**关键洞察**：...` 加粗行形态：取该行余文 + 后续连续非空行
  const lines = blankCodeFences(md).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^\*\*(关键洞察|瓶颈判定)\*\*[：:]\s*(.*)$/.exec(lines[i].trim());
    if (!m) continue;
    const body = [m[2]];
    while (i + 1 < lines.length && lines[i + 1].trim() !== "" && !/^(#{1,3} |\*\*)/.test(lines[i + 1].trim())) {
      body.push(lines[i + 1]);
      i += 1;
    }
    keyPointsParts.push(`**${m[1]}**\n${body.join("\n").trim()}`);
  }

  return {
    category: "knowledge",
    title: `${week}/${day} ${topic}`,
    content: md.trim(),
    difficulty: "medium",
    tags: "profiling,STAR",
    followUps: [],
    keyPoints: keyPointsParts.join("\n\n"),
    source: "ai-infra-notes/profiling",
    sourceKey: `${SOURCE_PREFIX}:${path}#0`,
  };
}
