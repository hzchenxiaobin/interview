import { describe, expect, it } from "vitest";
import { loadFixtures } from "./fixtures.js";
import { parse } from "./aiInfraNotes.js";

describe("ai-infra-notes parser", () => {
  it("us_interview_qa：每条 Q&A 一题，答案进 keyPoints", async () => {
    const { questions } = parse(await loadFixtures("ai-infra-notes"));
    const us = questions.filter((q) => q.sourceKey.includes("us_interview_qa"));

    expect(us.length).toBeGreaterThanOrEqual(2);
    expect(us[0].category).toBe("knowledge");
    expect(us[0].tags).toBe("面试题");
    expect(us[0].followUps).toEqual([]);
    expect(us[0].title).toContain("GPU 的硬件架构");
    expect(us[0].keyPoints).toContain("GPC");
    // sourceKey 带条目序号
    expect(us.map((q) => q.sourceKey)).toEqual(
      us.map((_, i) => `ai-infra-notes:aiinfra/topics/interview/notes/us_interview_qa.md#${i}`),
    );
  });

  it("social_interview_qa：### Q 标题切分，项目题归 knowledge", async () => {
    const { questions } = parse(await loadFixtures("ai-infra-notes"));
    const social = questions.filter((q) => q.sourceKey.includes("social_interview_qa"));

    expect(social.length).toBeGreaterThanOrEqual(1);
    const projectQ = social.find((q) => q.title.includes("CPU 和 GPU 算子库"))!;
    expect(projectQ.category).toBe("knowledge");
    expect(projectQ.keyPoints).toContain("oneDNN");
  });

  it("面经 1.md 无结构，记入 skipped", async () => {
    const { skipped } = parse(await loadFixtures("ai-infra-notes"));
    expect(skipped).toEqual(["aiinfra/topics/interview/notes/面经 1.md"]);
  });

  it("topics/cpp/day1.md：按 H3 切条目，过滤碎片，代码块内 # 不干扰", async () => {
    const { questions } = parse(await loadFixtures("ai-infra-notes"));
    const topic = questions.filter((q) => q.sourceKey.includes("topics/cpp/day1"));

    const titles = topic.map((q) => q.title);
    expect(titles).toContain("学习任务 1：C++ 内存区域划分（45 分钟）");
    expect(titles).toContain("代码块内标题干扰测试");
    // 短条目被过滤
    expect(titles).not.toContain("编译速查（短条目应被过滤）");
    // 代码块内的 ## 行保留在正文里，而不是切开条目
    const fence = topic.find((q) => q.title === "代码块内标题干扰测试")!;
    expect(fence.content).toContain("## 这是代码注释不是标题");
    for (const q of topic) {
      expect(q.category).toBe("knowledge");
      expect(q.tags).toBe("cpp");
      expect(q.content.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("profiling/weekN/dayM/README.md → knowledge STAR 素材题", async () => {
    const { questions } = parse(await loadFixtures("ai-infra-notes"));
    const q = questions.find((x) => x.sourceKey === "ai-infra-notes:profiling/week1/day1/README.md#0")!;

    expect(q.category).toBe("knowledge");
    expect(q.title).toBe("week1/day1 hello_gpu & Vector Add Profiling");
    expect(q.tags).toBe("profiling,STAR");
    expect(q.content).toContain("ncu --metrics");
    expect(q.keyPoints).toContain("关键洞察");
  });

  it("daily/weekN/dayM/README.md → 每天一题，面试要点转 followUps/keyPoints", async () => {
    const { questions } = parse(await loadFixtures("ai-infra-notes"));
    const q = questions.find(
      (x) => x.sourceKey === "ai-infra-notes:aiinfra/daily/week1/day1/README.md#0",
    )!;

    expect(q.category).toBe("knowledge");
    expect(q.title).toBe("week1/day1 GPU 执行模型基础");
    expect(q.tags).toBe("daily,week1");
    // content 为面试要点节之前的正文，不含面试要点问题
    expect(q.content).toContain("SIMT");
    expect(q.content).not.toContain("Warp divergence 是什么？");
    expect(q.followUps).toEqual(["什么是 SIMT？与 SIMD 的区别？", "Warp divergence 是什么？如何避免？"]);
    // keyPoints 剥离 details/summary 标签
    expect(q.keyPoints).toContain("32 个线程执行同一条指令");
    expect(q.keyPoints).not.toContain("<details>");
  });
});
