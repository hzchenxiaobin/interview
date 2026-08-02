import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CATEGORIES, DIFFICULTIES, type QuestionInput } from "@interview/contracts";
import { queryClient, trpc } from "../../lib/trpc";
import { Button, Modal } from "../../components/ui";

const PLACEHOLDER = `[
  {
    "category": "leetcode",
    "title": "两数之和",
    "content": "给定一个整数数组 nums 和一个目标值 target…",
    "difficulty": "easy",
    "tags": "数组,哈希表",
    "followUps": ["如何优化到 O(n)？"],
    "keyPoints": "哈希表空间换时间",
    "source": "leetcode/0001"
  }
]`;

/** 校验并规整单条导入数据，返回 QuestionInput 或错误信息字符串 */
function validateItem(raw: unknown): QuestionInput | string {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return "必须是对象";
  const o = raw as Record<string, unknown>;
  if (!CATEGORIES.includes(o.category as (typeof CATEGORIES)[number]))
    return `category 无效（可选：${CATEGORIES.join("/")}）`;
  if (typeof o.title !== "string" || !o.title.trim()) return "title 缺失或为空";
  if (typeof o.content !== "string" || !o.content.trim()) return "content 缺失或为空";
  if (!DIFFICULTIES.includes(o.difficulty as (typeof DIFFICULTIES)[number]))
    return `difficulty 无效（可选：${DIFFICULTIES.join("/")}）`;
  if (o.followUps !== undefined && !Array.isArray(o.followUps)) return "followUps 必须是数组";
  const followUps = (o.followUps as unknown[] | undefined)?.map((f, i) => {
    if (typeof f !== "string") throw new Error(`followUps 第 ${i + 1} 条不是字符串`);
    return f;
  });
  return {
    category: o.category as QuestionInput["category"],
    title: o.title.trim(),
    content: o.content.trim(),
    difficulty: o.difficulty as QuestionInput["difficulty"],
    tags: typeof o.tags === "string" ? o.tags : "",
    followUps: followUps ?? [],
    keyPoints: typeof o.keyPoints === "string" ? o.keyPoints : "",
    source: typeof o.source === "string" ? o.source : "",
  };
}

export function ImportModal({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bulkImport = useMutation(
    trpc.question.bulkImport.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const submit = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return setError(`JSON 解析失败：${e instanceof Error ? e.message : String(e)}`);
    }
    if (!Array.isArray(parsed) || parsed.length === 0)
      return setError("JSON 必须是非空数组（题目对象列表）");
    const items: QuestionInput[] = [];
    try {
      for (const [i, raw] of parsed.entries()) {
        const v = validateItem(raw);
        if (typeof v === "string") return setError(`第 ${i + 1} 条：${v}`);
        items.push(v);
      }
    } catch (e) {
      return setError(e instanceof Error ? e.message : String(e));
    }
    bulkImport.mutate({ items });
  };

  return (
    <Modal title="批量导入（JSON）" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          粘贴题目 JSON 数组，字段：category / title / content / difficulty 必填，tags /
          followUps / keyPoints / source 可选。
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder={PLACEHOLDER}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-blue-400 focus:outline-none"
        />
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        {bulkImport.error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            导入失败：{bulkImport.error.message}
          </p>
        )}
        {bulkImport.isSuccess ? (
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            成功导入 {bulkImport.data.imported} 题。
          </p>
        ) : (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button disabled={!text.trim() || bulkImport.isPending} onClick={submit}>
              {bulkImport.isPending ? "导入中…" : "校验并导入"}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
