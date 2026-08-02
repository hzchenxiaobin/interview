import type { Difficulty } from "@interview/contracts";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "简单",
  medium: "中等",
  hard: "困难",
};

function toDate(value: Date | string): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = toDate(value);
  if (!d) return "—";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatShortDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = toDate(value);
  if (!d) return "";
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 起止时间相差分钟数（至少 1 分钟），无法计算时返回 null */
export function durationMinutes(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null {
  if (!start || !end) return null;
  const s = toDate(start);
  const e = toDate(end);
  if (!s || !e) return null;
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 60000));
}

export function gradeTextColor(grade: string | null | undefined): string {
  switch (grade) {
    case "A":
      return "text-green-600";
    case "B":
      return "text-blue-600";
    case "C":
      return "text-yellow-600";
    case "D":
      return "text-red-600";
    default:
      return "text-gray-300";
  }
}
