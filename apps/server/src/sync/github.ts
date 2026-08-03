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
  const workDir = await mkdtemp(path.join(tmpdir(), `repo-sync-${repo}-`));
  try {
    const tarPath = path.join(workDir, "repo.tar.gz");
    const [commitSha] = await Promise.all([
      fetchCommitSha(owner, repo),
      downloadTarball(owner, repo, tarPath),
    ]);
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

/**
 * 下载 tarball 到 destPath。优先用 curl：实测 Node fetch（undici）从 codeload 拉
 * 大仓库（ai-infra-notes ~58MB）body 会永久停滞，curl 正常（README §13.5）。
 * curl 不可用/失败时回退 fetch（小仓库没问题）。
 */
async function downloadTarball(owner: string, repo: string, destPath: string): Promise<void> {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/main`;
  try {
    await execFileAsync("curl", ["-fsSL", "--max-time", "600", "-o", destPath, url]);
    return;
  } catch (err) {
    const isMissing = (err as NodeJS.ErrnoException).code === "ENOENT";
    if (isMissing) {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`下载仓库 tarball 失败：${url} → HTTP ${res.status}`);
      await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
      return;
    }
    throw new Error(`下载仓库 tarball 失败：${url} → ${(err as Error).message}`);
  }
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
