import { initTRPC } from "@trpc/server";
import superjson from "superjson";
import { getCurrentUserId } from "./auth.js";

export async function createContext() {
  const userId = await getCurrentUserId();
  return { userId };
}
export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;
/** 登录态查询（本地单用户下始终有 userId，保留分层以便未来接 OAuth） */
export const authedProcedure = t.procedure;
