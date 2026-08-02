import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { QueryClient } from "@tanstack/react-query";
import type { AppRouter } from "@interview/server";
import superjson from "superjson";

export const queryClient = new QueryClient();

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
      transformer: superjson,
    }),
  ],
});

export const trpc = createTRPCOptionsProxy<AppRouter>({
  client: trpcClient,
  queryClient,
});

// ---------------------------------------------------------------------------
// 常用返回类型（从 trpcClient 推导，避免引入 @trpc/server）
// ---------------------------------------------------------------------------

export type QuestionListData = Awaited<ReturnType<typeof trpcClient.question.list.query>>;
export type QuestionListItem = QuestionListData["items"][number];
export type SessionListItem = Awaited<ReturnType<typeof trpcClient.interview.list.query>>[number];
export type InterviewGetData = Awaited<ReturnType<typeof trpcClient.interview.get.query>>;
export type InterviewStatsData = Awaited<ReturnType<typeof trpcClient.interview.stats.query>>;
