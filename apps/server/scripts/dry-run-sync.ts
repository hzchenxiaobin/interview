/**
 * 对三个真实仓库跑 dry-run 解析（只解析不入库），报告题数与跳过文件。
 * 运行：pnpm --filter @interview/server exec tsx scripts/dry-run-sync.ts
 */
import { SYNC_REPOS } from "@interview/contracts";
import { fetchRepoFiles } from "../src/sync/github.js";
import { parse as parseAiInfraNotes } from "../src/sync/parsers/aiInfraNotes.js";
import { parse as parseLeetcode } from "../src/sync/parsers/leetcode.js";
import { parse as parseLeetgpu } from "../src/sync/parsers/leetgpu.js";
import type { ParseOutput } from "../src/sync/parsers/utils.js";

const PARSERS: Record<string, (files: import("@interview/contracts").RepoFile[]) => ParseOutput> = {
  leetcode: parseLeetcode,
  leetgpu: parseLeetgpu,
  "ai-infra-notes": parseAiInfraNotes,
};

for (const { owner, repo } of SYNC_REPOS) {
  console.log(`\n=== ${owner}/${repo} ===`);
  const { commitSha, files } = await fetchRepoFiles(owner, repo);
  console.log(`commit: ${commitSha || "(未知)"}，markdown 文件 ${files.length} 个`);
  const { questions, skipped } = PARSERS[repo](files);

  const byCategory: Record<string, number> = {};
  let noFollowUps = 0;
  let noKeyPoints = 0;
  for (const q of questions) {
    byCategory[q.category] = (byCategory[q.category] ?? 0) + 1;
    if (q.followUps.length === 0) noFollowUps += 1;
    if (!q.keyPoints) noKeyPoints += 1;
  }
  console.log(`解析出 ${questions.length} 题`, byCategory);
  console.log(`  无 followUps: ${noFollowUps}，无 keyPoints: ${noKeyPoints}`);
  console.log(`  跳过文件 ${skipped.length} 个：`);
  for (const s of skipped) console.log(`    - ${s}`);
}
