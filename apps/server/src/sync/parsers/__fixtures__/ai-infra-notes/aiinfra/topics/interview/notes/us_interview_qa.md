# AI Infra 面试题与参考答案（北美面经篇）

> **来源**：知乎帖子 [《AI infra 面试经验贴》](https://zhuanlan.zhihu.com/p/1970722821522061231)（作者"抠抠歪"，理工科 PhD，北美 HPC 背景，面了美国十几家公司，方向为 kernel 开发与分布式通信）
> **说明**：原帖用 `(x)` `(xx)` `(xxx)` 标注题目在面试中出现的频率（低/中/高），本文保留该标注，并为每道题附上参考答案
> **原帖结构**：① 基础知识 ② 手撕 GPU kernel ③ LeetCode ④ 系统设计

---

## 一、基础知识（xxx）

### 1. GPU 相关（xxx）

**Q：GPU 的硬件架构和软件编程架构分别是什么？**

- 硬件层级：GPU → GPC（Graphics Processing Cluster）→ SM（Streaming Multiprocessor）→ CUDA Core / Tensor Core；SM 内有 shared memory / L1 cache、register file、warp scheduler；各 SM 共享 L2 cache 与 HBM/GDDR 显存
- 软件层级：grid → thread block → warp（32 线程，SIMT 执行）→ thread；block 调度到 SM 上执行，block 内线程可用 shared memory 通信、`__syncthreads()` 同步
- 编程模型要点：kernel 配置 `<<<grid, block>>>`，host/device 异构编程，异步 stream

**Q：TMA、CUTLASS、CuTe DSL 分别是什么？（NVIDIA 新特性）**

- **TMA**（Tensor Memory Accelerator，Hopper 引入）：硬件异步批量拷贝单元，一条指令完成 global ↔ shared 的多维 tensor tile 搬运，配合 mbarrier 做异步完成通知，解放线程去做计算，是 warp specialization 流水线的基础
- **CUTLASS**：NVIDIA 的 CUDA C++ 模板库，把 GEMM 等算子抽象为 threadblock/warp/thread 多级 tile + collective/mainloop/epilogue，可复用高性能组件组装 kernel
- **CuTe DSL**：CUTLASS 3.x 的核心抽象——Layout（逻辑坐标到物理偏移的映射函数）与 Tensor 的代数系统，用 `composition`/`tiled_divide` 等操作统一描述数据布局与 tiling；CuTe DSL 也指其 Python 绑定（cutlass 4.x 的 `cutlass.cute`），可用 Python 写高性能 kernel

**Q：如何判别 compute-bound 还是 memory-bound？什么是 Roofline Model？**

- **Roofline Model**：横轴为算术强度（arithmetic intensity，$I = \text{FLOPs} / \text{Bytes}$），纵轴为性能（FLOP/s）。理论峰值由两段构成：$\min(\text{峰值算力},\ I \times \text{峰值带宽})$
- 判别：计算 kernel 的算术强度 $I$，与机器的拐点（ridge point，$\text{峰值算力}/\text{峰值带宽}$，H100 约 295 TFLOPS ÷ 3.35 TB/s ≈ 88 FLOP/Byte）比较：$I$ 大于拐点为 compute-bound，否则 memory-bound
- 工程做法：用 Nsight Compute 看 SM busy 与 DRAM throughput 哪个更接近打满；elementwise/softmax 类是 memory-bound，大 GEMM 是 compute-bound

