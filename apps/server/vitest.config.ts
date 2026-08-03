import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      // 测试走独立数据库，不碰开发库数据（interview_test 需先执行迁移）
      DATABASE_URL: "mysql://root:root@localhost:3306/interview_test",
      // 纯 LLM 模式要求非空 Key；测试用 stub fetch mock LLM 响应，Key 内容无所谓
      LLM_API_KEY: "test-mock-key",
    },
  },
});
