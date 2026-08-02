import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CATEGORIES, CATEGORY_LABELS, DIFFICULTIES, type Category, type Difficulty } from "@interview/contracts";
import { queryClient, trpc, type QuestionListItem } from "../../lib/trpc";
import { Button, Card, EmptyBox, ErrorBox, Loading } from "../../components/ui";
import { DIFFICULTY_LABELS } from "../../lib/format";
import { QuestionCard } from "./QuestionCard";
import { QuestionFormModal } from "./QuestionFormModal";
import { ImportModal } from "./ImportModal";

const PAGE_SIZE = 10;

/** GitHub 同步仓库白名单（与后端 syncRepoSchema 一致） */
const SYNC_REPOS = ["leetcode", "leetgpu", "ai-infra-notes"] as const;
type SyncRepoName = (typeof SYNC_REPOS)[number];

export default function BankPage() {
  const [category, setCategory] = useState<"all" | Category>("all");
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionListItem | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // 搜索防抖
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useQuery(
    trpc.question.list.queryOptions({
      category: category === "all" ? undefined : category,
      difficulty: difficulty === "all" ? undefined : difficulty,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  );

  const seed = useMutation(
    trpc.question.seed.mutationOptions({
      onSuccess: (r) => {
        setNotice(`播种完成：新增 ${r.seeded} 题，跳过已存在 ${r.skipped} 题`);
        queryClient.invalidateQueries();
      },
      onError: (e) => setNotice(`播种失败：${e.message}`),
    }),
  );

  const syncStatus = useQuery(trpc.material.syncStatus.queryOptions());
  const [syncingRepo, setSyncingRepo] = useState<SyncRepoName | null>(null);
  const syncRepo = useMutation(
    trpc.material.syncRepo.mutationOptions({
      onSuccess: (r) => {
        setSyncingRepo(null);
        setNotice(
          `同步 ${r.repo} 完成（${r.commitSha.slice(0, 7) || "unknown"}）：新增 ${r.inserted}、更新 ${r.updated}、未变 ${r.unchanged}、标记失效 ${r.markedStale}` +
            (r.skippedFiles.length > 0 ? `，跳过 ${r.skippedFiles.length} 个文件` : ""),
        );
        queryClient.invalidateQueries();
      },
      onError: (e) => {
        setSyncingRepo(null);
        setNotice(`同步失败：${e.message}`);
      },
    }),
  );

  const totalPages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">题库管理</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            新增题目
          </Button>
          <Button variant="secondary" onClick={() => setImportOpen(true)}>
            批量导入
          </Button>
          <Button
            variant="secondary"
            disabled={seed.isPending}
            onClick={() => {
              setNotice(null);
              seed.mutate();
            }}
          >
            {seed.isPending ? "播种中…" : "一键播种"}
          </Button>
        </div>
      </div>

      {/* GitHub 同步 */}
      <Card className="border-dashed bg-gray-50">
        <div className="mb-2 text-xs font-medium text-gray-500">从 GitHub 同步</div>
        <div className="flex flex-wrap gap-2">
          {SYNC_REPOS.map((repo) => (
            <Button
              key={repo}
              variant="secondary"
              disabled={syncingRepo !== null}
              onClick={() => {
                setNotice(null);
                setSyncingRepo(repo);
                syncRepo.mutate({ repo });
              }}
            >
              {syncingRepo === repo ? "同步中…（约 1 分钟）" : `同步 ${repo}`}
            </Button>
          ))}
        </div>
        <div className="mt-2 text-xs text-gray-400">
          {syncStatus.data && syncStatus.data.some((s) => s.lastSync) ? (
            syncStatus.data.map((s) => (
              <span key={s.repo} className="mr-4">
                {s.repo}：{s.questionCount} 题 · 最近同步{" "}
                {s.lastSync ? new Date(s.lastSync.syncedAt).toLocaleString("zh-CN") : "—"}
              </span>
            ))
          ) : (
            <span>尚未同步过，点击上方按钮从 GitHub 仓库解析入库。</span>
          )}
        </div>
      </Card>

      {notice && (
        <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</div>
      )}

      {/* 筛选 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(["all", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setCategory(c);
                setPage(1);
              }}
              className={`rounded-md px-3 py-1 text-sm ${
                category === c ? "bg-white font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {c === "all" ? "全部" : CATEGORY_LABELS[c]}
            </button>
          ))}
        </div>
        <select
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value as "all" | Difficulty);
            setPage(1);
          }}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="all">全部难度</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="搜索标题…"
          className="w-48 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {/* 列表 */}
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox error={list.error} />
      ) : list.data === undefined ? null : list.data.items.length === 0 ? (
        <EmptyBox text="没有符合条件的题目，可尝试新增、批量导入或一键播种" />
      ) : (
        <>
          <div className="space-y-2">
            {list.data.items.map((q) => (
              <QuestionCard
                key={q.id}
                question={q}
                onEdit={() => {
                  setEditing(q);
                  setFormOpen(true);
                }}
              />
            ))}
          </div>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              共 {list.data.total} 题 · 第 {list.data.page}/{totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                上一页
              </Button>
              <Button
                variant="secondary"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </Button>
            </div>
          </div>
        </>
      )}

      {formOpen && <QuestionFormModal initial={editing} onClose={() => setFormOpen(false)} />}
      {importOpen && <ImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
