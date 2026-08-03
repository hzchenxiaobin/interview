# 模拟面试系统 · 软件设计文档

> 版本：v1.0（设计稿，不含实现）
> 目标用户：AI Infra 方向求职者（CUDA/GPU、C++、算法、项目经历）
> 知识来源：用户自有课程材料 + LeetCode 练习题

---

## 1. 背景与目标

### 1.1 背景

用户正在准备 AI Infra 岗位（阿里/字节/腾讯方向）的技术面试，已将学习材料沉淀为三个 GitHub 公开仓库（账号：[hzchenxiaobin](https://github.com/hzchenxiaobin)）：

| 仓库 | 内容 | 对应面试方向 |
|------|------|-------------|
| [ai-infra-notes](https://github.com/hzchenxiaobin/ai-infra-notes) | AI Infra 八股知识：12 个技术专题（cpp / cuda / cute / cutlass / deepgemm / moe / pytorch / shengteng / transformer / triton / vllm / interview），含面经 Q&A、8 周学习计划、ncu/nsys profiling 实战记录 | knowledge |
| [leetcode](https://github.com/hzchenxiaobin/leetcode) | LeetCode 算法题解（100+ 题，按题号分段组织），每题含题面、思路、代码、复杂度、**面试要点 Q&A** | leetcode |
| [leetgpu](https://github.com/hzchenxiaobin/leetgpu) | LeetGPU CUDA 编程题解（easy / medium / hard 分级），每题含 GPU 设计、kernel 实现、ncu 性能分析、算术强度分析 | cuda |

三个仓库的文件格式高度统一（详见 §7.1），具备程序化解析条件。

此外还有：课程材料、真实项目经历（CUDA kernel 优化、性能分析工具链实践）。

痛点：知识是"输入型"的，而面试是"输出型"的——需要在压力下**口头表达**、**应对追问**、**结构化呈现**。看书和刷题无法模拟这种场景。

### 1.2 目标

构建一个以个人知识库为基础的模拟面试 Web 应用：

1. **以用户自己的材料出题**：面试题来自用户上传的课程笔记和 LeetCode 题目，而不是泛泛的公共题库；
2. **模拟真实面试节奏**：AI 扮演面试官，主问题 → 追问 ×N → 下一题，一次只问一个问题；
3. **结构化反馈**：每轮结束输出按维度评分的诊断报告（正确性/完整性/表达/深度，或 STAR 框架）；
4. **可追踪进步**：保存全部面试记录，按方向统计薄弱环节。

### 1.3 非目标（本期不做）

- 多人协作 / 面试官真人入驻
- 语音面试（语音转文字）—— 列为 V2 迭代项
- 在线代码运行评测（判题机）—— 列为 V3 迭代项

---

## 2. 用户角色与核心场景

### 2.1 角色

单一角色：**考生**（系统所有者本人）。通过 Kimi 登录隔离数据，天然支持未来多用户。

### 2.2 核心用户故事

| # | 场景 | 验收标准 |
|---|------|---------|
| S1 | 导入知识 | 用户一键同步 GitHub 仓库（ai-infra-notes / leetcode / leetgpu），系统解析为结构化题目进入题库；也可粘贴 JSON 补充 |
| S2 | 管理题库 | 按方向（Leetcode/CUDA/专业知识）、难度、标签筛选、增删改题目 |
| S3 | 发起面试 | 选择方向组合 + 题量（如 CUDA×2 + 算法×1），系统抽题开场 |
| S4 | 作答与被追问 | 聊天式作答；面试官每次只追问 1 个问题，循序渐进，3–5 个追问后换题 |
| S5 | 获得报告 | 结束面试后生成 Markdown 报告：逐题维度评分 + 综合等级 A/B/C/D + 改进建议 |
| S6 | 复盘历史 | 查看历史场次、回看对话、按方向统计平均等级 |

---

## 3. 系统架构

### 3.1 总体架构

```
┌─────────────────────────────────────────────────┐
│ 前端  React + TypeScript + Vite + Tailwind      │
│       shadcn/ui · react-router                  │
│   Dashboard │ 题库 │ 面试间(聊天) │ 报告 │ 历史 │
└──────────────┬──────────────────────────────────┘
               │ tRPC（端到端类型安全，superjson）
┌──────────────┴──────────────────────────────────┐
│ 后端  Hono + tRPC                                │
│  ├─ questionRouter   题库 CRUD / 批量导入        │
│  ├─ interviewRouter  面试状态机（核心）           │
│  ├─ materialRouter   材料解析导入                │
│  └─ interviewer engine                           │
│       ├─ LLM 适配层（OpenAI 兼容协议）           │
│       └─ 规则引擎降级（无 API Key 时可用）        │
├─────────────────────────────────────────────────┤
│ MySQL（Drizzle ORM）                             │
│ users │ questions │ sessions │ messages         │
├─────────────────────────────────────────────────┤
│ 外部依赖：LLM API（可选，Moonshot 兼容端点）      │
└─────────────────────────────────────────────────┘
```

**关键架构决策**：

- **AD-1 全栈一体化**：题库和面试记录必须跨设备持久化，故采用数据库而非 localStorage。
- **AD-2 LLM 抽象层**：面试官能力封装为接口 `IInterviewer`，有两个实现——`LlmInterviewer`（接 OpenAI 兼容 API，默认 Moonshot）和 `RuleBasedInterviewer`（基于题目预设追问 + 模板评分）。系统在未配置 API Key 时自动降级为规则引擎，保证开箱即用。
- **AD-3 状态机在服务端**：面试进度（第几题、第几个追问）持久化在数据库，刷新页面/换设备可断点续面。
- **AD-4 端到端类型安全**：contracts 目录共享类型与常量，前端不手写后端实体类型。

### 3.2 技术选型

| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | React 19 + Vite + Tailwind + shadcn/ui | 组件库齐全，聊天/卡片/侧边栏快速搭建 |
| 通信 | tRPC 11 + superjson | 免手写 API 类型，Date 等类型自动序列化 |
| 后端 | Hono (Node) | 轻量，与 tRPC 集成好 |
| 数据库 | MySQL + Drizzle ORM | 类型安全查询、迁移管理 |
| 认证 | Kimi OAuth | 平台内置，免自建账号体系 |
| LLM | OpenAI 兼容协议客户端 | 可切换任意兼容端点（Moonshot/DeepSeek/本地 vLLM） |

---

## 4. 数据模型设计

### 4.1 ER 关系

```
users 1───n questions          （个人题库）
users 1───n interview_sessions （面试场次）
sessions 1───n interview_messages（对话流水）
sessions n───n questions       （由 sessions.questionIds 快照记录）
```

### 4.2 表结构

**questions（题库）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | |
| userId | bigint FK → users | 归属用户 |
| category | enum(leetcode, cuda, knowledge) | 三大方向（C++/项目已合并为专业知识） |
| title | varchar(500) | 题目标题，如"最大子数组和（Kadane）" |
| content | text | 题面/背景（LeetCode 描述、课程知识点） |
| difficulty | enum(easy, medium, hard) | |
| tags | varchar(500) | 逗号分隔，如"动态规划,数组" |
| followUps | json string[] | 预设追问列表（规则引擎用 + LLM 的提示素材） |
| keyPoints | text | 评分要点/参考答案要点（报告"对照要点"用） |
| source | varchar(255) | 来源："LeetCode 53"、"CUDA 课程第 6 章" |
| createdAt / updatedAt | timestamp | |

**interview_sessions（面试场次）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | |
| userId | bigint FK | |
| title | varchar(255) | 自动生成，如"CUDA+算法混合面试 0802" |
| categories | json string[] | 本场覆盖方向 |
| questionIds | json number[] | **抽题快照（有序）**，删题不影响历史场次 |
| currentIndex | int | 当前第几题（状态机位置） |
| followUpIndex | int | 当前题已追问次数 |
| status | enum(active, finished) | |
| overallGrade | varchar(8) | 综合等级 A/B/C/D |
| report | text | 最终 Markdown 报告 |
| createdAt / finishedAt | timestamp | 可用于统计面试时长 |

**interview_messages（对话流水）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial PK | |
| sessionId | bigint FK | |
| questionId | bigint nullable | 该消息归属哪道题（报告按题聚合用） |
| role | enum(interviewer, candidate, system) | |
| content | text | |
| createdAt | timestamp | |

**users**：平台认证模板自带（unionId、name、role 等），不重复设计。

---

## 5. 核心流程设计：面试状态机

### 5.1 状态机

```
        start(categories, count)
                │
                ▼
        ┌──────────────┐   作答 reply     ┌──────────────┐
        │  ASKING_MAIN  │ ───────────────▶ │ FOLLOWING_UP  │
        │ （抛出主问题） │                  │ （追问 1..N）  │
        └──────────────┘                  └──────┬───────┘
                ▲                                │ 追问候尽/答满 N 轮
                │ 还有下一题                        │
                └────────────────────────────────┘
                                                 │ 题目耗尽
                                                 ▼
                                          ┌────────────┐
                                          │ EVALUATING │ 生成报告
                                          └─────┬──────┘
                                                ▼
                                          ┌──────────┐
                                          │ FINISHED │
                                          └──────────┘
```

持久化字段 `(currentIndex, followUpIndex, status)` 即状态机的完整状态，任何时刻可从数据库恢复。

### 5.2 关键流程时序

**发起面试（start）**：

1. 校验参数：方向集合、题量 N（1–10）
2. 按方向从题库随机抽题（每方向按比例分配），**将 questionIds 快照写入 session**（即使题目后来被删/改，历史场次仍完整）
3. 插入第一条 `interviewer` 消息：开场白 + 第一题主问题

**作答（reply）**——核心循环：

1. 写入 candidate 消息
2. 查询当前题的 followUps：
   - `followUpIndex < min(followUps.length, MAX_FOLLOW_UPS=4)` → 生成下一个追问（LLM 动态生成，或取预设追问），`followUpIndex+1`
   - 否则进入下一题：`currentIndex+1`，`followUpIndex=0`，插入新题消息
   - 题目耗尽 → 触发 finish 流程
3. 返回新插入的 interviewer 消息（前端轮询/直接渲染）

**结束（finish）**：

1. 聚合本场全部消息，按 questionId 分组
2. 逐题评分（LLM 一次调用评全部，或规则引擎模板评分）
3. 生成综合报告 Markdown + overallGrade，写回 session，status=finished

### 5.3 单问题原则（面试官行为约束）

无论 LLM 还是规则引擎，生成追问时遵守：

- 每次只输出 1 个问题，禁止"A？B？C？"复合追问；
- 追问顺序由浅入深：细节澄清 → 边界/权衡 → 扩展延伸 → 实战关联；
- 不提前泄露参考答案；keyPoints 只用于评分和报告对照，不出现在面试官消息中。

---

## 6. AI 面试官设计

### 6.1 接口抽象

```typescript
interface IInterviewer {
  // 生成下一句面试官发言（追问 or 新题过渡）
  nextUtterance(ctx: InterviewContext): Promise<string>;
  // 生成整场评估报告
  evaluate(transcript: GroupedTranscript): Promise<EvaluationResult>;
}

interface InterviewContext {
  question: Question;            // 当前题（含 followUps、keyPoints）
  history: InterviewMessage[];   // 本场对话历史
  followUpIndex: number;
  targetRole: string;            // 如 "AI Infra 工程师"
}
```

### 6.2 LlmInterviewer

- **端点配置**：`LLM_BASE_URL`（默认 `https://api.moonshot.cn/v1`）、`LLM_API_KEY`、`LLM_MODEL`，OpenAI 兼容 `/chat/completions`。
- **System Prompt 结构**（面试官人设）：
  1. 角色：资深技术面试官，面试 AI Infra 岗位候选人；
  2. 当前题目材料：题面 + 预设追问方向 + 评分要点（要点仅作追问灵感，禁止泄露）；
  3. 行为约束：单问题原则、循序渐进、压力感与专业性平衡、不重复候选人已答内容；
  4. 输出契约：只输出面试官的下一句发言，不加旁白。
- **评估 Prompt**：输入按题分组的对话 + 每题 keyPoints，输出结构化 JSON（见 §8 评分体系），后端解析后渲染 Markdown 报告。JSON 用 schema 校验，解析失败重试 1 次，仍失败降级为规则评分。
- **成本控制**：追问用短上下文（当前题 + 最近 6 条消息）；评估一次调用评整场；设置 max_tokens 上限与超时（15s），超时降级规则引擎。

### 6.3 RuleBasedInterviewer（降级实现，无 Key 也能用）

- **追问**：按序取题目的 `followUps[i]`，并做轻量个性化拼接（如候选人回答过短 → "能再展开一下 X 吗？"模板）；
- **评分**：启发式规则——回答长度/轮数覆盖度 → 表达分；keyPoints 关键词命中数 → 完整性分；输出模板化报告并在每题附上"参考要点"供自查；
- 报告中明确标注"本次由规则引擎评估"，与 LLM 评估区分。

### 6.4 降级与容错策略总表

| 故障 | 策略 |
|------|------|
| 未配置 LLM_API_KEY | 全程规则引擎 |
| LLM 超时/5xx | 本次追问取预设 followUps，记录降级日志 |
| 评估 JSON 解析失败 | 重试 1 次 → 规则评分 |
| 题库为空 | start 接口报错并引导先导入/播种题库 |

---

## 7. 知识库导入设计

知识来源以用户的三个 GitHub 仓库为主（§1.1），辅以手工录入和种子题库。题库条目在**实际开发/运行时从仓库读取并解析生成**，不预先生成静态题库文件。

### 7.1 P0：GitHub 仓库同步导入（核心入口）

**仓库结构与解析规则**（基于对三个仓库实际文件的分析，格式高度统一，可用纯规则解析，不依赖 LLM）：

**① leetcode 仓库 → category=leetcode**

- 目录约定：`solution/{题号区间}/{题号}_{题名}.md`，如 `solution/0001-0100/53_最大子数组和.md`；
- 每篇题解 7 个固定章节：题目概述 → 解题思路 → 参考代码 → 复杂度分析 → 扩展 → **面试要点** → 同类练习题；
- 字段映射：
  - `title` ← 文件名（题号 + 题名）
  - `difficulty` / `tags` / `source` ← "题目概述"章节中的元数据行（难度、标签、leetcode.cn 链接）
  - `content` ← §1 题目概述正文
  - `followUps` ← **§6"面试要点"章节的每个编号问题**（该章节本身就是现成的追问列表）
  - `keyPoints` ← §6 各问题答案 + §4 复杂度分析表

**② leetgpu 仓库 → category=cuda（cuda 分类只保留 leetgpu 编程题，其他 CUDA 八股/概念题归 knowledge）**

- 目录约定：`{easy|medium|hard}/{题号}_{题名}/leetgpu-*-solution.md`，一题一目录，难度即目录名；
- 字段映射：
  - `title` / `difficulty` ← 目录名
  - `tags` / `source` ← §1 题目概述（标签如 grid-stride loop、coalesced access、memory-bound；leetgpu.com 链接）
  - `content` ← §1 题目概述 + §3 GPU 设计
  - `followUps` ← §5 性能分析/优化方向中的要点转化为追问（如"如何用 ncu 确认该 kernel 是 memory-bound？"）
  - `keyPoints` ← §6 复杂度分析表（算术强度、瓶颈类型）+ ncu 指标表

**③ ai-infra-notes 仓库 → category=knowledge**

- 目录约定：`aiinfra/topics/{cpp, cuda, cute, cutlass, deepgemm, interview, moe, pytorch, shengteng, transformer, triton, vllm}/` 共 12 个专题；
- `aiinfra/topics/interview/notes/*.md`（面经、国内外面试 Q&A）→ 每条 Q&A 直接解析为一题（问题→title/content，答案→keyPoints）；
- 其余专题文档按二级标题切分为知识点题目，`tags` ← 专题名；
- `profiling/week1~3/` 的 ncu/nsys 实战记录 → category=knowledge 的 STAR 素材题（情境=性能问题，行动=分析过程，结果=优化收益）。

**同步机制设计**：

- 后端 `materialRouter.syncRepo(owner, repo)`：通过 GitHub API（公开仓库无需 token）拉取仓库 zip / git tree，按上述规则解析入库；
- **增量更新**：记录每个仓库最近同步的 commit SHA 与每个文件的内容哈希，重复同步时仅处理变更文件，已入库题目内容不变则跳过（幂等）；
- **删除策略**：仓库中消失的文件默认保留题库条目并标记 `source` 失效（避免误删面试历史关联），用户可在题库页手动清理；
- 题库页提供"从 GitHub 同步"按钮 + 同步状态展示（各仓库题数、最近同步时间）。

### 7.2 P1：结构化粘贴导入

- 前端提供 JSON 模板粘贴框 / 表单逐题录入；
- JSON 格式：`[{category, title, content, difficulty, tags, followUps[], keyPoints, source}]`，zod 校验后批量入库；
- 用于补充仓库之外的零散材料（课程截图笔记、临时看到的题）。

### 7.3 P2：Markdown 笔记导入

- 约定简单标记格式（如 `## [cuda][medium] 标题` 分题），上传 .md 文件后端解析入库；
- 适合未入库的本地笔记批量转题。

### 7.4 P3：LLM 辅助抽取（依赖 LLM 配置）

- 粘贴任意课程文本，后端调 LLM 抽取"可面试的知识点 → 题目+追问+评分要点"三元组，用户确认后入库；
- 对仓库中格式不规则的文档（如 daily 计划、paper 笔记）作为兜底解析手段。

### 7.5 种子题库

系统提供一键播种：三大方向各 3–5 道高质量内置题（含完整 followUps 和 keyPoints），保证首次使用即可面试，例如：

- Leetcode：两数之和、最大子数组和（Kadane）、LRU Cache、二叉树层序遍历
- 专业知识：CUDA 八股（Shared Memory bank conflict 排查、Grid-Stride Loop、online softmax、内存合并访问、ncu roofline 分析）、C++ 八股（指针与引用/别名分析、四种类型转换、模板与实例化、string 子串与时间处理）、项目经历（STAR 讲一个性能优化项目，追问：瓶颈定位、量化收益、方案权衡、复盘）

---

## 8. 评分体系设计

### 8.1 分方向评分维度

| 方向 | 维度（各 A/B/C/D） |
|------|------------------|
| Leetcode | 正确性 · 复杂度分析 · 边界处理 · 表达清晰度 |
| CUDA/GPU | 概念正确性 · 性能意识（访存/占用率/并行度）· 工具链实践（nsys/ncu）· 表达清晰度 |
| 专业知识 | 准确性 · 深度（底层机制）· 工程权衡 · 表达清晰度；项目经历题按 STAR 四要素（S/T/A/R）诊断 |

### 8.2 综合等级

- 逐题维度分映射 A=4/B=3/C=2/D=1，取均值 → 综合等级；
- 报告结构：总评（等级 + 一句话总结）→ 逐题详情（各维度评分 + 诊断 + 改进建议 + 参考要点对照）→ 薄弱维度 Top2 + 专项训练建议（对应题库中的题目链接）。

### 8.3 统计看板

- 历史场次列表（时间、方向、题数、等级、时长）；
- 按方向的等级分布雷达图 / 近 10 场趋势线——用于"百万计划"的进度追踪。

---

## 9. 接口设计（tRPC 路由清单）

**questionRouter**

| 方法 | 类型 | 说明 |
|------|------|------|
| list(category?, difficulty?, search?) | query | 筛选分页 |
| stats() | query | 各方向题目数（Dashboard 用） |
| create / update / remove | mutation | 单题管理 |
| bulkImport(items[]) | mutation | §7.1 JSON 批量导入，zod 校验 |
| seed() | mutation | 播种内置题库（幂等） |

**interviewRouter**

| 方法 | 类型 | 说明 |
|------|------|------|
| start(categories[], count) | mutation | 抽题、建场次、返回首条消息 |
| reply(sessionId, content) | mutation | 核心循环，返回面试官新消息 + 当前状态 |
| finish(sessionId) | mutation | 生成报告（reply 触发题目耗尽时自动调用） |
| list() | query | 历史场次 |
| get(sessionId) | query | 场次详情 + 全部消息 + 报告 |

**materialRouter（P1 起）**：importMarkdown / extractByLlm / importLeetCodeList。

统一约定：所有写操作 zod 校验；所有查询走 authedQuery（Kimi 登录态）；错误码沿用 tRPC 标准码。

---

## 10. 页面设计

| 路由 | 页面 | 内容 |
|------|------|------|
| / | Dashboard | 四方向卡片（题数）· 开始面试入口（选方向+题量）· 近 5 场记录 · 薄弱方向提示 |
| /bank | 题库管理 | 方向 Tab + 难度/标签/搜索筛选 · 题目卡片（展开看追问与要点）· 新增/编辑弹窗 · JSON 导入 · 一键播种 |
| /interview/:id | 面试间 | 聊天流（面试官左/考生右）· 顶部进度：第 i/n 题 · 第 j/m 追问 · 输入框（支持多行、代码块）· "结束本场"按钮 |
| /report/:id | 评估报告 | 总评卡 + 逐题折叠面板 + Markdown 渲染 + 对话回放 Tab |
| /history | 历史统计 | 场次表格 + 方向等级雷达图 + 趋势 |

面试间交互细节：发送后本地乐观渲染考生消息 → reply 返回后追加面试官消息；面试中禁止修改题库快照内题目（服务端已快照，天然满足）；页面卸载后从 get(sessionId) 恢复。

---

## 11. 非功能需求

- **性能**：面试接口 P95 < 3s（规则引擎）；LLM 模式下 < 18s（含超时降级）。题库 < 10k 条无需复杂检索。
- **安全**：题库/场次按 userId 隔离；LLM Key 仅存服务端环境变量，绝不下发前端；所有输入 zod 校验防注入。
- **可靠性**：面试状态落库，断线可恢复；LLM 全链路有降级。
- **成本**：无 LLM Key 时零外部成本；有 Key 时单场面试约 5–10 次调用，控制在几千 token 量级。
- **可扩展**：category 增加新方向只需改 enum + 常量；IInterviewer 可插拔。

---

## 12. 迭代规划

| 版本 | 范围 | 依赖 |
|------|------|------|
| **V1 MVP** | 题库 CRUD + **GitHub 仓库同步导入（三仓库规则解析）** + 种子题 + 面试状态机 + 规则引擎评分 + 报告 + 历史 | 无外部依赖（公开仓库无需 token） |
| **V1.5** | 接入 LLM 面试官（配置 Key 即启用）· 薄弱维度统计看板 | Moonshot API Key |
| **V2** | Markdown 课程笔记导入 · LLM 知识点抽取 · 语音作答（ASR） | LLM |
| **V3** | 算法题在线代码编辑器 + 判题（sandbox 运行）· 错题自动回流入库 | 判题沙箱 |

**MVP 验收路径**：播种题库 → 发起"CUDA+算法"3 题面试 → 完成作答 → 拿到规则引擎报告 → 历史记录可查。全链路无 LLM 依赖，当天可用。

---

## 附录 A：题目 JSON 导入格式示例

```json
[
  {
    "category": "cuda",
    "title": "Shared Memory Bank Conflict 如何排查与消除",
    "content": "解释 bank conflict 的成因，并说明在 kernel 中如何定位和优化。",
    "difficulty": "medium",
    "tags": "shared memory,性能优化",
    "followUps": [
      "32 个 bank 的划分规则是什么？什么访问模式会触发 32-way conflict？",
      "broadcast 和 multicast 机制为什么不算 conflict？",
      "padding 消除 conflict 的原理是什么？有什么代价？",
      "你在 ncu 里用什么指标确认 conflict 被消除了？"
    ],
    "keyPoints": "bank 按 4 字节×32 划分；同一 warp 访问同一 bank 不同地址则串行化；广播例外；padding 错位；ncu 的 l1tex__data_bank_conflicts 指标验证",
    "source": "CUDA 课程 · 内存层级章节"
  }
]
```

## 附录 B：评估报告 Markdown 模板

```markdown
# 面试评估报告（场次 #42 · CUDA/算法 · 3 题 · 38 分钟）

## 总评：B+
优势：性能工具链实践扎实；短板：复杂度口头推导不够熟练。

## 第 1 题：Shared Memory Bank Conflict（cuda）
- 概念正确性 A · 性能意识 B · 工具链实践 A · 表达 B
- 诊断：……  改进建议：……
- 参考要点对照：……

## 专项训练建议
1. [题库] 最大子数组和——练习 30 秒内说出 O(n)/O(nlogn) 两种解法对比
2. ……
```


---

## 13. 开发进度与交接（2026-08-02）

> 本节为实施交接说明，非设计稿内容。当前代码已按 §12 的「V1 MVP + LLM 面试官」范围实施，因原环境无法安装 Docker，剩余工作需在新环境（能跑 Docker 的机器）继续。

### 13.1 新环境启动步骤

```bash
pnpm install
cp .env.example .env          # 按需填 LLM_API_KEY（不填则全程规则引擎）
docker compose up -d          # MySQL 8，root/root，库名 interview，端口 3306
pnpm db:migrate               # 迁移文件已生成：apps/server/src/db/migrations/
pnpm dev                      # server :3001 + web :5173（/trpc 已配代理）
```

验证：`pnpm --filter @interview/server test`（规则引擎单测任何环境可跑；状态机集成测试在 DB 可用时自动执行，无 DB 自动 skip）。浏览器打开 http://localhost:5173 ，题库页点「一键播种」后即可发起面试。

### 13.2 已完成（代码层面，部分未经 DB 端到端验证）

| 模块 | 位置 | 状态 |
|------|------|------|
| 工程骨架（pnpm monorepo：apps/server、apps/web、packages/contracts） | 全仓 | ✅ tsc 通过 |
| DB schema（users/questions/interview_sessions/interview_messages/repo_syncs）+ 首版迁移 | apps/server/src/db/ | ✅ 迁移已生成，未在真库执行 |
| 本地单用户认证（自动 provision，接口可替换为 Kimi OAuth） | apps/server/src/auth.ts | ✅ |
| questionRouter：list/stats/create/update/remove/bulkImport/seed（幂等） | apps/server/src/routers/question.ts | ✅ 待 DB 验证 |
| 种子题库 15 道（§7.5 四方向，含 followUps/keyPoints） | apps/server/src/seed.ts | ✅ |
| 面试状态机：start（按比例抽题+快照）/reply（追问·换题·自动结束）/finish/list/get | apps/server/src/routers/interview.ts | ✅ 待 DB 验证 |
| RuleBasedInterviewer（预设追问 + 启发式评分 + 附录 B 报告） | apps/server/src/interviewer/rule.ts | ✅ 5 个单测通过 |
| LlmInterviewer（OpenAI 兼容、15s 超时、keyPoints 泄露检查、JSON 评估重试降级） | apps/server/src/interviewer/llm.ts | ✅ 待真实 Key 验证 |
| 统计接口 interview.stats（方向均分 + 近 10 场趋势） | apps/server/src/routers/interview.ts | ✅ 待 DB 验证 |
| 状态机集成测试 3 个（start→reply→自动 finish→报告；断点恢复；空库报错） | apps/server/src/routers/interview.test.ts | ✅ 已写好，需 DB 跑 |

### 13.3 进行中（交接时两个模块正在由子代理编写，文件可能已落盘）

- **GitHub 三仓库同步（Phase 3）**：✅ 已完成（2026-08-02）。`apps/server/src/sync/`（github.ts、parsers/ 三套解析器、幂等编排）+ `apps/server/src/routers/material.ts`（syncRepo/syncStatus）+ `apps/server/scripts/dry-run-sync.ts`。dry-run 实测：leetcode 362 题、leetgpu 103 题、ai-infra-notes 685 题；14 个解析器测试通过。注意：codeload 顶层目录实为 `{repo}-main`（非 `{repo}-{sha}`），commitSha 改用 `git ls-remote` 获取。仅剩真实 DB 下的 syncRepo 入库验证（幂等：重复同步题数不变、stale 标记正确）。
- **前端五页面（Phase 7）**：✅ 已完成（2026-08-02）。`apps/web/src/pages/`（Dashboard/Bank/Interview/Report/History）+ react-router 路由 + Layout 导航；GitHub 同步按钮已对接 material router（含同步状态展示）；Markdown 渲染器/图表均为手写轻量实现，未新增依赖。`tsc -b` 与 `vite build` 全绿。仅剩真实后端联调走查。

### 13.4 剩余待办（按序）

1. ~~起 MySQL、执行迁移（§13.1）。~~ ✅ 2026-08-02 完成。
2. ~~跑状态机集成测试（需 DB）+ 前后端 health 联调。~~ ✅ 22 个测试全过（修了一处测试假设，见 §13.5）。
3. ~~Phase 3 收尾：真实 DB 下跑 syncRepo 入库 → 验证幂等。~~ ✅ 三仓入库 362+103+685=1150 题；二次同步全部 unchanged、零重复，幂等正确。
4. ~~Phase 7 收尾：五页面联调。~~ ✅ 五个路由页面 + 全部 tRPC 接口（question/material/interview 三组）真库走通，`tsc -b` 与 `vite build` 全绿。
5. ~~Phase 8 端到端验收（README §12 路径）。~~ ✅ 规则引擎模式与 **LLM 模式均已验收**（2026-08-02）。LLM 实测（kimi-for-coding）：4 个追问全部为动态生成、单问题、由浅入深；评估报告 evaluated_by=llm，诊断/建议/要点对照质量高；降级路径（401/400/超时/空内容）在调试过程中全部真实触发并正确回落规则引擎。
6. 本节后补运行截图/注意事项。

### 13.5 关键决策与踩坑记录（新环境必读）

- **数据库**：MySQL 8 走 docker-compose（compose 文件已就绪）。原设计「Kimi OAuth」替换为本地单用户认证（auth.ts 一处集中，可换回）。
- **GitHub 拉取**：不用 api.github.com（未认证限流 60 次/时），用 `https://codeload.github.com/{owner}/{repo}/tar.gz/refs/heads/main`，commitSha 从包内顶层目录名 `{repo}-{sha}` 提取。
- **仓库格式实测修正**（设计稿 §7.1 有两处错误，解析器须按实测实现）：
  - leetcode：元数据 4 行块在 **H1 之后、`## 1.` 之前**，不在「题目概述」节内；章节按名称匹配（少数篇目缺「扩展」节导致编号漂移）；面试要点有两种格式（`1. **Q**`+缩进列表 360 篇 / `**Q1：**`+引用块 2 篇）。
  - leetgpu：**ncu 指标表在 §5 性能分析节，不在 §6 复杂度节**；文件 slug 与目录 slug 不总一致（在目录内找 `leetgpu-*-solution.md`）；题号跨目录撞号，唯一键用 `难度+目录名`；hard/74_gpt2_block 缺节。
  - ai-infra-notes：解析前先剥离 fenced code block（防 `# 注释` 误判标题）；interview/notes/面经 1.md 无结构直接跳过；知识点按 H3 切分（H2 不可靠）。
- **幂等同步**：`sourceKey`（repo:路径[:序号]）+ `contentHash`（sha256），不变跳过、变更 upsert、仓库消失的标 stale=1 且 source 加 `[已失效]` 前缀（不删，保护历史场次）。
- **状态机**：reply 的「写消息→推进状态→可能触发 finish」必须在单事务内；题目快照存 questionIds，历史场次不受删题影响。
- **LLM 容错矩阵**（§6.4 已全部实现）：无 Key 全程规则引擎；追问超时/5xx 降级预设 followUp；评估 JSON zod 校验失败重试 1 次再降级；面试官输出做 keyPoints 泄露检查。
- **pnpm 注意**：esbuild 构建脚本白名单写在 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies`（pnpm 11 不再读 package.json 的 pnpm 字段）。
- **集成测试假设修正**（2026-08-02）：`interview.test.ts` 的「空方向题库报 PRECONDITION_FAILED」原假设 project 方向为空，但 `beforeAll` 播种了全量 15 题（含 project 2 题），真库首跑即失败。已改为测试内先删除 project 题再断言（seed 幂等，下次运行自动补回，可重复执行）。
- **同步数据质量观察**（2026-08-02）：ai-infra-notes 中学习计划类文档（如 `cutlass/README.md` 的学习任务、`deepgemm/day*.md`）解析出的条目 `followUps`/`keyPoints` 为空——状态机行为正确（无追问直接换题），但规则引擎报告对这类题诊断意义有限。后续可考虑过滤计划类文档或做质量标记（V1 范围外，不阻塞）。
- **.env 此前无人加载**（2026-08-02 修复）：代码只读 `process.env`，tsx 不自动加载 .env。`env.ts` 现用 Node 内置 `process.loadEnvFile()` 读仓库根 .env（文件不存在则忽略；已有环境变量优先，不覆盖）。
- **LLM 端点与 Key 配套**（2026-08-02）：Kimi Code 会员 Key（`sk-kimi` 开头）必须配 `https://api.kimi.com/coding/v1` + `kimi-for-coding` 等 coding 模型；`api.moonshot.cn/v1` 是 Moonshot 开放平台（另一套计费账号），错配返回 401 Invalid Authentication。`.env.example` 已注明两套配置。
- **kimi-for-coding（K2.7，强制 reasoning）适配**（2026-08-02，llm.ts）：① 请求不传 `temperature`（该模型锁定为 1，显式传 0.7 会 400）；② `max_tokens` 必须给 reasoning 留余量——追问 2048、评估 8192，过小会被思考 token 耗尽导致 content 为空（实测 256 必现）；③ 超时 15s→60s（reasoning 评估常需 20–40s，15s 会两次重试全超时降级规则引擎）。README §11 的「LLM 模式 < 18s」目标对 reasoning 模型不现实，以实际为准。
- **当前模型：glm-5.2（CANNBot 网关）**（2026-08-02）：`.env` 配 `LLM_BASE_URL=https://cannbot.hicann.cn/gateway/compatible-mode/v1`、`LLM_MODEL=glm-5.2`（同为 reasoning 模型，此前全部适配适用）。**该网关要求双头认证**：`Authorization: Bearer <access JWT>`（cannbot CLI 登录后存于 `~/.local/share/opencode/auth.json` 的 `cannbot-cli.access`，超长有效期）+ `x-api-vkey: vk-...`（`cannbot-cli.refresh`）；只带其一返回 `Virtual Key is required`。`env.ts` 新增 `LLM_VKEY`（可选，非空时附加该头）。备选：Kimi Code `k3-256k`（公网）、`kimi-for-coding`。
- **追问上限修复**（2026-08-02，interview.reply）：原实现追问上限 = `min(预设 followUps 数, MAX_FOLLOW_UPS)`，无预设追问的题在 LLM 模式下也 0 追问直接换题。现改为 LLM 模式上限恒为 `MAX_FOLLOW_UPS`（动态生成），规则引擎维持按预设数量（避免泛泛追问刷屏）——`factory.isLlmEnabled()` 判定。
- **开场/换题问题由 LLM 重写**（2026-08-02）：原实现把原始材料（标题 slug + 整段笔记/命令）直接拼进开场消息，profiling 记录类材料体验极差。`IInterviewer` 新增 `openingQuestion(question, targetRole)`：LLM 实现把材料重写为「背景一两句 + 一个明确问题」（失败/泄露要点时降级模板），规则实现保持原标题+题面模板；start 开场与 reply 换题均走该接口。实测 `week1/day5 Bank Conflict Profiling` 重写为引用具体 kernel 名与 ncu 指标的清晰单问。
- **测试库与开发库隔离**（2026-08-02）：集成测试原直连开发库，`空方向题库`用例删除 project 题会连带清空开发环境数据。`vitest.config.ts` 现将 `DATABASE_URL` 指向独立库 `interview_test`（需先 `DATABASE_URL=...interview_test pnpm db:migrate`），并强制 `LLM_API_KEY=""`。
- **密钥卫生**（2026-08-02）：真实 Key 只放 `.env`（已 gitignore）；`.env.example` 被 git 跟踪，绝不放真实 Key（当天误填已即时清除，未进入任何提交）。
- **leetcode 解析白名单（两层）**（2026-08-03，leetcode.ts）：① 仓库根目录 `hot-interview.md` 的「站内题解」链接 → 270 道高频题；② 服务端本地 `apps/server/src/sync/parsers/leetcode-hot150.txt` → 150 道最高频题（Hot 100 全 114 道 + 36 道公司高频/模板补充题，剔除同类简单题）。实际白名单为两层交集，任一缺失时只用另一层，都缺失回退全量。历史已入库的清单外题目需手动标记 stale 清理（已执行：96 + 120 道同步题及 4 道重复种子题标记 `[已失效]`）。注意 `localHotWhitelist` 的文件读取异常会被静默吞掉（返回 null 不过滤），曾因漏导入 `fileURLToPath` 导致白名单失效、同步复活 120 题——改动后务必跑「清单外题解被过滤」单测确认。
- **在线评测（V3 判题提前落地，2026-08-03）**：`/judge/:id` 页面 + `judgeRouter`（getProblem/run），题库 leetcode 题卡片有「在线评测」入口。要点：① LeetCode 不公开完整测试集，评测用例为题面示例（从 questions.content 的 ```text 块解析 输入/输出）；② 方法签名/参考代码不在 DB，运行时从本地仓库读取（`LEETCODE_REPO_DIR`，默认面试仓库同级 `leetcode/`）；③ 支持 C++（g++ 编译，内置 mini-JSON 驱动）与 Python，参数类型限于标量/string/一二维 vector，链表/树（ListNode/TreeNode）题明确报「暂不支持」；④ 输出比对 = JSON 深比较（数值容差 1e-5）+ 二维数组无序兜底；⑤ 用户代码在本机直接执行（个人工具定位），仅有超时约束（编译 30s/运行 8s），无容器隔离，不要部署成多用户服务。
- **leetgpu 题号白名单**（2026-08-03，leetgpu.ts）：本地 `apps/server/src/sync/parsers/leetgpu-hot23.txt`（每行一个题号）按目录题号过滤，清单 = ai-infra-notes `topics/cuda/README.md` 面经高频（#4/5/6/40/50/74/105）+ 中频（#2/3/12/13/16/17/18/22/29/30/53/57/60/67/70/80）共 23 题；文件缺失不过滤。低频 80 题已一次性标记 `[已失效]`。ai-infra-notes 的 CUDA 八股知识点（357 道）不在此分类范围内，未裁剪。
- **本机部署（2026-08-03）**：① 宿主 3306 被 astock 项目占用，`docker-compose.override.yml` 用 `ports: !override` 把 MySQL 映射到 3307（compose 对 ports 默认追加而非替换），`vitest.config.ts` 的测试库地址同步改为 3307；② 本机无 pnpm/corepack，`npm i -g pnpm@latest`（11.x）安装；③ cannbot CLI（1.1.2）因旧版 `opencode.db` 的 `__drizzle_migrations` 缺 `name`/`applied_at` 列导致所有命令报 `no such column: name`——该库无会话数据，备份为 `opencode.db.bak-*` 后删除重建即可；④ CANNBot vkey 通过 `cannbot connect`（交互式输入 vk-...）换取 access JWT，存于 `~/.local/share/opencode/auth.json` 的 `cannbot-cli`，`.env` 据此配置双头认证，glm-5.2 端到端实测通过。
- **daily 周计划入库 + 考察范围 scope**（2026-08-03）：aiInfraNotes 解析器新增 `aiinfra/daily/weekN/dayM/README.md`（每天一题，category=cuda，tags=`daily,weekN`；content=面试要点节之前正文，「面试要点」节 `N. **Q**`+<details> 答案 → followUps/keyPoints），首次同步导入 56 题（8 周 × 7 天）。`interview.start` 新增可选 `scope`（sourceKey 前缀匹配，限 `ai-infra-notes:` 开头），设置时忽略 categories；`question.scopes` 返回可选的周/专题及题数；Dashboard「开始面试」增加考察范围下拉（按方向 / 按周 / 按专题）。session.categories 在 scope 模式下存抽中题的实际方向。
- **规则引擎删除，系统纯 LLM 化**（2026-08-03）：`rule.ts`/`rule.test.ts` 已删除，`factory.getInterviewer()` 恒返回 `LlmInterviewer`，`isLlmEnabled()` 移除（reply 追问上限恒为 `MAX_FOLLOW_UPS`）。容错语义变化：开场/追问失败或疑似泄露要点时**重试一次后抛错**（上层 tRPC 报错呈现）；评估同样重试一次后抛错，LLM 漏题不再补规则评分（合成「未覆盖」条目）；未配置 `LLM_API_KEY` 直接报错（无降级模式）。集成测试改为 `vi.stubGlobal('fetch')` mock LLM 响应（vitest.config 的 `LLM_API_KEY` 填占位值即可，不能为空）。
- **LLM 题库（ai-infra-notes）一次性生成 + 静态入库**（2026-08-03）：`scripts/generate-aiinfra-bank.ts`（`bank:generate`）把仓库 139 个范围内 md 逐文件喂给 glm-5.2 抽取结构化题目，断点续跑（`data/.bank-checkpoint.jsonl`），产物 `apps/server/data/question-bank.ai-infra.json`（614 题，应提交保留）；`scripts/import-aiinfra-bank.ts`（`bank:import`）按 `bank:ai-infra-notes:` sourceKey + contentHash 幂等入库，并把规则解析的 `ai-infra-notes:` 题目标记 `[已失效]`（替代语义）。产物按旧四分类抽取（cpp/cuda/project），导入时统一改写为 knowledge（对齐 d37c8b9：cuda 仅收 leetgpu 编程题）。首次导入 614 题（全部含 followUps/keyPoints）。注意：codeload 大仓库 tarball 用 Node fetch 拉取 body 会永久停滞，`github.ts` 已改 curl 优先。
