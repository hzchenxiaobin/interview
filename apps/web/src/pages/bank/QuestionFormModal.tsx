import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  DIFFICULTIES,
  type Category,
  type Difficulty,
} from "@interview/contracts";
import { queryClient, trpc, type QuestionListItem } from "../../lib/trpc";
import { Button, Modal } from "../../components/ui";
import { DIFFICULTY_LABELS } from "../../lib/format";

const inputCls =
  "w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none";

export function QuestionFormModal({
  initial,
  onClose,
}: {
  /** null 表示新增，否则为编辑 */
  initial: QuestionListItem | null;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<Category>(initial?.category ?? "leetcode");
  const [difficulty, setDifficulty] = useState<Difficulty>(initial?.difficulty ?? "medium");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [followUps, setFollowUps] = useState((initial?.followUps ?? []).join("\n"));
  const [keyPoints, setKeyPoints] = useState(initial?.keyPoints ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [error, setError] = useState<string | null>(null);

  const onSaved = () => {
    queryClient.invalidateQueries();
    onClose();
  };
  const create = useMutation(trpc.question.create.mutationOptions({ onSuccess: onSaved }));
  const update = useMutation(trpc.question.update.mutationOptions({ onSuccess: onSaved }));
  const pending = create.isPending || update.isPending;

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("标题不能为空");
    if (!content.trim()) return setError("题目内容不能为空");
    const data = {
      category,
      title: title.trim(),
      content: content.trim(),
      difficulty,
      tags: tags.trim(),
      followUps: followUps
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      keyPoints: keyPoints.trim(),
      source: source.trim(),
    };
    if (initial) {
      update.mutate({ id: initial.id, data });
    } else {
      create.mutate(data);
    }
  };

  const mutationError = create.error ?? update.error;

  return (
    <Modal title={initial ? "编辑题目" : "新增题目"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-gray-500">方向</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-gray-500">难度</span>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className={inputCls}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">标题 *</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">题目内容 *</span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={5}
            className={`${inputCls} font-mono`}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">预设追问（每行一条）</span>
          <textarea
            value={followUps}
            onChange={(e) => setFollowUps(e.target.value)}
            rows={3}
            placeholder={"如果让你优化，你会怎么做？\n时间复杂度是多少？"}
            className={inputCls}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-gray-500">考察要点</span>
          <textarea
            value={keyPoints}
            onChange={(e) => setKeyPoints(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-gray-500">标签（逗号分隔）</span>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-gray-500">来源</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="如 leetcode/0001"
              className={inputCls}
            />
          </label>
        </div>

        {(error || mutationError) && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error ?? mutationError?.message}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
