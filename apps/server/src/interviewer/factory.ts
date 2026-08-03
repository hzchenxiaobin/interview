import type { IInterviewer } from "@interview/contracts";
import { LlmInterviewer } from "./llm.js";

/**
 * 面试官工厂：系统为纯 LLM 模式（规则引擎已移除）。
 * 未配置 LLM_API_KEY 或 LLM 故障时直接抛错，无降级。
 */
export function getInterviewer(): IInterviewer {
  return new LlmInterviewer();
}
