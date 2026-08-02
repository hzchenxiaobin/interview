import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { CATEGORIES, CATEGORY_LABELS, type Category } from "@interview/contracts";
import { trpc, type InterviewStatsData } from "../lib/trpc";
import { Card, EmptyBox, ErrorBox, GradeBadge, Loading } from "../components/ui";
import { durationMinutes, formatDateTime, formatShortDate } from "../lib/format";

export default function HistoryPage() {
  const navigate = useNavigate();
  const stats = useQuery(trpc.interview.stats.queryOptions());
  const sessions = useQuery(trpc.interview.list.queryOptions());

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">历史统计</h2>

      {/* 方向平均分 */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-gray-700">方向平均分（A=4 / B=3 / C=2 / D=1）</h3>
        {stats.isLoading ? (
          <Loading />
        ) : stats.error ? (
          <ErrorBox error={stats.error} />
        ) : stats.data === undefined ? null : (
          <CategoryBars data={stats.data.categoryAverages} />
        )}
      </Card>

      {/* 近 10 场趋势 */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-gray-700">近 10 场趋势</h3>
        {stats.isLoading ? (
          <Loading />
        ) : stats.error ? (
          <ErrorBox error={stats.error} />
        ) : stats.data === undefined ? null : (
          <TrendChart trend={stats.data.trend} />
        )}
      </Card>

      {/* 场次表格 */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-gray-700">全部场次</h3>
        {sessions.isLoading ? (
          <Loading />
        ) : sessions.error ? (
          <ErrorBox error={sessions.error} />
        ) : sessions.data === undefined ? null : sessions.data.length === 0 ? (
          <EmptyBox text="还没有面试记录" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">时间</th>
                  <th className="px-4 py-2.5 font-medium">标题</th>
                  <th className="px-4 py-2.5 font-medium">方向</th>
                  <th className="px-4 py-2.5 font-medium">题数</th>
                  <th className="px-4 py-2.5 font-medium">等级</th>
                  <th className="px-4 py-2.5 font-medium">时长</th>
                  <th className="px-4 py-2.5 font-medium">状态</th>
                </tr>
              </thead>
              <tbody>
                {sessions.data.map((s) => {
                  const duration = durationMinutes(s.createdAt, s.finishedAt);
                  return (
                    <tr
                      key={s.id}
                      onClick={() =>
                        navigate(s.status === "finished" ? `/report/${s.id}` : `/interview/${s.id}`)
                      }
                      className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-blue-50/50"
                    >
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                        {formatDateTime(s.createdAt)}
                      </td>
                      <td className="max-w-56 truncate px-4 py-2.5 font-medium">{s.title}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                        {s.categories.map((c) => CATEGORY_LABELS[c as Category] ?? c).join("/")}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{s.questionIds.length}</td>
                      <td className="px-4 py-2.5">
                        <GradeBadge grade={s.overallGrade} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-gray-500">
                        {duration != null ? `${duration} 分钟` : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.status === "finished" ? (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                            已完成
                          </span>
                        ) : (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                            进行中
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function CategoryBars({ data }: { data: InterviewStatsData["categoryAverages"] }) {
  return (
    <div className="space-y-3">
      {CATEGORIES.map((c) => {
        const entry = data.find((e) => e.category === c);
        const pct = entry ? Math.round((entry.average / 4) * 100) : 0;
        return (
          <div key={c} className="flex items-center gap-3">
            <div className="w-14 shrink-0 text-sm text-gray-600">{CATEGORY_LABELS[c]}</div>
            <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
              <div
                className="h-full rounded bg-blue-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-36 shrink-0 text-right text-xs text-gray-500">
              {entry ? `均分 ${entry.average.toFixed(2)} · ${entry.sessions} 场` : "暂无数据"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type TrendItem = InterviewStatsData["trend"][number];

const GRADE_LINES = [
  { g: "A", s: 4 },
  { g: "B", s: 3 },
  { g: "C", s: 2 },
  { g: "D", s: 1 },
] as const;

function TrendChart({ trend }: { trend: InterviewStatsData["trend"] }) {
  const points = trend.filter((t): t is TrendItem & { score: number } => t.score != null);
  if (points.length === 0) return <EmptyBox text="暂无已完成场次" />;

  const W = 640;
  const H = 200;
  const padL = 34;
  const padR = 14;
  const padT = 16;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const x = (i: number) =>
    padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (s: number) => padT + ((4 - s) / 3) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="近 10 场等级趋势">
      {GRADE_LINES.map(({ g, s }) => (
        <g key={g}>
          <line x1={padL} x2={W - padR} y1={y(s)} y2={y(s)} stroke="#e5e7eb" strokeWidth={1} />
          <text x={padL - 8} y={y(s) + 4} textAnchor="end" fontSize={11} fill="#9ca3af">
            {g}
          </text>
        </g>
      ))}
      {points.length > 1 && (
        <polyline
          points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
        />
      )}
      {points.map((p, i) => (
        <g key={p.sessionId}>
          <circle cx={x(i)} cy={y(p.score)} r={4.5} fill="#3b82f6">
            <title>{`${p.title} · ${p.overallGrade ?? "—"}${p.durationMinutes != null ? ` · ${p.durationMinutes} 分钟` : ""}`}</title>
          </circle>
          <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="#9ca3af">
            {formatShortDate(p.createdAt)}
          </text>
        </g>
      ))}
    </svg>
  );
}
