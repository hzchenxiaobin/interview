import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { Difficulty } from "@interview/contracts";
import { DIFFICULTY_LABELS } from "../lib/format";

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-gray-100 bg-white p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
  secondary:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:text-gray-300 disabled:hover:bg-white",
  danger: "bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300",
};

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type={type}
      className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-xl bg-white p-5 shadow-xl ${wide ? "max-w-2xl" : "max-w-md"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Loading({ text = "加载中…" }: { text?: string }) {
  return <div className="py-8 text-center text-sm text-gray-400">{text}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">出错了：{message}</div>;
}

export function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
      {text}
    </div>
  );
}

const GRADE_BADGE_STYLES: Record<string, string> = {
  A: "bg-green-100 text-green-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-yellow-100 text-yellow-700",
  D: "bg-red-100 text-red-700",
};

export function GradeBadge({ grade }: { grade: string | null | undefined }) {
  if (!grade) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${GRADE_BADGE_STYLES[grade] ?? "bg-gray-100 text-gray-600"}`}
    >
      {grade}
    </span>
  );
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const style =
    difficulty === "easy"
      ? "bg-green-50 text-green-600"
      : difficulty === "medium"
        ? "bg-yellow-50 text-yellow-600"
        : "bg-red-50 text-red-600";
  return (
    <span className={`rounded px-1.5 py-0.5 ${style}`}>
      {DIFFICULTY_LABELS[difficulty as Difficulty] ?? difficulty}
    </span>
  );
}
