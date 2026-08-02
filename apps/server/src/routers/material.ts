import { and, desc, eq, like, sql } from "drizzle-orm";
import { SYNC_REPOS, syncRepoSchema } from "@interview/contracts";
import { db } from "../db/client.js";
import { questions, repoSyncs } from "../db/schema.js";
import { syncRepo } from "../sync/index.js";
import { authedProcedure, router } from "../trpc.js";

export const materialRouter = router({
  /** 从 GitHub 同步一个仓库到题库（README §7.1） */
  syncRepo: authedProcedure.input(syncRepoSchema).mutation(async ({ input, ctx }) => {
    return syncRepo(ctx.userId, input.repo);
  }),

  /** 各仓库最近一次同步记录 + 各仓库有效题数 */
  syncStatus: authedProcedure.query(async ({ ctx }) => {
    const syncs = await db
      .select()
      .from(repoSyncs)
      .where(eq(repoSyncs.userId, ctx.userId))
      .orderBy(desc(repoSyncs.syncedAt), desc(repoSyncs.id));
    const latestByRepo = new Map<string, (typeof syncs)[number]>();
    for (const row of syncs) {
      if (!latestByRepo.has(row.repo)) latestByRepo.set(row.repo, row);
    }

    const counts = await db
      .select({
        repo: sql<string>`substring_index(${questions.sourceKey}, ':', 1)`,
        count: sql<number>`count(*)`,
      })
      .from(questions)
      .where(
        and(
          eq(questions.userId, ctx.userId),
          eq(questions.stale, 0),
          like(questions.sourceKey, "%:%"),
        ),
      )
      .groupBy(sql`substring_index(${questions.sourceKey}, ':', 1)`);
    const countByRepo = new Map(counts.map((r) => [r.repo, Number(r.count)]));

    return SYNC_REPOS.map((r) => ({
      repo: r.repo,
      owner: r.owner,
      questionCount: countByRepo.get(r.repo) ?? 0,
      lastSync: latestByRepo.get(r.repo) ?? null,
    }));
  }),
});
