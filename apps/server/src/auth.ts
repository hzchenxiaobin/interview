import { db } from "./db/client.js";
import { users } from "./db/schema.js";

/**
 * 本地单用户简化认证：首个请求自动 provision 唯一的 users 行。
 * 认证层集中于此，后续可替换为 Kimi OAuth（README §2.1）。
 */
let cachedUserId: number | null = null;

export async function getCurrentUserId(): Promise<number> {
  if (cachedUserId != null) return cachedUserId;
  const existing = await db.select().from(users).limit(1);
  if (existing.length > 0) {
    cachedUserId = existing[0].id;
    return cachedUserId;
  }
  const inserted = await db.insert(users).values({ name: "考生" }).$returningId();
  cachedUserId = inserted[0].id;
  return cachedUserId;
}

/** 测试用：重置缓存 */
export function _resetUserCache() {
  cachedUserId = null;
}
