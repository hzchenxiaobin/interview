import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  CATEGORY_LABELS,
  MAX_FOLLOW_UPS,
  startInterviewSchema,
  type Category,
  type GroupedTranscript,
  type InterviewMessage,
  type InterviewState,
  type Question,
  renderReportMarkdown,
} from "@interview/contracts";
import { db } from "../db/client.js";
import { interviewMessages, interviewSessions, questions } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";
import { getInterviewer, isLlmEnabled } from "../interviewer/factory.js";

type SessionRow = typeof interviewSessions.$inferSelect;
type MessageRow = typeof interviewMessages.$inferSelect;

function toQuestion(row: typeof questions.$inferSelect): Question {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    content: row.content,
    difficulty: row.difficulty,
    tags: row.tags,
    followUps: row.followUps ?? [],
    keyPoints: row.keyPoints,
    source: row.source,
  };
}

function toMessage(row: MessageRow): InterviewMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    questionId: row.questionId,
    role: row.role,
    content: row.content,
    createdAt: row.createdAt,
  };
}

async function loadSession(sessionId: number, userId: number): Promise<SessionRow> {
  const rows = await db
    .select()
    .from(interviewSessions)
    .where(and(eq(interviewSessions.id, sessionId), eq(interviewSessions.userId, userId)))
    .limit(1);
  if (rows.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "场次不存在" });
  return rows[0];
}

async function loadQuestionsByIds(ids: number[]): Promise<Map<number, Question>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select().from(questions).where(inArray(questions.id, ids));
  return new Map(rows.map((r) => [r.id, toQuestion(r)]));
}

function stateOf(session: SessionRow): InterviewState {
  return {
    sessionId: session.id,
    status: session.status,
    currentIndex: session.currentIndex,
    followUpIndex: session.followUpIndex,
    totalQuestions: session.questionIds.length,
  };
}

/** 按方向比例分配题量：每方向至少 1 题（题量允许且该方向有题时），剩余按比例 */
function allocateCounts(pool: Map<Category, number>, count: number): Map<Category, number> {
  const cats = [...pool.keys()];
  const total = [...pool.values()].reduce((a, b) => a + b, 0);
  const alloc = new Map<Category, number>();
  let remaining = count;
  for (const c of cats) {
    if (remaining <= 0) break;
    alloc.set(c, 1);
    remaining -= 1;
  }
  for (const c of cats) {
    if (remaining <= 0) break;
    const share = Math.min(
      Math.max(Math.round((pool.get(c)! / total) * count) - 1, 0),
      pool.get(c)! - alloc.get(c)!,
      remaining,
    );
    if (share > 0) {
      alloc.set(c, alloc.get(c)! + share);
      remaining -= share;
    }
  }
  // 仍有剩余则轮转补满（受各方向库存限制）
  let i = 0;
  while (remaining > 0 && i < cats.length * 10) {
    const c = cats[i % cats.length];
    if (alloc.get(c)! < pool.get(c)!) {
      alloc.set(c, alloc.get(c)! + 1);
      remaining -= 1;
    }
    i += 1;
  }
  return alloc;
}

/** scope 前缀 → 展示名（"ai-infra-notes:aiinfra/daily/week1/" → "Week 1"，topics/cuda → "cuda 专题"） */
function scopeLabel(scope: string): string {
  const week = /daily\/(week)(\d+)\//.exec(scope);
  if (week) return `Week ${Number(week[2])}`;
  const topic = /topics\/([^/]+)\//.exec(scope);
  if (topic) return `${topic[1]} 专题`;
  return scope;
}

