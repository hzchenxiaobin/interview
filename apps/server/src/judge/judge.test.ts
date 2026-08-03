import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { env } from "../env.js";
import {
  extractReferenceCode,
  parseCppSignature,
  parseExamples,
  parsePythonSignature,
  unsupportedReason,
} from "./parse.js";
import { outputsEqual, runJudge } from "./run.js";

const repo53 = path.join(env.LEETCODE_REPO_DIR, "solution/0001-0100/53_最大子数组和.md");
const hasRepo = existsSync(repo53);

describe("judge parse", () => {
  it("从题面解析示例用例", () => {
    const content = [
      "给你一个整数数组 `nums`。",
      "",
      "**示例 1**：",
      "",
      "```text",
      "输入：nums = [-2,1,-3,4,-1,2,1,-5,4]",
      "输出：6",
      "解释：连续子数组 [4,-1,2,1] 的和最大，为 6。",
      "```",
      "",
      "**示例 2**：",
      "",
      "```text",
      "输入：nums = [1]",
      "输出：1",
      "```",
    ].join("\n");
    const cases = parseExamples(content);
    expect(cases).toHaveLength(2);
    expect(cases[0].args).toEqual([{ name: "nums", value: "[-2,1,-3,4,-1,2,1,-5,4]" }]);
    expect(cases[0].expected).toBe("6");
    expect(cases[1].expected).toBe("1");
  });

  it("多参数 + 字符串 + 布尔值", () => {
    const content = [
      "```text",
      '输入：s = "anagram", t = "nagaram"',
      "输出：true",
      "```",
    ].join("\n");
    const cases = parseExamples(content);
    expect(cases).toHaveLength(1);
    expect(cases[0].args.map((a) => a.name)).toEqual(["s", "t"]);
    expect(cases[0].expected).toBe("true");
  });

  it("解析 C++ 签名并识别不支持类型", () => {
    const spec = parseCppSignature(
      "class Solution {\npublic:\n  vector<vector<string>> groupAnagrams(vector<string>& strs) {\n    return {};\n  }\n};",
    )!;
    expect(spec.name).toBe("groupAnagrams");
    expect(spec.returnType).toBe("vector<vector<string>>");
    expect(spec.params).toEqual([
      { name: "strs", type: "vector<string>", raw: "vector<string>& strs" },
    ]);
    expect(unsupportedReason(spec)).toBeNull();

    const listSpec = parseCppSignature(
      "class Solution {\npublic:\n  ListNode* reverseList(ListNode* head) {\n    return head;\n  }\n};",
    )!;
    expect(unsupportedReason(listSpec)).toContain("ListNode");
  });

  it("解析 Python 签名", () => {
    const spec = parsePythonSignature(
      "class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        pass\n",
    )!;
    expect(spec.name).toBe("twoSum");
    expect(spec.params.map((p) => p.name)).toEqual(["nums", "target"]);
  });
});

describe("judge outputsEqual", () => {
  it("数值容差与无序数组", () => {
    expect(outputsEqual("6", "6")).toBe(true);
    expect(outputsEqual("1.00001", "1.0")).toBe(true);
    expect(outputsEqual('[["bat"],["nat","tan"],["ate","eat","tea"]]', '[["eat","tea","ate"],["tan","nat"],["bat"]]')).toBe(true);
    expect(outputsEqual("[0,1]", "[1,0]")).toBe(false);
    expect(outputsEqual("7", "6")).toBe(false);
  });
});

describe.skipIf(!hasRepo)("judge e2e（53 最大子数组和）", () => {
  async function load() {
    const md = await readFile(repo53, "utf8");
    const cases = parseExamples(md);
    expect(cases.length).toBeGreaterThanOrEqual(3);
    return { md, cases };
  }

  it("C++ 参考代码通过全部示例", async () => {
    const { md, cases } = await load();
    const code = extractReferenceCode(md, "cpp")!;
    const spec = parseCppSignature(code)!;
    const result = runJudge({ language: "cpp", code, spec, cases });
    expect(result.status).toBe("ok");
    expect(result.passed).toBe(result.total);
  }, 60_000);

  it("Python 参考代码通过全部示例", async () => {
    const { md, cases } = await load();
    const code = extractReferenceCode(md, "python")!;
    const spec = parsePythonSignature(code)!;
    const result = runJudge({
      language: "python",
      code,
      spec: { ...spec, returnType: "" },
      cases,
    });
    expect(result.status).toBe("ok");
    expect(result.passed).toBe(result.total);
  }, 60_000);

  it("错误答案判 fail，编译错误回报", async () => {
    const { cases } = await load();
    const spec = parseCppSignature("class Solution { public: int maxSubArray(vector<int>& nums) { return 0; } };")!;
    const wrong = runJudge({ language: "cpp", code: "class Solution { public: int maxSubArray(vector<int>& nums) { return 0; } };", spec, cases });
    expect(wrong.status).toBe("ok");
    expect(wrong.passed).toBeLessThan(wrong.total);

    const bad = runJudge({ language: "cpp", code: "this is not c++", spec, cases });
    expect(bad.status).toBe("compile_error");
    expect(bad.compileError).toBeTruthy();
  }, 60_000);
});
