import { and, desc, eq, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { CATEGORIES, questionInputSchema, questionListFilterSchema } from "@interview/contracts";
import { db } from "../db/client.js";
import { questions } from "../db/schema.js";
import { authedProcedure, router } from "../trpc.js";
import { SEED_QUESTIONS } from "../seed.js";

export const questionRouter = router({
  list: authedProcedure.input(questionListFilterSchema).query(async ({ input, ctx }) => {
    const conditions = [eq(questions.userId, ctx.userId), eq(questions.stale, 0)];
    if (input.category) conditions.push(eq(questions.category, input.category));
    if (input.difficulty) conditions.push(eq(questions.difficulty, input.difficulty));
    if (input.search) conditions.push(like(questions.title, `%${input.search}%`));
    const where = and(...conditions);

    const [items, total] = await Promise.all([
      db
        .select()
        .from(questions)
        .where(where)
        .orderBy(desc(questions.updatedAt))
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize),
      db.select({ count: sql<number>`count(*)` }).from(questions).where(where),
    ]);
    return { items, total: Number(total[0].count), page: input.page, pageSize: input.pageSize };
  }),

  stats: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ category: questions.category, count: sql<number>`count(*)` })
      .from(questions)
      .where(and(eq(questions.userId, ctx.userId), eq(questions.stale, 0)))
      .groupBy(questions.category);
    const byCategory: Record<string, number> = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    for (const r of rows) byCategory[r.category] = Number(r.count);
    return { byCategory, total: Object.values(byCategory).reduce((a, b) => a + b, 0) };
  }),

  /** ai-infra-notes 的考察范围（Dashboard 开始面试用）：按周（daily）与按专题（topics）。
   *  同时统计规则同步（ai-infra-notes:）与 LLM 题库（bank:ai-infra-notes:）两种 sourceKey。 */
  scopes: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({ sourceKey: questions.sourceKey })
      .from(questions)
      .where(
        and(
          eq(questions.userId, ctx.userId),
          eq(questions.stale, 0),
          like(questions.sourceKey, "%ai-infra-notes:aiinfra/%"),
        ),
      );
    const topics = new Map<string, number>();
    const weeks = new Map<string, number>();
    for (const { sourceKey } of rows) {
      const m = /^(?:bank:)?ai-infra-notes:aiinfra\/(topics|daily)\/([^/]+)\//.exec(sourceKey);
      if (!m) continue;
      const map = m[1] === "topics" ? topics : weeks;
      map.set(m[2], (map.get(m[2]) ?? 0) + 1);
    }
    const toList = (map: Map<string, number>, prefix: string) =>
      [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([name, count]) => ({ name, count, scope: `ai-infra-notes:aiinfra/${prefix}/${name}/` }));
    return { topics: toList(topics, "topics"), weeks: toList(weeks, "daily") };
  }),

  create: authedProcedure.input(questionInputSchema).mutation(async ({ input, ctx }) => {
    const inserted = await db
      .insert(questions)
      .values({ ...input, userId: ctx.userId, sourceKey: `manual:${crypto.randomUUID()}` })
      .$returningId();
    return { id: inserted[0].id };
  }),

  update: authedProcedure
    .input(z.object({ id: z.number(), data: questionInputSchema.partial() }))
    .mutation(async ({ input, ctx }) => {
      const result = await db
        .update(questions)
        .set(input.data)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.userId)));
      if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  remove: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const result = await db
        .delete(questions)
        .where(and(eq(questions.id, input.id), eq(questions.userId, ctx.userId)));
      if (result[0].affectedRows === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { ok: true as const };
    }),

  bulkImport: authedProcedure
    .input(z.object({ items: z.array(questionInputSchema).min(1) }))
    .mutation(async ({ input, ctx }) => {
      await db.insert(questions).values(
        input.items.map((item) => ({
          ...item,
          userId: ctx.userId,
          sourceKey: `manual:${crypto.randomUUID()}`,
        })),
      );
      return { imported: input.items.length };
    }),

  /** 播种内置题库（幂等，README §7.5） */
  seed: authedProcedure.mutation(async ({ ctx }) => {
    const existing = await db
      .select({ sourceKey: questions.sourceKey })
      .from(questions)
      .where(eq(questions.userId, ctx.userId));
    const existingKeys = new Set(existing.map((r) => r.sourceKey));
    const toInsert = SEED_QUESTIONS.filter((q) => !existingKeys.has(`seed:${q.title}`));
    if (toInsert.length > 0) {
      await db.insert(questions).values(
        toInsert.map((q) => ({ ...q, userId: ctx.userId, sourceKey: `seed:${q.title}` })),
      );
    }
    return { seeded: toInsert.length, skipped: SEED_QUESTIONS.length - toInsert.length };
  }),
});
