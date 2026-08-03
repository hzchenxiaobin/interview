import { describe, expect, it } from "vitest";
import { loadFixtures } from "./fixtures.js";
import { parse } from "./leetgpu.js";

describe("leetgpu parser", () => {
  it("解析难度目录下的 solution 文件，sourceKey 用目录名；白名单外题被过滤", async () => {
    const files = await loadFixtures("leetgpu");
    const { questions, skipped } = parse(files);

    expect(skipped).toEqual([]);
    // easy/1_vector_add 是低频题（不在 leetgpu-hot23.txt），被白名单过滤
    expect(questions).toHaveLength(1);
    expect(questions[0].category).toBe("cuda");
    expect(questions[0].sourceKey).toBe("leetgpu:hard/74_gpt2_block");
  });

  it("完整结构（以白名单内题号目录解析 vector_add 固件）", async () => {
    const files = (await loadFixtures("leetgpu")).map((f) =>
      f.path.startsWith("easy/1_vector_add/")
        ? { ...f, path: f.path.replace("easy/1_vector_add/", "easy/4_reduction/") }
        : f,
    );
    const { questions } = parse(files);
    const q = questions.find((x) => x.sourceKey === "leetgpu:easy/4_reduction")!;

    expect(q.title).toBe("1. Vector Addition");
    expect(q.difficulty).toBe("easy");
    expect(q.tags).toBe("CUDA,grid-stride loop,coalesced access,memory-bound");
    expect(q.source).toBe("LeetGPU #1");
    // content = 题目概述 + GPU 设计
    expect(q.content).toContain("逐元素和");
    expect(q.content).toContain("## GPU 设计");
    expect(q.content).toContain("grid-stride loop");
    // followUps 来自性能分析节（小节标题 + 优化方向要点）
    expect(q.followUps.length).toBeGreaterThan(0);
    expect(q.followUps.some((f) => f.includes("ncu"))).toBe(true);
    // keyPoints = 复杂度分析表（算术强度/瓶颈类型）+ ncu 指标表
    expect(q.keyPoints).toContain("算术强度");
    expect(q.keyPoints).toContain("瓶颈类型");
    expect(q.keyPoints).toContain("dram__throughput.avg.pct_of_peak_sustained_elapsed");
  });

  it("容忍缺节（hard/74_gpt2_block 无性能分析节，复杂度分析是 §3）", async () => {
    const { questions } = parse(await loadFixtures("leetgpu"));
    const q = questions.find((x) => x.sourceKey === "leetgpu:hard/74_gpt2_block")!;

    expect(q.title).toBe("74. GPT-2 Transformer Block");
    expect(q.difficulty).toBe("hard");
    expect(q.followUps).toEqual([]);
    expect(q.keyPoints).toContain("O(N²d + Nd²)");
    expect(q.content).toContain("## GPU 设计");
  });
});
