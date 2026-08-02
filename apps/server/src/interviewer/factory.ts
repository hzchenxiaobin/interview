import type { IInterviewer } from "@interview/contracts";
import { env } from "../env.js";
import { LlmInterviewer } from "./llm.js";
import { RuleBasedInterviewer } from "./rule.js";

/**
 * 面试官工厂（README §6.4）：
 * - 配置 LLM_API_KEY → LlmInterviewer（内部超时/5xx/解析失败均单次降级）；
 * - 未配置 → 全程规则引擎。
 */
export function getInterviewer(): IInterviewer {
  return env.LLM_API_KEY ? new LlmInterviewer() : new RuleBasedInterviewer();
}

/**
 * 是否启用了 LLM 面试官。决定 reply 的追问上限策略：
 * LLM 可动态生成追问（上限 MAX_FOLLOW_UPS）；规则引擎只按预设追问数量追问，
 * 避免预设耗尽后泛泛追问刷屏。
 */
export function isLlmEnabled(): boolean {
  return Boolean(env.LLM_API_KEY);
}
