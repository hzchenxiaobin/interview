import { createHash } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import {
  SYNC_REPOS,
  type ParsedQuestion,
  type RepoFile,
  type SyncRepoInput,
  type SyncResult,
} from "@interview/contracts";
import { db } from "../db/client.js";
import { questions, repoSyncs } from "../db/schema.js";
import { fetchRepoFiles } from "./github.js";
import { parse as parseAiInfraNotes } from "./parsers/aiInfraNotes.js";
import { parse as parseLeetcode } from "./parsers/leetcode.js";
import { parse as parseLeetgpu } from "./parsers/leetgpu.js";
import type { ParseOutput } from "./parsers/utils.js";

const PARSERS: Record<SyncRepoInput["repo"], (files: RepoFile[]) => ParseOutput> = {
  leetcode: parseLeetcode,
  leetgpu: parseLeetgpu,
  "ai-infra-notes": parseAiInfraNotes,
};

const STALE_PREFIX = "[已失效] ";
/** 批量 insert 分块大小（防 max_allowed_packet） */
const INSERT_CHUNK = 100;

export function contentHash(q: ParsedQuestion): string {
  return createHash("sha256")
    .update([q.title, q.content, q.followUps.join(""), q.keyPoints].join(""))
    .digest("hex");
}

/**
 * 同步一个 GitHub 仓库到题库（README §7.1）：
 * 拉取 → 解析 → 幂等入库（sourceKey + contentHash）→ 失效标记 → 写 repoSyncs。
 * stale 判定只针对该仓库来源（sourceKey 以 `{repo}:` 开头）的题目。
 */
export async function syncRepo(userId: number, repoName: SyncRepoInput["repo"]): Promise<SyncResult> {
  const repoMeta = SYNC_REPOS.find((r) => r.repo === repoName);
  if (!repoMeta) throw new Error(`未知仓库：${repoName}`);

  const { commitSha, files } = await fetchRepoFiles(repoMeta.owner, repoMeta.repo);
  const { questions: parsed, skipped } = PARSERS[repoName](files);

  const existing = await db
    .select()
    .from(questions)
    .where(and(eq(questions.userId, userId), like(questions.sourceKey, `${repoName}:%`)));
  const bySourceKey = new Map(existing.map((row) => [row.sourceKey, row]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const toInsert: Array<typeof questions.$inferInsert> = [];
  const seenKeys = new Set<string>();

  for (const q of parsed) {
    seenKeys.add(q.sourceKey);
    const hash = contentHash(q);
    const row = bySourceKey.get(q.sourceKey);

    if (row && row.contentHash === hash && row.stale === 0) {
      unchanged += 1;
      continue;
    }
    if (row) {
      // 内容变化，或之前被标 stale 的题目重新出现（复活）
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

  // 本次未出现的该仓库来源题目 → 标记 stale（保留行，source 加前缀）
  let markedStale = 0;
  for (const row of existing) {
    if (seenKeys.has(row.sourceKey) || row.stale === 1) continue;
    await db
      .update(questions)
      .set({
        stale: 1,
        source: row.source.startsWith(STALE_PREFIX) ? row.source : `${STALE_PREFIX}${row.source}`,
      })
      .where(and(eq(questions.id, row.id), eq(questions.userId, userId)));
    markedStale += 1;
  }

  await db.insert(repoSyncs).values({
    userId,
    repo: repoName,
    commitSha,
    questionCount: parsed.length,
  });

  return { repo: repoName, commitSha, inserted, updated, unchanged, markedStale, skippedFiles: skipped };
}
