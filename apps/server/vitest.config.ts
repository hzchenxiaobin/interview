import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // 测试走独立数据库，不碰开发库数据（interview_test 需先执行迁移）
      // 本机 MySQL 宿主端口 3307（3306 留给 astock 项目，见 docker-compose.override.yml）
      DATABASE_URL: "mysql://root:root@localhost:3307/interview_test",
      // 测试全程走规则引擎，不依赖真实 LLM（.env 中的 LLM_API_KEY 不影响测试）
      LLM_API_KEY: "",
    },
  },
});
