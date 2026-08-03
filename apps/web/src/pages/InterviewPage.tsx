import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { CATEGORY_LABELS, MAX_FOLLOW_UPS, type InterviewState } from "@interview/contracts";
import { queryClient, trpc, type InterviewGetData } from "../lib/trpc";
import { Button, Card, DifficultyBadge, ErrorBox, Loading } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { MessageBubble } from "../components/MessageBubble";

type MessageItem = InterviewGetData["messages"][number];

// 乐观渲染的本地消息使用负数 id，避免与后端自增 id 冲突
let tempId = -1;
function makeLocalMessage(
  sessionId: number,
  role: MessageItem["role"],
  content: string,
): MessageItem {
  return { id: tempId--, sessionId, questionId: null, role, content, createdAt: new Date() };
}

export default function InterviewPage() {
  const { id } = useParams();
  const sessionId = Number(id);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return <ErrorBox error={new Error("无效的场次 ID")} />;
  }
  return <InterviewRoom key={sessionId} sessionId={sessionId} />;
}

function InterviewRoom({ sessionId }: { sessionId: number }) {
  const navigate = useNavigate();
  const get = useQuery(trpc.interview.get.queryOptions({ sessionId }));
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [stateOverride, setStateOverride] = useState<InterviewState | null>(null);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // 首次拿到服务端消息后初始化本地消息流（之后的追加都走本地状态）
  useEffect(() => {
    if (get.data && messages === null) setMessages(get.data.messages);
  }, [get.data, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  const reply = useMutation(
    trpc.interview.reply.mutationOptions({
      onSuccess: (res) => {
        setStateOverride(res.state);
        setMessages((m) => [
          ...(m ?? []),
          makeLocalMessage(sessionId, "interviewer", res.interviewerMessage),
        ]);
        if (res.state.status === "finished") queryClient.invalidateQueries();
      },
      onError: (err) => {
        setMessages((m) => [
          ...(m ?? []),
          makeLocalMessage(sessionId, "system", `发送失败：${err.message}，请重试。`),
        ]);
      },
    }),
  );

  const finish = useMutation(
    trpc.interview.finish.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries();
        navigate(`/report/${sessionId}`);
      },
    }),
  );

  if (get.isLoading) return <Loading text="恢复面试现场…" />;
  if (get.error) return <ErrorBox error={get.error} />;
  if (!get.data) return null;

  const { session } = get.data;
  const msgs = messages ?? get.data.messages;

  const status = stateOverride?.status ?? session.status;
  const currentIndex = stateOverride?.currentIndex ?? session.currentIndex;
  const followUpIndex = stateOverride?.followUpIndex ?? session.followUpIndex;

  const total = session.questionIds.length;
  const currentQid = session.questionIds[currentIndex];
  const currentQ = currentQid != null ? get.data.questions[String(currentQid)] : undefined;
  const maxFollowUps = currentQ ? Math.min(currentQ.followUps.length, MAX_FOLLOW_UPS) : 0;
  const progressPct = status === "finished" ? 100 : Math.round((currentIndex / total) * 100);

  // 算法题 / leetgpu 题：切换为左右分栏（左题面 + 对话，右代码编辑器）
  const codeQ =
    status === "active" &&
    currentQ != null &&
    (currentQ.category === "leetcode" || currentQ.category === "cuda")
      ? currentQ
      : null;

  const sendContent = (raw: string) => {
    const content = raw.trim();
    if (!content || reply.isPending || status !== "active") return;
    setInput("");
    setMessages((m) => [...(m ?? get.data!.messages), makeLocalMessage(sessionId, "candidate", content)]);
    reply.mutate({ sessionId, content });
  };

  const send = () => sendContent(input);

  const confirmFinish = () => {
    if (window.confirm("确定结束本场面试并生成评估报告？生成可能需要数十秒。")) {
      finish.mutate({ sessionId });
    }
  };

  const messageFlow = (
    <div className="space-y-3">
      {msgs.map((m) => (
        <MessageBubble key={m.id} role={m.role} content={m.content} />
      ))}
      {reply.isPending && (
        <div className="flex justify-start">
          <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-400">
            面试官正在输入…
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );

  const inputArea =
    status === "finished" ? (
      <Card className="py-6 text-center text-sm text-gray-500">
        本场面试已结束。
        <Link to={`/report/${sessionId}`} className="ml-1 text-blue-600 hover:underline">
          查看评估报告 →
        </Link>
      </Card>
    ) : (
      <Card>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="输入你的回答，可粘贴代码。点击「提交」发送。"
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">仅点击「提交」按钮发送，回车不发送</span>
          <Button disabled={!input.trim() || reply.isPending} onClick={send}>
            {reply.isPending ? "提交中…" : "提交"}
          </Button>
        </div>
      </Card>
    );

  return (
    <div className="space-y-4">
      {/* 顶部状态栏 */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{session.title}</div>
            <div className="mt-0.5 text-xs text-gray-400">
              第 {Math.min(currentIndex + 1, total)}/{total} 题
              {maxFollowUps > 0
                ? ` · 追问 ${Math.min(followUpIndex, maxFollowUps)}/${maxFollowUps}`
                : " · 无预设追问"}
              {currentQ && status === "active" ? ` · 当前：${currentQ.title}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status === "finished" ? (
              <Link to={`/report/${sessionId}`}>
                <Button>查看评估报告 →</Button>
              </Link>
            ) : (
              <Button variant="danger" disabled={finish.isPending} onClick={confirmFinish}>
                {finish.isPending ? "生成报告中…" : "结束本场"}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {finish.error && (
          <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            结束失败：{finish.error.message}
          </p>
        )}
      </Card>

      {/* 算法题 / leetgpu 题：左题面 + 对话，右代码编辑器 */}
      {codeQ ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <div className="min-w-0 space-y-4">
            {/* 题目描述 */}
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-semibold">{codeQ.title}</span>
                <DifficultyBadge difficulty={codeQ.difficulty} />
              </div>
              <div className="max-h-[45vh] overflow-y-auto pr-1">
                <Markdown
                  text={codeQ.content}
                  className="space-y-2 text-sm leading-relaxed text-gray-800"
                />
              </div>
            </Card>
            {messageFlow}
            {inputArea}
          </div>
          <div className="min-w-0">
            {/* key=题 ID：换题时重置编辑器内容 */}
            <CodeEditorCard
              key={codeQ.id}
              categoryLabel={CATEGORY_LABELS[codeQ.category]}
              pending={reply.isPending}
              onSubmit={sendContent}
            />
          </div>
        </div>
      ) : (
        <>
          {messageFlow}
          {inputArea}
        </>
      )}
    </div>
  );
}

/** 代码作答面板：右侧编辑器，提交后将代码作为考生消息发送 */ 
function CodeEditorCard({
  categoryLabel,
  pending,
  onSubmit,
}: {
  categoryLabel: string;
  pending: boolean;
  onSubmit: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Card className="lg:sticky lg:top-6">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold">代码作答</span>
        <span className="text-xs text-gray-400">{categoryLabel} · 提交后发送给面试官</span>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        placeholder="在这里编写你的代码…"
        className="h-[55vh] w-full resize-y rounded-lg bg-gray-900 p-3 font-mono text-xs leading-relaxed text-gray-100 outline-none"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">思路讨论 / 追问回答请用左侧输入框</span>
        <Button disabled={!code.trim() || pending} onClick={() => onSubmit(code)}>
          {pending ? "发送中…" : "提交代码"}
        </Button>
      </div>
    </Card>
  );
}
