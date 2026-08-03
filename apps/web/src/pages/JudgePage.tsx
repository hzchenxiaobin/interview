import { useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import { Markdown } from "../components/Markdown";
import { DifficultyBadge } from "../components/ui";

type Language = "cpp" | "python";

const LANG_LABELS: Record<Language, string> = { cpp: "C++", python: "Python" };

export default function JudgePage() {
  const { id } = useParams();
  const questionId = Number(id);
  const problem = useQuery(trpc.judge.getProblem.queryOptions({ questionId }));
  const run = useMutation(trpc.judge.run.mutationOptions());

  const [language, setLanguage] = useState<Language>("cpp");
  const [code, setCode] = useState<Record<Language, string>>({ cpp: "", python: "" });
  const [showReference, setShowReference] = useState(false);
  const [initialized, setInitialized] = useState(false);

  if (problem.isLoading) return <div className="py-20 text-center text-sm text-gray-400">加载中…</div>;
  if (problem.error) {
    return (
      <div className="py-20 text-center text-sm text-red-500">
        {problem.error.message}（<Link to="/bank" className="underline">返回题库</Link>）
      </div>
    );
  }
  const data = problem.data!;

  // 首次拿到 starter code 后填入编辑器
  if (!initialized) {
    setCode({ cpp: data.cpp.starter ?? "", python: data.python.starter ?? "" });
    if (!data.cpp.available && data.python.available) setLanguage("python");
    setInitialized(true);
  }

  const langState = data[language];
  const onRun = () => run.mutate({ questionId, language, code: code[language] });
  const result = run.data;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/bank" className="text-xs text-gray-400 hover:text-gray-600">← 题库</Link>
          <h1 className="text-lg font-semibold">{data.question.title}</h1>
          <DifficultyBadge difficulty={data.question.difficulty} />
        </div>
        <span className="text-xs text-gray-400">{data.question.source} · 评测用例为题面示例（LeetCode 不公开完整测试集）</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 左：题面 + 用例 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <Markdown text={data.question.content} />
          </div>
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 text-xs font-medium text-gray-400">示例用例（{data.examples.length}）</div>
            <div className="space-y-2">
              {data.examples.map((c, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-2 font-mono text-xs text-gray-700">
                  <div>输入：{c.input}</div>
                  <div>输出：{c.expected}</div>
                </div>
              ))}
              {data.examples.length === 0 && (
                <div className="text-xs text-gray-400">未从题面解析到示例用例，无法评测。</div>
              )}
            </div>
          </div>
        </div>

        {/* 右：编辑器 + 结果 */}
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex gap-1">
                {(Object.keys(LANG_LABELS) as Language[]).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLanguage(l)}
                    disabled={!data[l].available}
                    className={`rounded-md px-3 py-1 text-xs ${
                      language === l
                        ? "bg-gray-900 text-white"
                        : data[l].available
                          ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          : "cursor-not-allowed bg-gray-50 text-gray-300"
                    }`}
                    title={data[l].available ? undefined : (data[l].reason ?? "")}
                  >
                    {LANG_LABELS[l]}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowReference((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showReference ? "隐藏参考代码" : "查看参考代码"}
              </button>
            </div>
            {!langState.available && (
              <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">{langState.reason}</div>
            )}
            <textarea
              value={code[language]}
              onChange={(e) => setCode((prev) => ({ ...prev, [language]: e.target.value }))}
              spellCheck={false}
              className="h-80 w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 outline-none"
            />
            {showReference && langState.reference && (
              <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs text-gray-700">
                {langState.reference}
              </pre>
            )}
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={onRun}
                disabled={run.isPending || !langState.available || data.examples.length === 0}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {run.isPending ? "评测中…" : "运行评测"}
              </button>
              {run.error && <span className="text-xs text-red-500">{run.error.message}</span>}
            </div>
          </div>

          {result && (
            <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
              {result.status === "compile_error" ? (
                <div>
                  <div className="mb-2 text-sm font-medium text-red-600">编译失败</div>
                  <pre className="max-h-60 overflow-auto rounded-lg bg-red-50 p-3 font-mono text-xs text-red-700">
                    {result.compileError}
                  </pre>
                </div>
              ) : (
                <>
                  <div className="mb-2 text-sm font-medium">
                    {result.passed === result.total ? (
                      <span className="text-green-600">全部通过（{result.passed}/{result.total}）</span>
                    ) : (
                      <span className="text-amber-600">通过 {result.passed}/{result.total}</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {result.cases.map((c, i) => (
                      <div
                        key={i}
                        className={`rounded-lg border p-2 font-mono text-xs ${
                          c.pass ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"
                        }`}
                      >
                        <div className={c.pass ? "text-green-700" : "text-red-700"}>
                          用例 {i + 1}：{c.pass ? "通过" : "未通过"}
                        </div>
                        <div className="mt-1 text-gray-600">输入：{c.input}</div>
                        <div className="text-gray-600">期望：{c.expected}</div>
                        <div className="text-gray-600">实际：{c.actual || "（无输出）"}</div>
                        {c.error && <div className="mt-1 whitespace-pre-wrap text-red-600">{c.error}</div>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