export const interviewRouter = router({
  start: authedProcedure.input(startInterviewSchema).mutation(async ({ input, ctx }) => {
    const scope = input.scope?.trim() || undefined;
    if (scope && !scope.startsWith("ai-infra-notes:")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "非法的考察范围" });
    }
    const rows = await db
      .select()
      .from(questions)
      .where(
        scope
          ? and(eq(questions.userId, ctx.userId), eq(questions.stale, 0), like(questions.sourceKey, `${scope}%`))
          : and(eq(questions.userId, ctx.userId), eq(questions.stale, 0), inArray(questions.category, input.categories)),
      );
    if (rows.length === 0) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: scope
          ? "该考察范围的题库为空，请先在题库页同步 GitHub 仓库"
          : "所选方向的题库为空，请先在题库页同步 GitHub 仓库或一键播种",
      });
    }

    const byCat = new Map<Category, typeof rows>();
    for (const r of rows) {
      const arr = byCat.get(r.category) ?? [];
      arr.push(r);
      byCat.set(r.category, arr);
    }
    const alloc = allocateCounts(new Map([...byCat].map(([c, arr]) => [c, arr.length])), input.count);
    const picked: (typeof rows)[number][] = [];
    for (const [cat, n] of alloc) {
      const pool = [...byCat.get(cat)!].sort(() => Math.random() - 0.5);
      picked.push(...pool.slice(0, n));
    }
    // 题目顺序：方向间交替打乱不如按方向聚类清晰，此处按抽取顺序随机排序
    picked.sort(() => Math.random() - 0.5);

    const now = new Date();
    const mmdd = `${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const pickedCategories = [...new Set(picked.map((q) => q.category))];
    const catLabels = scope
      ? scopeLabel(scope)
      : input.categories.map((c) => CATEGORY_LABELS[c]).join("+");
    const title = scope ? `${catLabels}专项面试 ${mmdd}` : `${catLabels}混合面试 ${mmdd}`;

    const questionIds = picked.map((q) => q.id);
    const first = toQuestion(picked[0]);
    const firstQuestion = await getInterviewer().openingQuestion(first, "AI Infra 工程师");
    const opening =
      `你好，我是今天的面试官。本场面试共 ${picked.length} 道题（${catLabels}），我会一次问一个问题，可能会有一些追问。\n\n` +
      `我们开始第一题：\n\n${firstQuestion}`;

    const sessionId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(interviewSessions)
        .values({
          userId: ctx.userId,
          title,
          categories: scope ? pickedCategories : input.categories,
          questionIds,
          currentIndex: 0,
          followUpIndex: 0,
          status: "active",
        })
        .$returningId();
      await tx.insert(interviewMessages).values({
        sessionId: inserted[0].id,
        questionId: first.id,
        role: "interviewer",
        content: opening,
      });
      return inserted[0].id;
    });

    const session = await loadSession(sessionId, ctx.userId);
    const messages = await db
      .select()
      .from(interviewMessages)
      .where(eq(interviewMessages.sessionId, sessionId))
      .orderBy(asc(interviewMessages.id));
    return { state: stateOf(session), messages: messages.map(toMessage) };
  }),

  reply: authedProcedure
    .input(z.object({ sessionId: z.number(), content: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const session = await loadSession(input.sessionId, ctx.userId);
      if (session.status !== "active") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "本场面试已结束" });
      }
      const questionMap = await loadQuestionsByIds(session.questionIds);
      const currentId = session.questionIds[session.currentIndex];
      const current = questionMap.get(currentId);
      if (!current) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "当前题目已被删除，无法继续" });
      }

      // 写考生消息
      await db.insert(interviewMessages).values({
        sessionId: session.id,
        questionId: currentId,
        role: "candidate",
        content: input.content,
      });

      // LLM 模式可动态生成追问，上限 MAX_FOLLOW_UPS；规则引擎只按预设追问数量追问
      const maxFollowUps = isLlmEnabled() ? MAX_FOLLOW_UPS : Math.min(current.followUps.length, MAX_FOLLOW_UPS);
      let newIndex = session.currentIndex;
      let newFollowUpIndex = session.followUpIndex;
      let finished = false;
      let interviewerContent: string;
      let interviewerQuestionId: number | null = currentId;

      if (session.followUpIndex < maxFollowUps) {
        // 继续追问
        const historyRows = await db
          .select()
          .from(interviewMessages)
          .where(eq(interviewMessages.sessionId, session.id))
          .orderBy(asc(interviewMessages.id));
        const interviewer = getInterviewer();
        interviewerContent = await interviewer.nextUtterance({
          question: current,
          history: historyRows.map(toMessage),
          followUpIndex: session.followUpIndex,
          targetRole: "AI Infra 工程师",
        });
        newFollowUpIndex = session.followUpIndex + 1;
      } else if (session.currentIndex + 1 < session.questionIds.length) {
        // 换题
        newIndex = session.currentIndex + 1;
        newFollowUpIndex = 0;
        const next = questionMap.get(session.questionIds[newIndex]);
        if (!next) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "下一题已被删除，无法继续" });
        }
        interviewerContent = `好的，进入第 ${newIndex + 1} 题：\n\n${await getInterviewer().openingQuestion(next, "AI Infra 工程师")}`;
        interviewerQuestionId = next.id;
      } else {
        // 题目耗尽，结束
        finished = true;
        interviewerContent = "好，本场面试到此结束，感谢你的回答。正在生成评估报告…";
        interviewerQuestionId = null;
      }

      await db.insert(interviewMessages).values({
        sessionId: session.id,
        questionId: interviewerQuestionId,
        role: "interviewer",
        content: interviewerContent,
      });
      await db
        .update(interviewSessions)
        .set({ currentIndex: newIndex, followUpIndex: newFollowUpIndex })
        .where(eq(interviewSessions.id, session.id));

      if (finished) {
        await finishSession(session.id, ctx.userId);
      }
      const updated = await loadSession(session.id, ctx.userId);
      return { state: stateOf(updated), interviewerMessage: interviewerContent };
    }),

  finish: authedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      await loadSession(input.sessionId, ctx.userId);
      return finishSession(input.sessionId, ctx.userId);
    }),

  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.userId, ctx.userId))
      .orderBy(desc(interviewSessions.createdAt));
  }),

  /** 统计看板（README §8.3）：按方向等级分布 + 近 10 场趋势 */
  stats: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(interviewSessions)
      .where(and(eq(interviewSessions.userId, ctx.userId), eq(interviewSessions.status, "finished")))
      .orderBy(desc(interviewSessions.createdAt));

    const gradeScore: Record<string, number> = { A: 4, B: 3, C: 2, D: 1 };
    const byCategory = new Map<string, number[]>();
    for (const s of rows) {
      const score = gradeScore[s.overallGrade ?? ""] ?? 0;
      if (score === 0) continue;
      for (const cat of s.categories) {
        const arr = byCategory.get(cat) ?? [];
        arr.push(score);
        byCategory.set(cat, arr);
      }
    }
    const categoryAverages = [...byCategory.entries()].map(([category, scores]) => ({
      category,
      average: scores.reduce((a, b) => a + b, 0) / scores.length,
      sessions: scores.length,
    }));

    const trend = rows.slice(0, 10).reverse().map((s) => ({
      sessionId: s.id,
      title: s.title,
      overallGrade: s.overallGrade,
      score: gradeScore[s.overallGrade ?? ""] ?? null,
      createdAt: s.createdAt,
      durationMinutes:
        s.finishedAt && s.createdAt
          ? Math.max(1, Math.round((s.finishedAt.getTime() - s.createdAt.getTime()) / 60000))
          : null,
    }));

    return { totalFinished: rows.length, categoryAverages, trend };
  }),

  get: authedProcedure
    .input(z.object({ sessionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const session = await loadSession(input.sessionId, ctx.userId);
      const messages = await db
        .select()
        .from(interviewMessages)
        .where(eq(interviewMessages.sessionId, session.id))
        .orderBy(asc(interviewMessages.id));
      const questionMap = await loadQuestionsByIds(session.questionIds);
      return {
        session,
        messages: messages.map(toMessage),
        questions: Object.fromEntries(questionMap),
      };
    }),
});

/** 结束流程（README §5.2）：聚合消息 → 评分 → 写回报告 */
async function finishSession(sessionId: number, userId: number) {
  const session = await loadSession(sessionId, userId);
  if (session.status === "finished") {
    return { report: session.report, overallGrade: session.overallGrade };
  }
  const messageRows = await db
    .select()
    .from(interviewMessages)
    .where(eq(interviewMessages.sessionId, sessionId))
    .orderBy(asc(interviewMessages.id));
  const questionMap = await loadQuestionsByIds(session.questionIds);

  const groups = session.questionIds
    .map((qid) => {
      const question = questionMap.get(qid);
      if (!question) return null;
      return {
        question,
        messages: messageRows.filter((m) => m.questionId === qid).map(toMessage),
      };
    })
    .filter((g): g is NonNullable<typeof g> => g != null);

  const durationMinutes =
    session.createdAt && messageRows.length > 0
      ? Math.max(
          1,
          Math.round(
            (messageRows[messageRows.length - 1].createdAt.getTime() - session.createdAt.getTime()) / 60000,
          ),
        )
      : null;

  const transcript: GroupedTranscript = {
    groups,
    targetRole: "AI Infra 工程师",
    durationMinutes,
  };

  let result;
  try {
    result = await getInterviewer().evaluate(transcript);
  } catch (err) {
    console.error("LLM 评估失败，降级规则引擎：", err);
    const { RuleBasedInterviewer } = await import("../interviewer/rule.js");
    result = await new RuleBasedInterviewer().evaluate(transcript);
  }

  const report = renderReportMarkdown({
    sessionId,
    categories: session.categories as Category[],
    questionCount: session.questionIds.length,
    durationMinutes,
    result,
    keyPointsByQuestion: new Map(groups.map((g) => [g.question.id, g.question.keyPoints])),
  });

  await db
    .update(interviewSessions)
    .set({
      status: "finished",
      overallGrade: result.overallGrade,
      report,
      evaluatedBy: result.evaluatedBy,
      finishedAt: new Date(),
    })
    .where(eq(interviewSessions.id, sessionId));

  return { report, overallGrade: result.overallGrade };
}
