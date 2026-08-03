import { readFile } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { questions } from "../db/schema.js";
import { env } from "../env.js";
import {
  extractReferenceCode,
  parseCppSignature,
  parseExamples,
  parsePythonSignature,
  unsupportedReason,
  type MethodSpec,
} from "../judge/parse.js";
import { runJudge } from "../judge/run.js";
import { authedProcedure, router } from "../trpc.js";

type QuestionRow = typeof questions.$inferSelect;

interface JudgeContext {
  question: QuestionRow;
  examples: ReturnType<typeof parseExamples>;
  cppSpec: MethodSpec | null;
  cppReference: string | null;
  pySpec: Omit<MethodSpec, "returnType"> | null;
  pyReference: string | null;
}

async function loadJudgeContext(questionId: number, userId: number): Promise<JudgeContext> {
  const rows = await db
    .select()
    .from(questions)
    .where(and(eq(questions.id, questionId), eq(questions.userId, userId)))
    .limit(1);
  const question = rows[0];
  if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "题目不存在" });
  if (question.category !== "leetcode" || !question.sourceKey.startsWith("leetcode:")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "仅 leetcode 方向的同步题支持在线评测" });
  }
  const rel = question.sourceKey.slice("leetcode:".length);
  const md = await readFile(path.join(env.LEETCODE_REPO_DIR, rel), "utf8").catch(() => null);
  if (!md) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `本地仓库缺少题解文件 ${rel}（LEETCODE_REPO_DIR=${env.LEETCODE_REPO_DIR}）`,
    });
  }
  const cppReference = extractReferenceCode(md, "cpp");
  const pyReference = extractReferenceCode(md, "python");
  return {
    question,
    examples: parseExamples(question.content),
    cppSpec: cppReference ? parseCppSignature(cppReference) : null,
    cppReference,
    pySpec: pyReference ? parsePythonSignature(pyReference) : null,
    pyReference,
  };
}

function cppStarter(spec: MethodSpec): string {
  const params = spec.params.map((p) => p.raw).join(", ");
  return [
    "class Solution {",
    "public:",
    `    ${spec.returnType} ${spec.name}(${params}) {`,
    "        // TODO: 在这里实现",
    "    ",
    "    }",
    "};",
    "",
  ].join("\n");
}

function pyStarter(spec: Omit<MethodSpec, "returnType">): string {
  const params = ["self", ...spec.params.map((p) => p.name)].join(", ");
  return ["class Solution:", `    def ${spec.name}(${params}):`, "        pass", ""].join("\n");
}

export const judgeRouter = router({
  /** 评测题目详情：题面 + 示例用例 + 各语言 starter/参考代码 */
  getProblem: authedProcedure
    .input(z.object({ questionId: z.number() }))
    .query(async ({ input, ctx }) => {
      const { question, examples, cppSpec, cppReference, pySpec, pyReference } =
        await loadJudgeContext(input.questionId, ctx.userId);
      const cppReason = cppSpec
        ? unsupportedReason(cppSpec)
        : "题解中未找到 C++ 参考代码或签名";
      // Python 签名不含类型注解解析，参数类型与 C++ 一致，复用其支持性判断
      const pyReason = pySpec == null ? "题解中未找到 Python 参考代码或签名" : cppReason;
      return {
        question: {
          id: question.id,
          title: question.title,
          difficulty: question.difficulty,
          content: question.content,
          source: question.source,
        },
        examples,
        cpp: {
          available: cppSpec != null && cppReason == null,
          reason: cppReason,
          starter: cppSpec ? cppStarter(cppSpec) : null,
          reference: cppReference,
        },
        python: {
          available: pySpec != null && pyReason == null,
          reason: pyReason,
          starter: pySpec ? pyStarter(pySpec) : null,
          reference: pyReference,
        },
      };
    }),

  /** 提交代码，跑全部示例用例 */
  run: authedProcedure
    .input(
      z.object({
        questionId: z.number(),
        language: z.enum(["cpp", "python"]),
        code: z.string().min(1).max(100_000),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { examples, cppSpec, pySpec } = await loadJudgeContext(input.questionId, ctx.userId);
      if (input.language === "cpp") {
        if (!cppSpec) throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 C++ 参考签名" });
        const reason = unsupportedReason(cppSpec);
        if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
        return runJudge({ language: "cpp", code: input.code, spec: cppSpec, cases: examples });
      }
      if (!pySpec) throw new TRPCError({ code: "BAD_REQUEST", message: "该题无 Python 参考签名" });
      const reason = cppSpec ? unsupportedReason(cppSpec) : null;
      if (reason) throw new TRPCError({ code: "BAD_REQUEST", message: reason });
      return runJudge({
        language: "python",
        code: input.code,
        spec: { ...pySpec, returnType: "" },
        cases: examples,
      });
    }),
});
