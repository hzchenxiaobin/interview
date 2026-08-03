import { z } from "zod";

// ---------------------------------------------------------------------------
// 枚举与常量（README §4.2）
// ---------------------------------------------------------------------------

export const CATEGORIES = ["leetcode", "cuda", "knowledge"] as const;
export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES);

export const CATEGORY_LABELS: Record<Category, string> = {
  leetcode: "Leetcode",
  cuda: "CUDA",
  knowledge: "专业知识",
};

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
export const difficultySchema = z.enum(DIFFICULTIES);

export const GRADES = ["A", "B", "C", "D"] as const;
export type Grade = (typeof GRADES)[number];
export const gradeSchema = z.enum(GRADES);

export const GRADE_SCORES: Record<Grade, number> = { A: 4, B: 3, C: 2, D: 1 };

export const SESSION_STATUSES = ["active", "finished"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const MESSAGE_ROLES = ["interviewer", "candidate", "system"] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

/** 每题最大追问数（README §5.2） */
export const MAX_FOLLOW_UPS = 4;

/** 单场面试题量上限（README §5.2） */
export const MAX_QUESTIONS_PER_SESSION = 10;

// ---------------------------------------------------------------------------
// 题库（README §4.2 questions + 附录 A）
// ---------------------------------------------------------------------------

export const questionInputSchema = z.object({
  category: categorySchema,
  title: z.string().min(1).max(500),
  content: z.string().min(1),
  difficulty: difficultySchema,
  tags: z.string().max(500).default(""),
  followUps: z.array(z.string()).default([]),
  keyPoints: z.string().default(""),
  source: z.string().max(255).default(""),
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionListFilterSchema = z.object({
  category: categorySchema.optional(),
  difficulty: difficultySchema.optional(),
  search: z.string().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export type QuestionListFilter = z.infer<typeof questionListFilterSchema>;

// ---------------------------------------------------------------------------
// 面试（README §5、§9）
// ---------------------------------------------------------------------------

export const startInterviewSchema = z
  .object({
    categories: z.array(categorySchema).default([]),
    count: z.number().int().min(1).max(MAX_QUESTIONS_PER_SESSION),
    /**
     * 考察范围（可选）：ai-infra-notes 的 sourceKey 前缀，
     * 如 "ai-infra-notes:aiinfra/daily/week1/"（按周）或
     * "ai-infra-notes:aiinfra/topics/cuda/"（按专题）。设置时忽略 categories。
     */
    scope: z.string().max(120).optional(),
  })
  .refine((v) => (v.scope ? true : v.categories.length > 0), {
    message: "请选择方向或考察范围",
  });
export type StartInterviewInput = z.infer<typeof startInterviewSchema>;

export interface InterviewState {
  sessionId: number;
  status: SessionStatus;
  currentIndex: number;
  followUpIndex: number;
  totalQuestions: number;
}

// ---------------------------------------------------------------------------
// 面试官引擎（README §6.1）
// ---------------------------------------------------------------------------

export interface Question {
  id: number;
  category: Category;
  title: string;
  content: string;
  difficulty: Difficulty;
  tags: string;
  followUps: string[];
  keyPoints: string;
  source: string;
}

export interface InterviewMessage {
  id: number;
  sessionId: number;
  questionId: number | null;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface InterviewContext {
  question: Question;
  history: InterviewMessage[];
  followUpIndex: number;
  targetRole: string;
}

/** 按题分组的对话记录（评估输入） */
export interface GroupedTranscript {
  groups: Array<{
    question: Question;
    messages: InterviewMessage[];
  }>;
  targetRole: string;
  durationMinutes: number | null;
}

/** 分方向评分维度（README §8.1） */
export const CATEGORY_DIMENSIONS: Record<Category, string[]> = {
  leetcode: ["正确性", "复杂度分析", "边界处理", "表达清晰度"],
  cuda: ["概念正确性", "性能意识", "工具链实践", "表达清晰度"],
  knowledge: ["准确性", "深度", "工程权衡", "表达清晰度"],
};

export interface QuestionEvaluation {
  questionId: number;
  title: string;
  category: Category;
  dimensions: Array<{ name: string; grade: Grade }>;
  diagnosis: string;
  suggestion: string;
}

export interface EvaluationResult {
  overallGrade: Grade;
  summary: string;
  questions: QuestionEvaluation[];
  weakDimensions: string[];
  evaluatedBy: "llm" | "rule";
}

export interface IInterviewer {
  /** 生成本题的开场问题（LLM 模式下会把原始材料重写为清晰的面试问题） */
  openingQuestion(question: Question, targetRole: string): Promise<string>;
  nextUtterance(ctx: InterviewContext): Promise<string>;
  evaluate(transcript: GroupedTranscript): Promise<EvaluationResult>;
}

// ---------------------------------------------------------------------------
// 评估 JSON schema（LLM 输出契约，README §6.2 / §8）
// ---------------------------------------------------------------------------

export const evaluationJsonSchema = z.object({
  overallGrade: gradeSchema,
  summary: z.string(),
  questions: z.array(
    z.object({
      questionId: z.number(),
      dimensions: z.array(z.object({ name: z.string(), grade: gradeSchema })).min(1),
      diagnosis: z.string(),
      suggestion: z.string(),
    }),
  ),
  weakDimensions: z.array(z.string()).default([]),
});
export type EvaluationJson = z.infer<typeof evaluationJsonSchema>;

// ---------------------------------------------------------------------------
// 报告渲染 + 综合等级映射（README §8.2 / 附录 B）
// ---------------------------------------------------------------------------

export function computeOverallGrade(evaluations: QuestionEvaluation[]): Grade {
  if (evaluations.length === 0) return "C";
  const scores = evaluations.flatMap((q) => q.dimensions.map((d) => GRADE_SCORES[d.grade]));
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg >= 3.5) return "A";
  if (avg >= 2.5) return "B";
  if (avg >= 1.5) return "C";
  return "D";
}

export function renderReportMarkdown(opts: {
  sessionId: number;
  categories: Category[];
  questionCount: number;
  durationMinutes: number | null;
  result: EvaluationResult;
  keyPointsByQuestion: Map<number, string>;
}): string {
  const { sessionId, categories, questionCount, durationMinutes, result, keyPointsByQuestion } = opts;
  const catLabels = categories.map((c) => CATEGORY_LABELS[c]).join("/");
  const duration = durationMinutes != null ? ` · ${durationMinutes} 分钟` : "";
  const lines: string[] = [];
  lines.push(`# 面试评估报告（场次 #${sessionId} · ${catLabels} · ${questionCount} 题${duration}）`);
  lines.push("");
  lines.push(`## 总评：${result.overallGrade}`);
  lines.push(result.summary);
  if (result.evaluatedBy === "rule") {
    lines.push("");
    lines.push("> 注：本次由规则引擎评估（未启用 LLM 或 LLM 降级）。");
  }
  for (const [i, q] of result.questions.entries()) {
    lines.push("");
    lines.push(`## 第 ${i + 1} 题：${q.title}（${q.category}）`);
    lines.push(`- ${q.dimensions.map((d) => `${d.name} ${d.grade}`).join(" · ")}`);
    lines.push(`- 诊断：${q.diagnosis}`);
    lines.push(`- 改进建议：${q.suggestion}`);
    const kp = keyPointsByQuestion.get(q.questionId);
    if (kp) lines.push(`- 参考要点对照：${kp}`);
  }
  if (result.weakDimensions.length > 0) {
    lines.push("");
    lines.push("## 专项训练建议");
    result.weakDimensions.forEach((w, i) => lines.push(`${i + 1}. ${w}`));
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// GitHub 同步（README §7.1）
// ---------------------------------------------------------------------------

export const SYNC_REPOS = [
  { owner: "hzchenxiaobin", repo: "leetcode" },
  { owner: "hzchenxiaobin", repo: "leetgpu" },
  { owner: "hzchenxiaobin", repo: "ai-infra-notes" },
] as const;

export const syncRepoSchema = z.object({
  repo: z.enum(["leetcode", "leetgpu", "ai-infra-notes"]),
});
export type SyncRepoInput = z.infer<typeof syncRepoSchema>;

export interface ParsedQuestion extends QuestionInput {
  /** 同步幂等键：repo:相对路径[:条目序号] */
  sourceKey: string;
}

export interface RepoFile {
  /** 仓库内相对路径 */
  path: string;
  content: string;
}

export interface SyncResult {
  repo: string;
  commitSha: string;
  inserted: number;
  updated: number;
  unchanged: number;
  markedStale: number;
  skippedFiles: string[];
}
