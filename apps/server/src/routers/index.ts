import { router } from "../trpc.js";
import { healthRouter } from "./health.js";
import { interviewRouter } from "./interview.js";
import { judgeRouter } from "./judge.js";
import { materialRouter } from "./material.js";
import { questionRouter } from "./question.js";

export const appRouter = router({
  health: healthRouter,
  question: questionRouter,
  interview: interviewRouter,
  material: materialRouter,
  judge: judgeRouter,
});

export type AppRouter = typeof appRouter;
