import { useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router";
import { CATEGORY_LABELS } from "@interview/contracts";
import { queryClient, trpc, type QuestionListItem } from "../../lib/trpc";
import { DifficultyBadge } from "../../components/ui";
import { formatDateTime } from "../../lib/format";

export function QuestionCard({
  question,
  onEdit,
}: {
  question: QuestionListItem;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const remove = useMutation(
    trpc.question.remove.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const onDelete = () => {
    if (window.confirm(`确定删除「${question.title}」？该操作不可恢复。`)) {
      remove.mutate({ id: question.id });
    }
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{question.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
              {CATEGORY_LABELS[question.category]}
            </span>
            <DifficultyBadge difficulty={question.difficulty} />
            {question.tags && <span>标签：{question.tags}</span>}
            <span>更新于 {formatDateTime(question.updatedAt)}</span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-gray-300">{expanded ? "收起 ▲" : "展开 ▼"}</span>
      </button>
      {expanded && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3 text-sm">
          <Section title="题目内容">
            <p className="whitespace-pre-wrap text-gray-700">{question.content}</p>
          </Section>
          {question.followUps.length > 0 && (
            <Section title={`预设追问（${question.followUps.length}）`}>
              <ol className="list-decimal space-y-1 pl-5 text-gray-700">
                {question.followUps.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ol>
            </Section>
          )}
          {question.keyPoints && (
            <Section title="考察要点">
              <p className="whitespace-pre-wrap text-gray-700">{question.keyPoints}</p>
            </Section>
          )}
          {question.source && <div className="text-xs text-gray-400">来源：{question.source}</div>}
          <div className="flex items-center gap-2 pt-1">
            {question.category === "leetcode" && (
              <Link
                to={`/judge/${question.id}`}
                className="rounded-md bg-blue-50 px-3 py-1 text-xs text-blue-600 hover:bg-blue-100"
              >
                在线评测
              </Link>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-700 hover:bg-gray-200"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={remove.isPending}
              className="rounded-md bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {remove.isPending ? "删除中…" : "删除"}
            </button>
            {remove.error && <span className="text-xs text-red-500">{remove.error.message}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-400">{title}</div>
      {children}
    </div>
  );
}
