import { fileURLToPath } from "node:url";
import { z } from "zod";

// 加载仓库根目录 .env（不存在则忽略，走默认值/进程环境变量）
try {
  process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
} catch {
  // .env 不存在时使用进程环境变量与默认值
}

const envSchema = z.object({
  DATABASE_URL: z.string().default("mysql://root:root@localhost:3306/interview"),
  PORT: z.coerce.number().int().default(3001),
  LLM_BASE_URL: z.string().default("https://api.moonshot.cn/v1"),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default("moonshot-v1-8k"),
  /** 部分网关（如 cannbot）除 Bearer 外还要求 x-api-vkey 头 */
  LLM_VKEY: z.string().default(""),
  /** 本地 leetcode 仓库路径（在线评测取参考代码/签名用），默认面试仓库的同级 leetcode 目录 */
  LEETCODE_REPO_DIR: z
    .string()
    .default(fileURLToPath(new URL("../../../../leetcode", import.meta.url))),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;
