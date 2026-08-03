import { eq } from "drizzle-orm";
import { SYNC_REPOS } from "@interview/contracts";
import { db } from "./db/client.js";
import { questions } from "./db/schema.js";
import { getCurrentUserId } from "./auth.js";
import { env } from "./env.js";
import { SEED_QUESTIONS } from "./seed.js";
import { syncRepo } from "./sync/index.js";

/**
 * 启动时自动导入题库（后台执行，不阻塞服务监听）：
 * 1. 题库为空 → 先播种内置题（本地、秒级，保证立即可用）；
 * 2. 依次同步三个 GitHub 仓库（幂等：无变化跳过、变更 upsert、消失标 stale）。
 * 任何失败只打日志不影响服务；SYNC_ON_STARTUP=false 可关闭。
 */
export function autoImportOnStartup(): void {
  if (!env.SYNC_ON_STARTUP) {
    console.log("[startup] SYNC_ON_STARTUP=false，跳过题库自动导入");
    return;
  }
  void run().catch((err) => console.error("[startup] 题库自动导入异常：", err));
}

async function run(): Promise<void> {
  const userId = await getCurrentUserId();

  const existing = await db
    .select({ sourceKey: questions.sourceKey })
    .from(questions)
    .where(eq(questions.userId, userId));
  if (existing.length === 0) {
    await db.insert(questions).values(
      SEED_QUESTIONS.map((q) => ({ ...q, userId, sourceKey: `seed:${q.title}` })),
    );
    console.log(`[startup] 题库为空，已播种 ${SEED_QUESTIONS.length} 道内置题`);
  }

  for (const { repo } of SYNC_REPOS) {
    try {
      const result = await syncRepo(userId, repo);
      console.log(
        `[startup] 同步 ${repo} 完成：新增 ${result.inserted}，更新 ${result.updated}，无变化 ${result.unchanged}，失效 ${result.markedStale}`,
      );
    } catch (err) {
      console.warn(`[startup] 同步 ${repo} 失败（不影响服务）：${(err as Error).message}`);
    }
  }
}
