import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

export const healthRouter = router({
  health: publicProcedure
    .input(z.object({ name: z.string().optional() }).optional())
    .query(({ input, ctx }) => ({
      ok: true as const,
      message: `hello ${input?.name ?? "interview"}`,
      userId: ctx.userId,
      now: new Date(),
    })),
});
