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
