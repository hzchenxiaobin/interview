import type {
  EvaluationResult,
  Grade,
  GroupedTranscript,
  IInterviewer,
  InterviewContext,
  QuestionEvaluation,
} from "@interview/contracts";
import { CATEGORY_DIMENSIONS, computeOverallGrade } from "@interview/contracts";

/** 从 keyPoints 提取关键词（长度≥2 的词/短语） */
function extractKeywords(keyPoints: string): string[] {
  const words = keyPoints
    .split(/[\s，。；、；,.:：()（）/\-—`"'"'!?？|]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);
  return [...new Set(words)];
}

function gradeByRatio(ratio: number): Grade {
  if (ratio >= 0.6) return "A";
  if (ratio >= 0.35) return "B";
  if (ratio >= 0.15) return "C";
  return "D";
}

/**
 * 规则引擎面试官（README §6.3）：无 LLM 时的降级实现。
 * 追问按序取题目预设 followUps；评分用启发式规则，报告标注"规则引擎评估"。
 */
export class RuleBasedInterviewer implements IInterviewer {
  async nextUtterance(ctx: InterviewContext): Promise<string> {
    const { question, followUpIndex, history } = ctx;
    const lastAnswer = [...history].reverse().find((m) => m.role === "candidate");
    const tooShort = lastAnswer != null && lastAnswer.content.trim().length < 20;

    const preset = question.followUps[followUpIndex];
    if (preset) {
      return tooShort
        ? `你的回答比较简略，能再展开一下吗？另外我想追问：${preset}`
        : preset;
    }
    return tooShort
      ? "能再展开讲一讲吗？可以结合具体例子或数据。"
      : "关于这个知识点，还有什么需要补充的吗？比如实际应用或踩过的坑。";
  }

  async evaluate(transcript: GroupedTranscript): Promise<EvaluationResult> {
    const evaluations: QuestionEvaluation[] = transcript.groups.map(({ question, messages }) => {
      const answers = messages.filter((m) => m.role === "candidate");
      const allText = answers.map((m) => m.content).join("\n");
      const totalLen = allText.trim().length;

      // 完整性：keyPoints 关键词命中率
      const keywords = extractKeywords(question.keyPoints);
      const hits = keywords.filter((k) => allText.toLowerCase().includes(k.toLowerCase()));
      const completeness = keywords.length > 0 ? hits.length / keywords.length : 0;

      // 表达：回答轮数覆盖度 + 平均长度
      const expectedTurns = Math.min(Math.max(question.followUps.length, 1), 4) + 1;
      const turnRatio = Math.min(answers.length / expectedTurns, 1);
      const lenRatio = Math.min(totalLen / 400, 1);
      const expression = turnRatio * 0.4 + lenRatio * 0.6;

      const dimensions = CATEGORY_DIMENSIONS[question.category].map((name, i) => {
        // 首个维度看正确性/完整性（关键词命中），最后一个维度看表达，中间维度取折中
        const ratio = i === 0 ? completeness : i === CATEGORY_DIMENSIONS[question.category].length - 1 ? expression : (completeness + expression) / 2;
        return { name, grade: gradeByRatio(ratio) };
      });

      const missed = keywords.filter((k) => !allText.toLowerCase().includes(k.toLowerCase()));
      return {
        questionId: question.id,
        title: question.title,
        category: question.category,
        dimensions,
        diagnosis: `共作答 ${answers.length} 轮、约 ${totalLen} 字；参考要点关键词命中 ${hits.length}/${keywords.length}。`,
        suggestion:
          missed.length > 0
            ? `建议复习以下未覆盖要点：${missed.slice(0, 8).join("、")}${missed.length > 8 ? " 等" : ""}。`
            : "要点覆盖较好，可进一步练习更精炼的结构化表达。",
      };
    });

    const overallGrade = computeOverallGrade(evaluations);
    const dimAvg = new Map<string, number[]>();
    for (const q of evaluations) {
      for (const d of q.dimensions) {
        const arr = dimAvg.get(d.name) ?? [];
        arr.push({ A: 4, B: 3, C: 2, D: 1 }[d.grade]);
        dimAvg.set(d.name, arr);
      }
    }
    const weakDimensions = [...dimAvg.entries()]
      .map(([name, scores]) => ({ name, avg: scores.reduce((a, b) => a + b, 0) / scores.length }))
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 2)
      .map((w) => `${w.name}（平均 ${w.avg.toFixed(1)} 分）——建议在题库中针对该维度专项练习`);

    return {
      overallGrade,
      summary: `本场共 ${evaluations.length} 题，综合等级 ${overallGrade}。规则引擎从要点覆盖度与表达充分度两个角度做了启发式评估，详细逐题诊断见下。`,
      questions: evaluations,
      weakDimensions,
      evaluatedBy: "rule",
    };
  }
}
