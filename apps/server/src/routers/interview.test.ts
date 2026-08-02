import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { _resetUserCache, getCurrentUserId } from "../auth.js";
import { appRouter } from "./index.js";

/**
 * 面试状态机集成测试：需要可连接的 MySQL（DATABASE_URL）。
 * 无 DB 环境时整体跳过。
 */
async function dbAvailable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}

const available = await dbAvailable();
const run = available ? describe : describe.skip;

run("interview 状态机（集成）", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;
  let questionIds: number[] = [];

  beforeAll(async () => {
    _resetUserCache();
    const userId = await getCurrentUserId();
    caller = appRouter.createCaller({ userId });
    // 清空该用户数据，避免种子/同步数据干扰
    await caller.question.seed();
    const { items } = await caller.question.list({ page: 1, pageSize: 100 });
    questionIds = items.map((q) => q.id);
    expect(questionIds.length).toBeGreaterThan(0);
  });

  it("start → reply×N → 自动 finish → 报告", async () => {
    const start = await caller.interview.start({ categories: ["cuda", "leetcode"], count: 2 });
    expect(start.state.status).toBe("active");
    expect(start.state.totalQuestions).toBe(2);
    expect(start.messages).toHaveLength(1);
    expect(start.messages[0].role).toBe("interviewer");
    expect(start.messages[0].content).toContain("第一题");

    let state = start.state;
    let rounds = 0;
    while (state.status === "active" && rounds < 50) {
      const r = await caller.interview.reply({
        sessionId: state.sessionId,
        content: "这是我的回答，包含 bank、warp、padding 等要点，尽量写长一点以覆盖表达分。".repeat(3),
      });
      state = r.state;
      rounds += 1;
      expect(r.interviewerMessage.length).toBeGreaterThan(0);
    }
    expect(state.status).toBe("finished");
    expect(rounds).toBeGreaterThanOrEqual(2); // 每题至少主问题 1 轮

    const detail = await caller.interview.get({ sessionId: state.sessionId });
    expect(detail.session.report).toBeTruthy();
    expect(detail.session.report).toContain("面试评估报告");
    expect(detail.session.overallGrade).toMatch(/^[ABCD]$/);
    expect(detail.messages.filter((m) => m.role === "candidate").length).toBe(rounds);
  }, 30_000);

  it("断点恢复：get 返回完整消息与状态", async () => {
    const start = await caller.interview.start({ categories: ["leetcode"], count: 1 });
    await caller.interview.reply({ sessionId: start.state.sessionId, content: "回答一" });
    const detail = await caller.interview.get({ sessionId: start.state.sessionId });
    expect(detail.session.currentIndex).toBe(0);
    expect(detail.session.followUpIndex).toBeGreaterThanOrEqual(1);
    expect(detail.messages.filter((m) => m.role === "candidate")).toHaveLength(1);
    await caller.interview.finish({ sessionId: start.state.sessionId });
  }, 30_000);

  it("空方向题库报 PRECONDITION_FAILED", async () => {
    // 先清空 project 方向制造空题库场景（beforeAll 的 seed 幂等，下次运行会自动补回）
    const { items } = await caller.question.list({ category: "project", page: 1, pageSize: 100 });
    for (const q of items) await caller.question.remove({ id: q.id });
    await expect(caller.interview.start({ categories: ["project"], count: 1 })).rejects.toThrow();
  });
});
