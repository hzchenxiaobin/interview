import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoFile } from "@interview/contracts";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

/** 把 __fixtures__/{repo}/ 下的目录树读成 RepoFile[]（路径为仓库相对路径） */
export async function loadFixtures(repo: string): Promise<RepoFile[]> {
  const root = path.join(FIXTURES_DIR, repo);
  const files: RepoFile[] = [];
  await walk(root, "", files);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function walk(dir: string, prefix: string, out: RepoFile[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel, out);
    else out.push({ path: rel, content: await readFile(path.join(dir, entry.name), "utf8") });
  }
}
