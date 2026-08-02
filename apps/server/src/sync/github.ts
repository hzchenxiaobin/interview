import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { RepoFile } from "@interview/contracts";

const execFileAsync = promisify(execFile);

/** 不收集的目录段与文件（图片资源、构建产物、仓库说明） */
const EXCLUDED_DIRS = new Set(["images", "build", "static", ".github"]);
const EXCLUDED_FILES = new Set(["SKILL.md"]);

export interface FetchRepoResult {
  commitSha: string;
  files: RepoFile[];
}

/**
 * 从 codeload.github.com 下载 main 分支 tarball 并收集仓库内 .md 文件。
 * 不用 api.github.com（未认证限流 60 次/小时），commitSha 走 `git ls-remote`。
 */
export async function fetchRepoFiles(owner: string, repo: string): Promise<FetchRepoResult> {
  const [commitSha, tarball] = await Promise.all([
    fetchCommitSha(owner, repo),
    downloadTarball(owner, repo),
  ]);

  const workDir = await mkdtemp(path.join(tmpdir(), `repo-sync-${repo}-`));
  try {
    const tarPath = path.join(workDir, "repo.tar.gz");
    await writeFile(tarPath, tarball);
    await execFileAsync("tar", ["-xzf", tarPath, "-C", workDir]);

    // 顶层目录名形如 `{repo}-main`（codeload 分支 tarball 不带 sha）
    const topDirs = (await readdir(workDir, { withFileTypes: true })).filter(
      (e) => e.isDirectory(),
    );
    if (topDirs.length !== 1) {
      throw new Error(`tarball 解压后顶层目录异常：${topDirs.map((d) => d.name).join(", ")}`);
    }
    const root = path.join(workDir, topDirs[0].name);

    const files: RepoFile[] = [];
    await collectMarkdown(root, "", files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { commitSha, files };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function fetchCommitSha(owner: string, repo: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", [
      "ls-remote",
      `https://github.com/${owner}/${repo}.git`,
      "refs/heads/main",
    ]);
    return stdout.split(/\s/)[0] ?? "";
  } catch {
    // sha 只用于同步记录展示，拿不到不阻塞同步
    return "";
  }
}

async function downloadTarball(owner: string, repo: string): Promise<Buffer> {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/main`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`下载仓库 tarball 失败：${url} → HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function collectMarkdown(dir: string, prefix: string, out: RepoFile[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await collectMarkdown(path.join(dir, entry.name), rel, out);
      }
    } else if (entry.name.endsWith(".md") && !EXCLUDED_FILES.has(entry.name)) {
      out.push({ path: rel, content: await readFile(path.join(dir, entry.name), "utf8") });
    }
  }
}
