/**
 * 一次性 LLM 题库生成（README §7.4 思路落地，仅 ai-infra-notes）：
 * 拉取仓库 markdown → 逐文件调 LLM 抽取结构化题目 → 落盘静态 JSON，
 * 之后用 import-aiinfra-bank.ts 入库，不再调 LLM。
 *
 * 断点续跑：每完成一个文件追加一行到 data/.bank-checkpoint.jsonl，
 * 重跑时自动跳过已完成文件；全部完成后聚合写出 data/question-bank.ai-infra.json。
 *
 * 运行：pnpm --filter @interview/server bank:generate
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { categorySchema, difficultySchema, type Category } from "@interview/contracts";
import { env } from "../src/env.js";
import { fetchRepoFiles } from "../src/sync/github.js";

const REPO = "ai-infra-notes";
const OWNER = "hzchenxiaobin";
const DATA_DIR = fileURLToPath(new URL("../data", import.meta.url));
const CHECKPOINT_FILE = `${DATA_DIR}/.bank-checkpoint.jsonl`;
const OUTPUT_FILE = `${DATA_DIR}/question-bank.ai-infra.json`;

const CONCURRENCY = 3;
const TIMEOUT_MS = 90_000;
const MAX_TOKENS = 8192;
const MAX_CONTENT_CHARS = 15_000;

// 与规则解析器 aiInfraNotes.ts 相同的取材范围与分类映射
const TOPIC_CATEGORY: Record<string, Category> = {
  cpp: "knowledge",
  cuda: "cuda",
  cute: "cuda",
  cutlass: "cuda",
  deepgemm: "cuda",
  triton: "cuda",
  moe: "knowledge",
  pytorch: "knowledge",
  shengteng: "knowledge",
  transformer: "knowledge",
  vllm: "knowledge",
};

const bankItemSchema = z.object({
  category: categorySchema,
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  difficulty: difficultySchema,
  tags: z.string().max(500).default(""),
  followUps: z.array(z.string()).default([]),
  keyPoints: z.string().default(""),
  source: z.string().max(255).default(""),
});
type BankItem = z.infer<typeof bankItemSchema>;
const bankFileSchema = z.array(bankItemSchema);

interface ScopedFile {
  path: string;
  content: string;
  categoryHint: Category;
  source: string;
}

function scopeFiles(files: Array<{ path: string; content: string }>): ScopedFile[] {
  const out: ScopedFile[] = [];
  for (const f of files) {
    let m: RegExpExecArray | null;
    if (f.path === "aiinfra/topics/interview/notes/us_interview_qa.md") {
      out.push({ ...f, categoryHint: "knowledge", source: "AI Infra 面试题（北美面经篇）" });
    } else if (f.path === "aiinfra/topics/interview/notes/social_interview_qa.md") {
      out.push({ ...f, categoryHint: "knowledge", source: "AI Infra 社招面试实录" });
    } else if ((m = /^aiinfra\/topics\/([^/]+)\/[^/]+\.md$/.exec(f.path)) && TOPIC_CATEGORY[m[1]]) {
      out.push({ ...f, categoryHint: TOPIC_CATEGORY[m[1]], source: `ai-infra-notes/${m[1]}` });
    } else if ((m = /^aiinfra\/daily\/(week\d+)\/(day\d+)\/README\.md$/.exec(f.path))) {
      out.push({ ...f, categoryHint: "cuda", source: `ai-infra-notes/daily/${m[1]}` });
    } else if (/^profiling\/week[123]\/day[^/]+\/README\.md$/.test(f.path)) {
      out.push({ ...f, categoryHint: "knowledge", source: "ai-infra-notes/profiling" });
    }
  }
  return out;
}

async function chatCompletion(messages: Array<{ role: "system" | "user"; content: string }>): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.LLM_API_KEY}`,
        ...(env.LLM_VKEY ? { "x-api-vkey": env.LLM_VKEY } : {}),
      },
      body: JSON.stringify({
        model: env.LLM_MODEL,
        messages,
        max_tokens: MAX_TOKENS,
        // 不传 temperature：reasoning 模型锁定为 1，显式传会 400
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM 返回空内容");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function extractJsonArray(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  // 兼容模型包一层 {"questions": [...]} 的情况
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) return JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    const obj = JSON.parse(cleaned.slice(objStart, objEnd + 1)) as Record<string, unknown>;
    const arr = Object.values(obj).find(Array.isArray);
    if (arr) return arr;
  }
  throw new Error("响应中未找到 JSON 数组");
}

function buildMessages(file: ScopedFile, retryHint?: string): Array<{ role: "system" | "user"; content: string }> {
  const system = [
    "你是技术面试题库构建专家，正在为 AI Infra 岗位（CUDA/GPU、C++、算法、项目经历）的模拟面试准备题库。给你一篇学习材料，请从中抽取适合口头面试的题目。",
    "",
    "【抽取要求】",
    "1. 每道题对应一个可独立提问、可口头回答的知识点；一篇材料抽 0–5 题。",
    "2. 纯学习计划/任务清单/日程/资源链接类内容没有面试价值，直接返回 []。",
    `3. category 原则上取 "${file.categoryHint}"，仅在材料明显属于其他方向时可在 leetcode/cuda/knowledge 间调整。`,
    "4. title：简洁的题目名称（≤50 字），不带文件路径。",
    "5. content：面试时给候选人看的题面。若材料是学习笔记/实验记录/代码集合，改写为清晰的背景描述 + 明确问题（2–5 句）；不要整段粘贴代码或命令。",
    "6. difficulty：easy/medium/hard，按面试考察深度判断。",
    "7. tags：逗号分隔的 2–4 个关键词。",
    "8. followUps：3–5 个追问，由浅入深（细节澄清 → 边界/权衡 → 扩展延伸 → 实战关联），每条只含一个问题。",
    "9. keyPoints：评分要点（正确答案应覆盖的关键点，供评分对照，不向候选人展示）；以材料内容为据，不要编造材料中没有的结论。",
    `10. source：固定填 "${file.source}"。`,
    "",
    "【输出契约】只输出一个 JSON 数组（不要 markdown 代码块、不要任何解释文字），元素结构：",
    `{"category":"...","title":"...","content":"...","difficulty":"...","tags":"...","followUps":["..."],"keyPoints":"...","source":"..."}`,
    retryHint ? `\n【上次失败原因】${retryHint}，请修正后重新输出。` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const content =
    file.content.length > MAX_CONTENT_CHARS
      ? `${file.content.slice(0, MAX_CONTENT_CHARS)}\n\n（材料过长，已截断）`
      : file.content;
  return [
    { role: "system", content: system },
    { role: "user", content: `【材料路径】${file.path}\n\n【材料正文】\n${content}` },
  ];
}

async function extractFromFile(file: ScopedFile): Promise<BankItem[]> {
  let retryHint: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatCompletion(buildMessages(file, retryHint));
      return bankFileSchema.parse(extractJsonArray(raw));
    } catch (err) {
      retryHint = (err as Error).message.slice(0, 300);
      if (attempt === 1) throw new Error(`两次尝试均失败：${retryHint}`);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  if (!env.LLM_API_KEY) throw new Error("未配置 LLM_API_KEY，无法生成题库");

  await mkdir(DATA_DIR, { recursive: true });

  // 加载断点
  const done = new Map<string, BankItem[]>();
  try {
    const lines = (await readFile(CHECKPOINT_FILE, "utf8")).split("\n").filter(Boolean);
    for (const line of lines) {
      const rec = JSON.parse(line) as { path: string; questions: BankItem[] };
      done.set(rec.path, rec.questions);
    }
  } catch {
    // 无断点文件，从头开始
  }

  console.log("拉取仓库文件…");
  const { commitSha, files } = await fetchRepoFiles(OWNER, REPO);
  const scoped = scopeFiles(files);
  const todo = scoped.filter((f) => !done.has(f.path));
  console.log(`commit: ${commitSha || "(未知)"}；范围内文件 ${scoped.length} 个，已完成 ${done.size} 个，待生成 ${todo.length} 个`);

  let finished = done.size;
  let failed = 0;
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < todo.length) {
      const file = todo[cursor++];
      const started = Date.now();
      try {
        const questions = await extractFromFile(file);
        await appendFile(CHECKPOINT_FILE, `${JSON.stringify({ path: file.path, questions })}\n`);
        done.set(file.path, questions);
        finished += 1;
        console.log(`[${finished}/${scoped.length}] ${file.path} → ${questions.length} 题（${((Date.now() - started) / 1000).toFixed(1)}s）`);
      } catch (err) {
        failed += 1;
        finished += 1;
        console.warn(`[${finished}/${scoped.length}] ${file.path} 生成失败（跳过）：${(err as Error).message}`);
      }
    }
  });
  await Promise.all(workers);

  // 聚合落盘：按路径排序，赋 sourceKey
  const all: Array<BankItem & { sourceKey: string }> = [];
  for (const path of [...done.keys()].sort()) {
    const questions = done.get(path)!;
    questions.forEach((q, i) => {
      all.push({ ...q, sourceKey: `bank:${REPO}:${path}#${i}` });
    });
  }
  await writeFile(
    OUTPUT_FILE,
    `${JSON.stringify({ repo: REPO, commitSha, generatedAt: new Date().toISOString(), model: env.LLM_MODEL, questions: all }, null, 2)}\n`,
  );
  console.log(`\n完成：${all.length} 题（失败跳过 ${failed} 个文件）→ ${OUTPUT_FILE}`);
  console.log("下一步：pnpm --filter @interview/server bank:import");
}

await main();
