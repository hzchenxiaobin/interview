import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://root:root@localhost:3306/interview"),
  PORT: z.coerce.number().int().default(3001),
  LLM_BASE_URL: z.string().default("https://api.moonshot.cn/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("moonshot-v1-8k"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
