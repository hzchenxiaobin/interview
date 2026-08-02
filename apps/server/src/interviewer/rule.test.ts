import { describe, expect, it } from "vitest";
import type { GroupedTranscript, InterviewContext, Question } from "@interview/contracts";
import { RuleBasedInterviewer } from "./rule.js";

const question: Question = {
  id: 1,
  category: "cuda",
  title: "Shared Memory Bank Conflict",
  content: "解释 bank conflict 的成因",
  difficulty: "medium",
  tags: "shared memory",
  followUps: ["追问一", "追问二", "追问三", "追问四", "追问五"],
  keyPoints: "bank 按 4 字节×32 划分；同一 warp 访问同一 bank 不同地址则串行化；广播例外；padding 错位",
  source: "CUDA 课程",
};

function makeCtx(overrides: Partial<InterviewContext>): InterviewContext {
  return { question, history: [], followUpIndex: 0, targetRole: "AI Infra 工程师", ...overrides };
}

describe("RuleBasedInterviewer.openingQuestion", () => {
  it("拼接标题与原始题面", async () => {
    const r = new RuleBasedInterviewer();
    const q = await r.openingQuestion(question, "AI Infra 工程师");
    expect(q).toBe(`**${question.title}**\n\n${question.content}`);
  });
});

describe("RuleBasedInterviewer.nextUtterance", () => {
  it("按序取预设追问", async () => {
    const r = new RuleBasedInterviewer();
    const u = await r.nextUtterance(makeCtx({ followUpIndex: 2 }));
    expect(u).toBe("追问三");
  });

  it("候选人回答过短时追加展开提示", async () => {
    const r = new RuleBasedInterviewer();
    const u = await r.nextUtterance(
      makeCtx({
        followUpIndex: 0,
        history: [
          { id: 1, sessionId: 1, questionId: 1, role: "candidate", content: "不知道", createdAt: new Date() },
        ],
      }),
    );
    expect(u).toContain("展开");
    expect(u).toContain("追问一");
  });

  it("预问候尽时使用通用模板", async () => {
    const r = new RuleBasedInterviewer();
    const u = await r.nextUtterance(makeCtx({ followUpIndex: 99 }));
    expect(u.length).toBeGreaterThan(0);
  });
});

describe("RuleBasedInterviewer.evaluate", () => {
  const baseTranscript: GroupedTranscript = {
    groups: [
      {
        question,
        messages: [
          { id: 1, sessionId: 1, questionId: 1, role: "interviewer", content: "问题", createdAt: new Date() },
          {
            id: 2,
            sessionId: 1,
            questionId: 1,
            role: "candidate",
            content:
              "shared memory 的 bank 按 4 字节×32 划分，同一 warp 访问同一 bank 的不同地址会串行化；广播是例外；可以用 padding 错位消除。".repeat(
                3,
              ),
            createdAt: new Date(),
          },
        ],
      },
    ],
    targetRole: "AI Infra 工程师",
    durationMinutes: 10,
  };

  it("覆盖要点的回答得分不低于空白回答", async () => {
    const r = new RuleBasedInterviewer();
    const good = await r.evaluate(baseTranscript);
    const empty = await r.evaluate({
      ...baseTranscript,
      groups: [{ question, messages: [] }],
    });
    const score = (g: string) => ({ A: 4, B: 3, C: 2, D: 1 })[g as "A" | "B" | "C" | "D"];
    expect(score(good.questions[0].dimensions[0].grade)).toBeGreaterThanOrEqual(
      score(empty.questions[0].dimensions[0].grade),
    );
    expect(good.evaluatedBy).toBe("rule");
    expect(good.questions[0].title).toBe(question.title);
  });

  it("空回答给出复习建议", async () => {
    const r = new RuleBasedInterviewer();
    const empty = await r.evaluate({ ...baseTranscript, groups: [{ question, messages: [] }] });
    expect(empty.questions[0].suggestion).toContain("复习");
  });
});
