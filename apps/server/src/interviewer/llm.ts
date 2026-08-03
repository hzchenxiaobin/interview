import {
  evaluationJsonSchema,
  type EvaluationResult,
  type GroupedTranscript,
  type IInterviewer,
  type InterviewContext,
  type Question,
  type QuestionEvaluation,
} from "@interview/contracts";
import { env } from "../env.js";
import { RuleBasedInterviewer } from "./rule.js";

// reasoning 模型（如 kimi-for-coding）评估调用常需 20–40s，15s 会全部超时降级
const TIMEOUT_MS = 60_000;
const MAX_TOKENS = 1024;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function chatCompletion(messages: ChatMessage[], maxTokens = MAX_TOKENS): Promise<string> {
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
        max_tokens: maxTokens,
        // 不传 temperature：部分模型（如 kimi-for-coding）锁定为 1，显式传 0.7 会 400
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}: ${await res.text().then((t) => t.slice(0, 200))}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("LLM 返回空内容");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** keyPoints 泄露检查：面试官发言不得整句复用评分要点 */
function leaksKeyPoints(utterance: string, keyPoints: string): boolean {
  const sentences = keyPoints
    .split(/[。；;！!？?\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 10);
  return sentences.some((s) => utterance.includes(s));
}

/** 开场问题 prompt：把原始材料重写为清晰的面试问题（学习笔记/命令记录类材料尤其需要） */
function buildOpeningMessages(question: Question, targetRole: string): ChatMessage[] {
  const system = [
    `你是一位资深技术面试官，正在面试${targetRole}岗位的候选人，现在要向候选人抛出一道新题。`,
    "",
    `【题目材料】标题：${question.title}（方向：${question.category}，难度：${question.difficulty}）`,
    question.content.slice(0, 3000),
    question.keyPoints ? `【评分要点】（仅供你把握考点，严禁泄露给候选人）\n${question.keyPoints}` : "",
    "",
    "【任务】把上面的材料转化为你要对候选人说的话：",
    "1. 若材料本身已是清晰的面试题，直接基于它提问（可精简转述，保留必要细节）；",
    "2. 若材料是学习笔记、实验记录、代码或命令集合，先用一两句话向候选人介绍背景，再提出一个明确、可口头回答的问题；",
    "3. 只提一个问题，禁止复合提问；不要泄露评分要点；",
    "4. 材料中的代码/命令如与问题强相关可少量引用，不要整段粘贴。",
    "",
    "【输出契约】只输出你对候选人说的话本身，不要旁白、标签或引号。",
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: "请给出你的开场问题。" },
  ];
}

