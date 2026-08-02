import { Markdown } from "./Markdown";

/** 聊天气泡：面试官靠左灰底白卡、考生靠右蓝底（等宽字体便于代码）、system 居中 */
export function MessageBubble({ role, content }: { role: string; content: string }) {
  if (role === "system") {
    return <div className="py-1 text-center text-xs text-gray-400">{content}</div>;
  }
  if (role === "candidate") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-blue-600 px-4 py-2.5 text-white">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-blue-200">考生</div>
          <div className="whitespace-pre-wrap font-mono text-sm">{content}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-2.5">
        <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-400">面试官</div>
        <Markdown text={content} className="space-y-2 text-sm leading-relaxed text-gray-800" />
      </div>
    </div>
  );
}
