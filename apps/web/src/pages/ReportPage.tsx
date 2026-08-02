import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { CATEGORY_LABELS, type Category } from "@interview/contracts";
import { trpc } from "../lib/trpc";
import { Card, ErrorBox, Loading } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { MessageBubble } from "../components/MessageBubble";
import { durationMinutes, formatDateTime, gradeTextColor } from "../lib/format";

export default function ReportPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return <ErrorBox error={new Error("无效的场次 ID")} />;
  }
  return <ReportView key={sessionId} sessionId={sessionId} />;
}

function ReportView({ sessionId }: { sessionId: number }) {
  const [tab, setTab] = useState<"report" | "transcript">("report");
  const get = useQuery(trpc.interview.get.queryOptions({ sessionId }));

  if (get.isLoading) return <Loading text="加载报告…" />;
  if (get.error) return <ErrorBox error={get.error} />;
  if (!get.data) return null;

  const { session, messages } = get.data;

  if (session.status !== "finished") {
    return (
      <Card className="py-12 text-center">
        <p className="text-gray-500">本场面试尚未结束，评估报告还未生成。</p>
        <Link
          to={`/interview/${sessionId}`}
          className="mt-4 inline-block text-sm text-blue-600 hover:underline"
        >
          返回面试间继续 →
        </Link>
      </Card>
    );
  }

  const duration = durationMinutes(session.createdAt, session.finishedAt);
  const cats = session.categories.map((c) => CATEGORY_LABELS[c as Category] ?? c).join(" / ");
  const evaluatedByText =
    session.evaluatedBy === "llm"
      ? "LLM 评估"
      : session.evaluatedBy === "rule"
        ? "规则引擎评估"
        : null;

  return (
    <div className="space-y-4">
      {/* 总评卡片 */}
      <Card>
        <div className="flex flex-wrap items-center gap-6">
          <div className={`text-6xl font-black ${gradeTextColor(session.overallGrade)}`}>
            {session.overallGrade ?? "?"}
          </div>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="text-base font-semibold text-gray-900">{session.title}</div>
            <div>
              方向：{cats} · 题数：{session.questionIds.length}
              {duration != null ? ` · 时长：${duration} 分钟` : ""}
            </div>
            <div className="text-xs text-gray-400">
              完成于 {formatDateTime(session.finishedAt)}
              {evaluatedByText ? ` · ${evaluatedByText}` : ""}
            </div>
          </div>
        </div>
      </Card>

      {/* Tab 切换 */}
      <div className="flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
        {(
          [
            ["report", "评估报告"],
            ["transcript", "对话回放"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-md px-4 py-1.5 text-sm ${
              tab === key ? "bg-white font-medium shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "report" ? (
        <Card>
          {session.report ? (
            <Markdown text={session.report} />
          ) : (
            <p className="text-sm text-gray-400">报告内容为空。</p>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}
        </div>
      )}
    </div>
  );
}
