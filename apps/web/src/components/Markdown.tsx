import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// 轻量 Markdown 渲染器：支持 #/##/### 标题、- 列表、数字列表、> 引用、
// ``` 代码块、**加粗**、`行内代码`、段落。不引入 react-markdown。
// ---------------------------------------------------------------------------

function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(regex)) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      nodes.push(
        <strong key={key++} className="font-semibold">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-pink-600"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; text: string }
  | { type: "code"; text: string }
  | { type: "p"; text: string };

const RE_HEADING = /^(#{1,4})\s+(.*)$/;
const RE_UL = /^\s*[-*]\s+/;
const RE_OL = /^\s*\d+\.\s+/;
const RE_QUOTE = /^>\s?/;
const RE_FENCE = /^\s*```/;

function isBlockStart(line: string): boolean {
  return (
    RE_HEADING.test(line) ||
    RE_UL.test(line) ||
    RE_OL.test(line) ||
    RE_QUOTE.test(line) ||
    RE_FENCE.test(line)
  );
}

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (RE_FENCE.test(line)) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !RE_FENCE.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过收尾 ```
      blocks.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const h = RE_HEADING.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1].length, text: h[2] });
      i++;
      continue;
    }
    if (RE_UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_UL.test(lines[i])) {
        items.push(lines[i].replace(RE_UL, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (RE_OL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && RE_OL.test(lines[i])) {
        items.push(lines[i].replace(RE_OL, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (RE_QUOTE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && RE_QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(RE_QUOTE, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join(" ") });
      continue;
    }
    // 段落：连续的非空、非块起始行
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isBlockStart(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join("\n") });
  }
  return blocks;
}

const HEADING_STYLES: Record<number, string> = {
  1: "text-xl font-bold",
  2: "text-lg font-semibold",
  3: "text-base font-semibold",
  4: "text-sm font-semibold",
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className ?? "space-y-3 text-sm leading-relaxed text-gray-800"}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return (
              <div key={i} className={`${HEADING_STYLES[b.level] ?? HEADING_STYLES[4]} mt-2 first:mt-0`}>
                {renderInline(b.text)}
              </div>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={i} className="border-l-4 border-gray-200 pl-3 text-gray-500">
                {renderInline(b.text)}
              </blockquote>
            );
          case "code":
            return (
              <pre
                key={i}
                className="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-100"
              >
                {b.text}
              </pre>
            );
          case "p":
            return (
              <p key={i} className="whitespace-pre-line">
                {renderInline(b.text)}
              </p>
            );
        }
      })}
    </div>
  );
}
