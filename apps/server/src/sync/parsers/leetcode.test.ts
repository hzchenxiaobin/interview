import { describe, expect, it } from "vitest";
import { loadFixtures } from "./fixtures.js";
import { parse } from "./leetcode.js";

describe("leetcode parser", () => {
  it("解析 solution 下的题解文件", async () => {
    const files = await loadFixtures("leetcode");
    // 混入范围外文件，应被忽略而非 skip
    files.push({ path: "README.md", content: "# repo" }, { path: "solution/SKILL.md", content: "# skill" });
    const { questions, skipped } = parse(files);

    expect(skipped).toEqual([]);
    expect(questions).toHaveLength(4);
    for (const q of questions) {
      expect(q.category).toBe("leetcode");
      expect(q.sourceKey).toMatch(/^leetcode:solution\//);
    }
  });

  it("问答同行变体 + 章节跳号（45 跳跃游戏 II，无扩展节）", async () => {
    const { questions } = parse(await loadFixtures("leetcode"));
    const q = questions.find((x) => x.sourceKey.includes("45_"))!;

    expect(q.title).toBe("45. 跳跃游戏 II");
    expect(q.followUps).toHaveLength(4);
    expect(q.followUps[0]).toBe("为什么遍历到 `n-2` 而不是 `n-1`");
    expect(q.keyPoints).toContain("终点不需要再跳");
    expect(q.keyPoints).toContain("时间复杂度");
  });

  it("主流格式：编号问题 + 缩进 bullet 答案（53 最大子数组和）", async () => {
    const { questions } = parse(await loadFixtures("leetcode"));
    const q = questions.find((x) => x.sourceKey.includes("53_"))!;

    expect(q.title).toBe("53. 最大子数组和");
    expect(q.difficulty).toBe("medium");
    expect(q.tags).toBe("数组,分治,动态规划,贪心");
    expect(q.source).toBe("LeetCode 53");
    expect(q.content).toContain("最大和的连续子数组");
    expect(q.followUps).toHaveLength(4);
    expect(q.followUps[0]).toBe("Kadane 算法的状态转移方程是什么？");
    // keyPoints = 面试要点答案 + 复杂度分析节原文
    expect(q.keyPoints).toContain("dp[i] = max(nums[i], dp[i-1] + nums[i])");
    expect(q.keyPoints).toContain("时间复杂度");
    expect(q.keyPoints).toContain("O(n)");
  });

  it("少数格式：**Q1：问题** + 引用块答案（20 有效括号）", async () => {
    const { questions } = parse(await loadFixtures("leetcode"));
    const q = questions.find((x) => x.sourceKey.includes("20_"))!;

    expect(q.title).toBe("20. 有效括号");
    expect(q.difficulty).toBe("easy");
    expect(q.followUps).toHaveLength(5);
    expect(q.followUps[0]).toBe("为什么用栈而不是队列？");
    expect(q.keyPoints).toContain("LIFO");
  });

  it("LCOF 前缀题号与剑指 Offer 链接（LCOF51）", async () => {
    const { questions } = parse(await loadFixtures("leetcode"));
    const q = questions.find((x) => x.sourceKey.includes("LCOF51"))!;

    expect(q.title).toBe("LCOF51. 数组中的逆序对");
    expect(q.difficulty).toBe("hard");
    expect(q.source).toBe("LeetCode 51");
    expect(q.followUps.length).toBeGreaterThan(0);
  });

  it("缺元数据的文件记入 skipped", () => {
    const { questions, skipped } = parse([
      { path: "solution/0001-0100/999_坏文件.md", content: "# 只有标题\n\n没有元数据。\n" },
    ]);
    expect(questions).toHaveLength(0);
    expect(skipped).toEqual(["solution/0001-0100/999_坏文件.md"]);
  });
});
