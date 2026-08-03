import type { QuestionInput } from "@interview/contracts";

/** 内置种子题库（README §7.5）：四方向各 3–5 道，含完整 followUps 与 keyPoints */
export const SEED_QUESTIONS: QuestionInput[] = [
  // ---------------------------------------------------------------- 算法
  {
    category: "leetcode",
    title: "两数之和",
    content:
      "给定整数数组 nums 和目标值 target，返回和为 target 的两个下标。要求时间复杂度优于 O(n²)。",
    difficulty: "easy",
    tags: "哈希表,数组",
    followUps: [
      "为什么哈希表能把时间降到 O(n)？一次遍历为什么就够了？",
      "如果要求返回所有满足条件的数对呢？去重怎么处理？",
      "如果数组已排序，有没有更省空间的做法？",
      "扩展到三数之和，整体思路是什么？复杂度多少？",
    ],
    keyPoints:
      "哈希表存 值→下标，遍历中查 target-x；一次遍历 O(n)/O(n)；排序+双指针 O(nlogn) 时间 O(1) 空间但不能回原下标；三数之和排序+双指针 O(n²)。",
    source: "LeetCode 1",
  },
  {
    category: "leetcode",
    title: "最大子数组和（Kadane）",
    content: "给定整数数组 nums，求具有最大和的连续子数组（至少含一个元素），返回其和。",
    difficulty: "easy",
    tags: "动态规划,数组,分治",
    followUps: [
      "Kadane 的状态转移方程是什么？为什么以 i 结尾来定义状态？",
      "全是负数时算法行为是什么？需要特殊处理吗？",
      "分治法怎么解？跨中点的情况怎么合并？复杂度是多少？",
      "如果要求返回具体子数组而不仅是和，怎么改？",
    ],
    keyPoints:
      "dp[i]=max(nums[i], dp[i-1]+nums[i])，以 i 结尾的最大子数组和；全负数自然成立（取最大单元素）；分治 O(nlogn)，合并跨中点向左/右最大延伸；记录区间需维护起止下标。",
    source: "LeetCode 53",
  },
  {
    category: "leetcode",
    title: "LRU Cache",
    content:
      "设计满足 LRU（最近最少使用）淘汰策略的缓存，get 和 put 均要求 O(1)。容量满时淘汰最久未使用的项。",
    difficulty: "medium",
    tags: "设计,哈希表,双向链表",
    followUps: [
      "为什么用哈希表 + 双向链表？单向链表差在哪？",
      "put 已存在的 key 时要注意什么？",
      "哨兵头尾节点带来了什么好处？",
      "并发环境下这个结构有什么问题？怎么改？",
    ],
    keyPoints:
      "哈希表 O(1) 定位 + 双向链表 O(1) 摘除/头插；删除任意节点需要前驱指针故必须双向；put 命中要更新值并移动到头部；哨兵节点消除空指针分支；并发需加锁或分段锁/无锁结构。",
    source: "LeetCode 146",
  },
  {
    category: "leetcode",
    title: "二叉树层序遍历",
    content: "给定二叉树根节点，按层从左到右返回节点值（逐层分组）。",
    difficulty: "medium",
    tags: "树,BFS,队列",
    followUps: [
      "怎么区分一层的结束和下一层的开始？",
      "如果要求自底向上返回呢？锯齿形（之字形）呢？",
      "DFS 能不能做层序遍历？怎么记录层号？",
      "N 叉树层序遍历有什么变化？",
    ],
    keyPoints:
      "BFS+队列，按层 size 切片分组；自底向上最后 reverse 或头插；之字形按层奇偶翻转；DFS 记录 depth 写入 res[depth]；N 叉树仅把左右孩子换成 children 列表。",
    source: "LeetCode 102",
  },
  // ---------------------------------------------------------------- CUDA
  {
    category: "cuda",
    title: "Shared Memory Bank Conflict 如何排查与消除",
    content: "解释 shared memory bank conflict 的成因，并说明在 kernel 中如何定位和优化。",
    difficulty: "medium",
    tags: "shared memory,性能优化",
    followUps: [
      "32 个 bank 的划分规则是什么？什么访问模式会触发 32-way conflict？",
      "broadcast 和 multicast 机制为什么不算 conflict？",
      "padding 消除 conflict 的原理是什么？有什么代价？",
      "你在 ncu 里用什么指标确认 conflict 被消除了？",
    ],
    keyPoints:
      "bank 按 4 字节×32 划分；同一 warp 访问同一 bank 不同地址则串行化；广播例外；padding 错位（如 tile[32][33]）；ncu 的 l1tex__data_bank_conflicts 指标验证。",
    source: "CUDA 课程 · 内存层级章节",
  },
  {
    category: "cuda",
    title: "Grid-Stride Loop 是什么，解决什么问题",
    content: "解释 grid-stride loop 的写法与动机：为什么 CUDA kernel 常用它处理任意规模数据。",
    difficulty: "easy",
    tags: "CUDA 基础,grid-stride loop,coalesced access",
    followUps: [
      "相比一个线程处理一个元素，grid-stride loop 在 launch 配置上有什么灵活性？",
      "步长取 gridDim.x * blockDim.x 为什么能保证访问合并（coalesced）？",
      "什么情况下 grid-stride loop 反而不划算？",
      "它和 occupancy 调优怎么配合？",
    ],
    keyPoints:
      "for (i = blockIdx*blockDim+threadIdx; i < n; i += gridDim*blockDim)；线程数与数据规模解耦、控制 launch 开销；相邻线程访问相邻地址保持合并；小数据量下循环开销无收益；配合固定 grid 大小打满 SM。",
    source: "CUDA 课程 · kernel 基础",
  },
  {
    category: "cuda",
    title: "Online Softmax（FlashAttention 前置知识）",
    content:
      "讲解 online softmax 的递推公式：如何在遍历 KV 块时维护 running max 与 running sum，避免存储全量 attention 分数。",
    difficulty: "hard",
    tags: "softmax,FlashAttention,online 算法",
    followUps: [
      "朴素 softmax 为什么要先求 max？数值上解决什么问题？",
      "online softmax 里 correction factor exp(m_old - m_new) 的作用是什么？",
      "为什么说它把两遍扫描变成一遍？内存访问量差多少？",
      "FlashAttention 如何利用 online softmax 做到 O(N) 显存？",
    ],
    keyPoints:
      "减 max 防 exp 溢出；m_new=max(m_old, x)，l_new = l_old*exp(m_old-m_new)+exp(x-m_new)；单遍维护 (m,l) 即可；FlashAttention 分块 KV、边算边归一化，显存从 O(N²) 降到 O(N)。",
    source: "FlashAttention 论文 / CUDA 课程",
  },
  {
    category: "cuda",
    title: "内存合并访问（Coalesced Access）与算术强度",
    content:
      "什么是 coalesced memory access？结合算术强度说明为什么大多数 elementwise kernel 是 memory-bound。",
    difficulty: "medium",
    tags: "内存系统,算术强度,roofline",
    followUps: [
      "一个 warp 一次访存理想情况下合并成多少字节的 transaction？",
      "strided access 和 random access 对有效带宽的影响差多少？",
      "算术强度怎么定义？vector add 的算术强度大约是多少？",
      "roofline 模型上，memory-bound 的 kernel 优化的上限由什么决定？",
    ],
    keyPoints:
      "warp 32 线程连续 4B 访问合并为 128B transaction；stride 越大有效带宽越低；算术强度=FLOP/字节，vector add≈0.083 FLOP/B 远低于 GPU 平衡点（如 A100 ~10+）；memory-bound 优化上限是显存带宽，方向是减少访存量。",
    source: "CUDA 课程 · 性能分析",
  },
  {
    category: "cuda",
    title: "如何用 ncu Roofline 分析一个 kernel",
    content: "说明用 Nsight Compute 对 kernel 做 roofline 分析的流程：看哪些指标、如何判定瓶颈、下一步动作。",
    difficulty: "medium",
    tags: "ncu,roofline,工具链",
    followUps: [
      "sm__throughput 和 dram__throughput 哪个高分别说明什么？",
      "achieved occupancy 低一定是问题吗？什么情况下是合理的？",
      "如果判定是 memory-bound，你下一步的优化顺序是什么？",
      "speed-of-light 和 roofline 两个 section 的结论矛盾时怎么办？",
    ],
    keyPoints:
      "sm__ 高→compute-bound，dram__ 高→memory-bound；occupancy 低但访存已打满时合理（如大 tile）；memory-bound 先查合并访问→再减访存量（tiling/融合）；结合多 section 交叉验证，必要时看 source counter 定位到行。",
    source: "profiling 实战记录",
  },
  // ------------------------------------------------------- 专业知识（C++）
  {
    category: "knowledge",
    title: "指针与引用、别名分析",
    content: "讲解 C++ 中指针与引用的本质区别，以及什么是别名（aliasing）、它对优化的影响。",
    difficulty: "easy",
    tags: "指针,引用,aliasing",
    followUps: [
      "引用底层是怎么实现的？说\"引用就是 const 指针\"哪里不准确？",
      "strict aliasing 规则是什么？违反它会怎样？",
      "__restrict 关键字解决什么问题？",
      "为什么编译器对两个指针参数的函数常常无法优化掉重复加载？",
    ],
    keyPoints:
      "引用必须初始化、不可重新绑定、语法上无空引用；底层常实现为指针但语义是别名；strict aliasing 禁止不兼容类型互指（char* 例外）；__restrict 承诺无重叠使能向量化/缓存优化；指针可能互为别名迫使编译器保守重新加载。",
    source: "C++ 课程",
  },
  {
    category: "knowledge",
    title: "四种类型转换运算符",
    content: "static_cast / dynamic_cast / const_cast / reinterpret_cast 各自的作用、开销与适用场景。",
    difficulty: "easy",
    tags: "类型系统,cast",
    followUps: [
      "dynamic_cast 为什么有运行时开销？依赖什么机制？",
      "downcast 用 static_cast 有什么风险？",
      "const_cast 去掉 const 后修改原对象一定是未定义行为吗？",
      "为什么 C++ 推荐用这些运算符而不是 C 风格强转？",
    ],
    keyPoints:
      "dynamic_cast 依赖 RTTI，沿继承链检查，失败返 nullptr（引用抛 bad_cast）；static_cast downcast 无检查，类型不符即 UB；原对象本身非 const 时 const_cast 后修改合法，否则 UB；命名转换语义明确、可搜索、编译器分级检查。",
    source: "C++ 课程",
  },
  {
    category: "knowledge",
    title: "模板与实例化",
    content: "函数模板/类模板的实例化过程、两阶段查找（two-phase lookup）、SFINAE 的基本思想。",
    difficulty: "medium",
    tags: "模板,泛型,SFINAE",
    followUps: [
      "模板代码为什么要放在头文件里？显式实例化是例外吗？",
      "两阶段查找中，非依赖名和依赖名分别在什么时候查找？",
      "typename 和 template 关键字什么时候必须写？",
      "SFINAE 的替换失败发生在哪个阶段？它和 static_assert 报错的区别？",
    ],
    keyPoints:
      "模板按需实例化，定义需对调用点可见（通常头文件）；显式实例化声明可分离；非依赖名定义点查找，依赖名实例化点查找（ADL）；依赖名前要 typename/template 消歧；SFINAE 在重载决议的替换阶段失败仅移除候选，不报错。",
    source: "C++ 课程",
  },
  {
    category: "knowledge",
    title: "string 子串查找与时间复杂度意识",
    content:
      "实现/分析子串查找：std::string::find 在做什么？暴力、KMP、Boyer-Moore 的复杂度与工程取舍。",
    difficulty: "medium",
    tags: "string,算法,KMP",
    followUps: [
      "KMP 的 next 数组本质上缓存了什么信息？",
      "为什么工程上 std::string::find 往往不用 KMP？",
      "Boyer-Moore 的坏字符规则在最好情况下能快到什么程度？",
      "短模式串场景下有什么更实用的优化？",
    ],
    keyPoints:
      "next[i]=前缀表（最长相等前后缀），失配时不回退主串指针 O(n+m)；标准库多用 memchr+两段比较等常数优化，KMP 常数大且需额外空间；BM 最好 O(n/m) 跳跃；短模式可用 SIMD/memchr 加速首字符过滤。",
    source: "C++ 课程",
  },
  // ------------------------------------------------------- 专业知识（项目）
  {
    category: "knowledge",
    title: "STAR 讲一个性能优化项目",
    content:
      "请用 STAR 框架完整讲述一个你主导的性能优化项目（如 CUDA kernel 优化）：背景、目标、行动、量化结果。",
    difficulty: "medium",
    tags: "STAR,性能优化,项目讲述",
    followUps: [
      "当时是怎么定位瓶颈的？用了什么工具，看到了什么指标？",
      "优化前后的量化对比是什么？基线公平吗？",
      "考虑过哪些备选方案？为什么选了这个？",
      "如果再做一次，有什么不同的做法？",
    ],
    keyPoints:
      "STAR 四要素完整；瓶颈定位讲清工具链（ncu/nsys）与关键指标（吞吐/occupancy/bank conflict）；收益量化且说明测试条件；方案权衡体现工程判断；复盘有深度而非套话。",
    source: "面经 · 项目题",
  },
  {
    category: "knowledge",
    title: "讲一次 profiling 工具链实践（ncu/nsys）",
    content:
      "介绍一次你用 ncu 或 nsys 定位并解决性能问题的经历：问题现象、分析路径、结论与验证。",
    difficulty: "medium",
    tags: "profiling,ncu,nsys,工具链",
    followUps: [
      "nsys 和 ncu 的分工是什么？什么时候先看哪个？",
      "你看到的第一个异常指标是什么？怎么排除掉干扰因素的？",
      "结论是如何验证的？改了什么，指标怎么变化的？",
      "这个经验对之后写 kernel 有什么方法论上的沉淀？",
    ],
    keyPoints:
      "nsys 看时间线/调度/kernel 间隙，ncu 看单 kernel 微观指标；从 speed-of-light 到具体 section 逐层下钻；控制变量验证；沉淀出可复用的瓶颈判定流程（先 SOL 后专项）。",
    source: "profiling 实战记录",
  },
];
