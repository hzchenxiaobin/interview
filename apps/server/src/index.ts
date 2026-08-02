import { Hono } from "hono";
import { cors } from "hono/cors";
import { trpcServer } from "@hono/trpc-server";
import { serve } from "@hono/node-server";
import { appRouter } from "./routers/index.js";
import { createContext } from "./trpc.js";
import { env } from "./env.js";

const app = new Hono();

app.use("/trpc/*", cors());
app.use(
  "/trpc/*",
  trpcServer({ router: appRouter, createContext }),
);

app.get("/healthz", (c) => c.json({ ok: true }));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`server listening on http://localhost:${info.port}`);
});
