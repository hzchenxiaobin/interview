/**
 * 把 LLM 生成的静态题库（data/question-bank.ai-infra.json）导入数据库：
 * - sourceKey（bank:ai-infra-notes:...）+ contentHash 幂等 upsert，重复导入不变跳过；
 * - 规则解析的 ai-infra-notes 题目（sourceKey 以 "ai-infra-notes:" 开头）全部标记
 *   stale（LLM 版替代规则版，保留行以保护历史场次快照）。
 *
 * 运行：pnpm --filter @interview/server bank:import
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { and, eq, like } from "drizzle-orm";
import { questionInputSchema } from "@interview/contracts";
import { z } from "zod";
import { getCurrentUserId } from "../src/auth.js";
import { db } from "../src/db/client.js";
import { questions } from "../src/db/schema.js";
import { contentHash } from "../src/sync/index.js";

const BANK_FILE = fileURLToPath(new URL("../data/question-bank.ai-infra.json", import.meta.url));
const BANK_KEY_PREFIX = "bank:ai-infra-notes:";
const RULE_KEY_PREFIX = "ai-infra-notes:";
const STALE_PREFIX = "[已失效] ";
const INSERT_CHUNK = 100;

const bankFileSchema = z.object({
  questions: z.array(questionInputSchema.extend({ sourceKey: z.string().min(1) })),
});

async function main() {
  const bank = bankFileSchema.parse(JSON.parse(await readFile(BANK_FILE, "utf8")));
  const userId = await getCurrentUserId();
  console.log(`题库文件 ${bank.questions.length} 题，导入 userId=${userId}`);

  const existing = await db
    .select()
    .from(questions)
    .where(and(eq(questions.userId, userId), like(questions.sourceKey, `${BANK_KEY_PREFIX}%`)));
  const bySourceKey = new Map(existing.map((row) => [row.sourceKey, row]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const toInsert: Array<typeof questions.$inferInsert> = [];
  const seenKeys = new Set<string>();

  for (const q of bank.questions) {
    seenKeys.add(q.sourceKey);
    const hash = contentHash(q);
    const row = bySourceKey.get(q.sourceKey);
    if (row && row.contentHash === hash && row.stale === 0) {
      unchanged += 1;
      continue;
    }
    if (row) {
      await db
        .update(questions)
        .set({
          category: q.category,
          title: q.title,
          content: q.content,
          difficulty: q.difficulty,
          tags: q.tags,
          followUps: q.followUps,
          keyPoints: q.keyPoints,
          source: row.source.startsWith(STALE_PREFIX) ? row.source.slice(STALE_PREFIX.length) : q.source,
          contentHash: hash,
          stale: 0,
        })
        .where(and(eq(questions.id, row.id), eq(questions.userId, userId)));
      updated += 1;
    } else {
      toInsert.push({ ...q, userId, contentHash: hash });
    }
  }
  for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
    await db.insert(questions).values(toInsert.slice(i, i + INSERT_CHUNK));
  }
  inserted = toInsert.length;

  // 题库文件中已删除的条目 → stale
  let bankStale = 0;
  for (const row of existing) {
    if (seenKeys.has(row.sourceKey) || row.stale === 1) continue;
    await db
      .update(questions)
      .set({
        stale: 1,
        source: row.source.startsWith(STALE_PREFIX) ? row.source : `${STALE_PREFIX}${row.source}`,
      })
      .where(and(eq(questions.id, row.id), eq(questions.userId, userId)));
    bankStale += 1;
  }

  // 替代语义：规则解析的 ai-infra-notes 题目全部标记 stale
  const ruleRows = await db
    .select({ id: questions.id, source: questions.source })
    .from(questions)
    .where(
      and(
        eq(questions.userId, userId),
        like(questions.sourceKey, `${RULE_KEY_PREFIX}%`),
        eq(questions.stale, 0),
      ),
    );
  for (const row of ruleRows) {
    await db
      .update(questions)
      .set({
        stale: 1,
        source: row.source.startsWith(STALE_PREFIX) ? row.source : `${STALE_PREFIX}${row.source}`,
      })
      .where(and(eq(questions.id, row.id), eq(questions.userId, userId)));
  }

  console.log(
    `导入完成：新增 ${inserted}，更新 ${updated}，未变 ${unchanged}，bank 条目失效 ${bankStale}；` +
      `规则解析题目标记失效 ${ruleRows.length}（保留行，source 加「${STALE_PREFIX.trim()}」前缀）`,
  );
  process.exit(0);
}

await main();
