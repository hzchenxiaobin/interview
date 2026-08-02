import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { MAX_FOLLOW_UPS, type InterviewState } from "@interview/contracts";
import { queryClient, trpc, type InterviewGetData } from "../lib/trpc";
import { Button, Card, ErrorBox, Loading } from "../components/ui";
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

  const send = () => {
    const content = input.trim();
    if (!content || reply.isPending || status !== "active") return;
    setInput("");
    setMessages((m) => [...(m ?? get.data!.messages), makeLocalMessage(sessionId, "candidate", content)]);
    reply.mutate({ sessionId, content });
  };

  const confirmFinish = () => {
    if (window.confirm("确定结束本场面试并生成评估报告？生成可能需要数十秒。")) {
      finish.mutate({ sessionId });
    }
  };

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

      {/* 消息流 */}
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

      {/* 输入区 */}
      {status === "finished" ? (
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
            onKeyDown={(e) => {
              // isComposing：中文输入法组词期间的 Enter 不触发发送
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={3}
            placeholder="输入你的回答，可粘贴代码。Enter 发送，Shift+Enter 换行。"
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-400 focus:outline-none"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">Enter 发送 · Shift+Enter 换行</span>
            <Button disabled={!input.trim() || reply.isPending} onClick={send}>
              {reply.isPending ? "发送中…" : "发送"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