function interviewerSystemPrompt(ctx: InterviewContext): string {
  const { question, followUpIndex, targetRole } = ctx;
  return [
    `你是一位资深技术面试官，正在面试${targetRole}岗位的候选人。`,
    "",
    `【当前题目】${question.title}（方向：${question.category}，难度：${question.difficulty}）`,
    `【题面】${question.content}`,
    question.followUps.length > 0
      ? `【预设追问方向】\n${question.followUps.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
      : "",
    question.keyPoints
      ? `【评分要点】（仅作为你追问的灵感参考，严禁原句泄露给候选人）\n${question.keyPoints}`
      : "",
    "",
    "【行为约束】",
    "1. 每次只输出一个问题，禁止复合追问（A？B？C？）；",
    "2. 追问由浅入深：细节澄清 → 边界/权衡 → 扩展延伸 → 实战关联；",
    "3. 保持专业与适度压力感，不重复候选人已经答过的内容；",
    "4. 不要泄露评分要点或参考答案；",
    `5. 这是本题的第 ${followUpIndex + 1} 个追问。`,
    "",
    "【输出契约】只输出面试官的下一句发言本身，不要加旁白、标签或引号。",
  ]
    .filter(Boolean)
    .join("\n");
}

/** 上下文裁剪：当前题 + 最近 6 条消息（README §6.2 成本控制） */
function buildUtteranceMessages(ctx: InterviewContext): ChatMessage[] {
  const recent = ctx.history.slice(-6);
  const historyText = recent
    .map((m) => `${m.role === "interviewer" ? "面试官" : m.role === "candidate" ? "候选人" : "系统"}：${m.content}`)
    .join("\n\n");
  return [
    { role: "system", content: interviewerSystemPrompt(ctx) },
    { role: "user", content: `【对话历史】\n${historyText}\n\n请给出你的下一句发言。` },
  ];
}

function buildEvaluationMessages(transcript: GroupedTranscript): ChatMessage[] {
  const perQuestion = transcript.groups
    .map(({ question, messages }, i) => {
      const dialog = messages
        .map((m) => `${m.role === "interviewer" ? "面试官" : m.role === "candidate" ? "候选人" : "系统"}：${m.content}`)
        .join("\n");
      return [
        `### 第 ${i + 1} 题（questionId=${question.id}，方向=${question.category}）`,
        `题目：${question.title}`,
        `评分要点：${question.keyPoints || "（无）"}`,
        `对话：\n${dialog || "（候选人未作答）"}`,
      ].join("\n");
    })
    .join("\n\n");

  const system = [
    `你是一位资深技术面试官，请根据整场面试对话对候选人（应聘${transcript.targetRole}）进行结构化评估。`,
    "",
    "【评分维度】按题目方向选择：",
    "- leetcode：正确性、复杂度分析、边界处理、表达清晰度",
    "- cuda：概念正确性、性能意识、工具链实践、表达清晰度",
    "- knowledge：准确性、深度、工程权衡、表达清晰度；项目经历题按 STAR（情境/任务/行动/结果）评估",
    "",
    "【输出契约】只输出一个 JSON 对象（不要 markdown 代码块），结构：",
    `{"overallGrade":"A|B|C|D","summary":"一句话总评","questions":[{"questionId":数字,"dimensions":[{"name":"维度名","grade":"A|B|C|D"}],"diagnosis":"诊断","suggestion":"改进建议"}],"weakDimensions":["薄弱维度Top2"]}`,
    "questions 数组必须覆盖每一道题，questionId 与输入一致；diagnosis/suggestion 用中文、具体、可执行。",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: `【整场面试记录】\n\n${perQuestion}` },
  ];
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("响应中未找到 JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** LLM 面试官（README §6.2）：OpenAI 兼容协议，故障时单次降级规则引擎 */
export class LlmInterviewer implements IInterviewer {
  private fallback = new RuleBasedInterviewer();

  async openingQuestion(question: Question, targetRole: string): Promise<string> {
    try {
      const utterance = await chatCompletion(buildOpeningMessages(question, targetRole), 2048);
      if (leaksKeyPoints(utterance, question.keyPoints)) {
        console.warn(`[llm] 开场问题疑似泄露评分要点（题 ${question.id}），降级模板`);
        return this.fallback.openingQuestion(question, targetRole);
      }
      return utterance;
    } catch (err) {
      console.warn(`[llm] 开场问题生成失败（${(err as Error).message}），降级模板`);
      return this.fallback.openingQuestion(question, targetRole);
    }
  }

  async nextUtterance(ctx: InterviewContext): Promise<string> {
    try {
      // reasoning 模型会先消耗思考 token，预算太小会全部耗在 reasoning 上导致 content 为空
      const utterance = await chatCompletion(buildUtteranceMessages(ctx), 2048);
      if (leaksKeyPoints(utterance, ctx.question.keyPoints)) {
        console.warn(`[llm] 追问疑似泄露评分要点（题 ${ctx.question.id}），降级预设追问`);
        return this.fallback.nextUtterance(ctx);
      }
      return utterance;
    } catch (err) {
      console.warn(`[llm] 追问失败（${(err as Error).message}），降级预设追问`);
      return this.fallback.nextUtterance(ctx);
    }
  }

  async evaluate(transcript: GroupedTranscript): Promise<EvaluationResult> {
    const messages = buildEvaluationMessages(transcript);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const raw = await chatCompletion(messages, 8192);
        const parsed = evaluationJsonSchema.parse(extractJson(raw));
        const byId = new Map(transcript.groups.map((g) => [g.question.id, g.question]));
        const questions: QuestionEvaluation[] = parsed.questions
          .filter((q) => byId.has(q.questionId))
          .map((q) => {
            const question = byId.get(q.questionId)!;
            return {
              questionId: q.questionId,
              title: question.title,
              category: question.category,
              dimensions: q.dimensions,
              diagnosis: q.diagnosis,
              suggestion: q.suggestion,
            };
          });
        // LLM 漏题时补规则评分
        const covered = new Set(questions.map((q) => q.questionId));
        const missing = transcript.groups.filter((g) => !covered.has(g.question.id));
        if (missing.length > 0) {
          const fallbackResult = await this.fallback.evaluate({
            ...transcript,
            groups: missing,
          });
          questions.push(...fallbackResult.questions);
        }
        questions.sort(
          (a, b) =>
            transcript.groups.findIndex((g) => g.question.id === a.questionId) -
            transcript.groups.findIndex((g) => g.question.id === b.questionId),
        );
        return {
          overallGrade: parsed.overallGrade,
          summary: parsed.summary,
          questions,
          weakDimensions: parsed.weakDimensions,
          evaluatedBy: "llm",
        };
      } catch (err) {
        console.warn(`[llm] 评估第 ${attempt + 1} 次失败：${(err as Error).message}`);
      }
    }
    console.warn("[llm] 评估重试仍失败，降级规则引擎");
    return this.fallback.evaluate(transcript);
  }
}
