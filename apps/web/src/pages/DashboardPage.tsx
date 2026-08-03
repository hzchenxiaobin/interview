import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@interview/contracts";
import { queryClient, trpc } from "../lib/trpc";
import { Button, Card, EmptyBox, ErrorBox, GradeBadge, Loading } from "../components/ui";
import { formatDateTime } from "../lib/format";

export default function DashboardPage() {
  const navigate = useNavigate();
  const stats = useQuery(trpc.question.stats.queryOptions());
  const scopes = useQuery(trpc.question.scopes.queryOptions());
  const sessions = useQuery(trpc.interview.list.queryOptions());
  const [selected, setSelected] = useState<Category[]>([]);
  const [count, setCount] = useState(5);
  const [scope, setScope] = useState("");

  const start = useMutation(
    trpc.interview.start.mutationOptions({
      onSuccess: (data) => {
        queryClient.invalidateQueries();
        navigate(`/interview/${data.state.sessionId}`);
      },
    }),
  );

  const toggle = (c: Category) =>
    setSelected((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const byCategory = stats.data?.byCategory;
  const canStart = scope !== "" || selected.length > 0;

  return (
    <div className="space-y-6">
      {/* 开始面试 */}
      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">开始面试</h2>

        {/* 方向选择（选中考察范围后禁用） */}
        <div className={`flex flex-wrap gap-2 ${scope ? "pointer-events-none opacity-40" : ""}`}>
          {CATEGORIES.map((c) => {
            const active = selected.includes(c);
            return (
              <button
                key={c}
                type="button"
                onClick={() => toggle(c)}
                className={`rounded-lg border px-4 py-2 text-sm transition-colors ${
                  active
                    ? "border-blue-600 bg-blue-50 font-medium text-blue-700"
                    : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {CATEGORY_LABELS[c]}
                <span className={`ml-1.5 text-xs ${active ? "text-blue-400" : "text-gray-400"}`}>
                  {byCategory?.[c] ?? 0} 题
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gray-100 pt-4">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            考察范围
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-gray-900"
            >
              <option value="">按方向（上方勾选）</option>
              {scopes.data && scopes.data.weeks.length > 0 && (
                <optgroup label="按周（daily）">
                  {scopes.data.weeks.map((w) => (
                    <option key={w.scope} value={w.scope}>
                      {w.name.replace(/^week(\d+)$/, "Week $1")}（{w.count} 题）
                    </option>
                  ))}
                </optgroup>
              )}
              {scopes.data && scopes.data.topics.length > 0 && (
                <optgroup label="按专题（topics）">
                  {scopes.data.topics.map((t) => (
                    <option key={t.scope} value={t.scope}>
                      {t.name}（{t.count} 题）
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            题量
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-gray-900"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button
            className="ml-auto px-5 py-2"
            disabled={!canStart || start.isPending}
            onClick={() =>
              start.mutate(scope ? { categories: [], count, scope } : { categories: selected, count })
            }
          >
            {start.isPending ? "创建中…" : "开始面试"}
          </Button>
        </div>

        {!canStart && (
          <p className="mt-3 text-xs text-gray-400">请至少勾选一个方向，或选择一个考察范围</p>
        )}
        {start.error && (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {start.error.message}
          </p>
        )}
      </Card>

      {/* 最近场次 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">最近场次</h2>
          <Link to="/history" className="text-sm text-blue-600 hover:underline">
            查看全部 →
          </Link>
        </div>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="还没有面试记录，勾选方向开始第一场吧" />
        ) : (
          <div className="space-y-2">
            {sessions.data.slice(0, 5).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() =>
                  navigate(s.status === "finished" ? `/report/${s.id}` : `/interview/${s.id}`)
                }
                className="flex w-full items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-blue-300"
              >
                <div>
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="mt-0.5 text-xs text-gray-400">
                    {formatDateTime(s.createdAt)} · {s.questionIds.length} 题
                  </div>
                </div>
                {s.status === "finished" ? (
                  <GradeBadge grade={s.overallGrade} />
                ) : (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs text-blue-600">
                    进行中 · 点击继续
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
