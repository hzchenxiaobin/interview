# LeetGPU Vector Addition 题解

## 1. 题目概述

- **标题 / 题号**：Vector Addition（#1，easy）
- **链接**：https://leetgpu.com/challenges/vector-addition
- **难度**：简单
- **标签**：CUDA、grid-stride loop、coalesced access、memory-bound

**题意**：给定两个长度均为 `N` 的 `float32` 向量 `A`、`B`，计算逐元素和 `C[i] = A[i] + B[i]`，结果写入向量 `C`。

**示例**：

```text
输入：A = [1.0, 2.0, 3.0, 4.0]
      B = [5.0, 6.0, 7.0, 8.0]
输出：C = [6.0, 8.0, 10.0, 12.0]
```

**约束**：

- `1 ≤ N ≤ 100,000,000`
- 性能测试取 `N = 25,000,000`
- `solve` 函数签名不可改，外部库禁用，结果必须写入 `C`

> 💡 这是 LeetGPU 的「Hello World」：题面极简，但背后藏着 GPU 编程最核心的两个概念——**数据并行映射**与**合并访存**。把它做透，等于把 memory-bound kernel 的优化模板一次性吃下。

## 3. GPU 设计

### 3.1 并行化策略：grid-stride loop

向量加法是 **embarrassingly parallel**（令人尴尬的并行）的典型：每个 `i` 之间零依赖，天然适合「一个 thread 管一个 `i`」。

但更稳健的做法是 **grid-stride loop**：让线程数远小于 `N`，每个 thread 沿固定步长 `stride = gridDim.x × blockDim.x` 反复跳着处理多个元素，直到越过 `N`。

![Grid-Stride Loop 跨步映射](../../images/vector_addition_grid_stride.svg)

核心伪代码只有 4 行：

```text
tid    = blockIdx.x * blockDim.x + threadIdx.x;
stride = gridDim.x  * blockDim.x;
for (int i = tid; i < N; i += stride)
    C[i] = A[i] + B[i];
```

**为什么这样选 grid 规模？** 经验上让 block 总数 ≈ `SM 数 × (2~4)`，就能填满 SM 的并发驻留 block、又不过度启动。grid-stride 自动保证：**不管** `N` **多大、线程多少，每个元素恰好被一个 thread 处理一次**。

### 3.2 存储层次使用

| 层次 | 是否使用 | 说明 |
|------|----------|------|
| **global memory** | ✓ | `A`、`B`、`C` 都在显存，直接读写 |
| **shared memory** | ✗ | 逐元素无复用，邻 thread 访问不同地址，无需缓存到 shared |
| **register** | ✓（隐式） | `A[i]`、`B[i]` 临时值在寄存器里相加，不落 global |

> 💡 关键判断：向量加法里每个数据**只被读一次、写一次**，没有数据复用。所以 shared memory / L2 缓存对它帮助有限——真正的瓶颈是 **HBM 带宽**。这类 kernel 叫 **memory-bound**。

### 3.3 关键技巧：合并访存（coalesced access）

grid-stride 的索引 `i = tid, tid+stride, ...` 中，`tid` 在 warp 内连续（`threadIdx.x = 0..31`），所以**同一 warp 的 32 个 thread 在同一次循环里访问的是** `A[tid], A[tid+1], ..., A[tid+31]`**——地址完全连续**。

硬件会把这 32 次 `float` 读（共 128 字节）合并成 **一次 128B 的内存事务**，带宽利用率拉满。这就是「合并访存」：

![合并访存 vs 非合并访存](../../images/vector_addition_coalesced.svg)

> ⚠️ 反面教材：如果索引写成 `A[i * 64]` 之类的大步长，同一 warp 的 32 次访问会落在 32 段互不相邻的 128B 区间，硬件被迫发起多达 32 次事务，带宽利用率暴跌到 1/32。**写 elementwise kernel 第一件事：保证 warp 内地址连续。**

## 5. 性能分析与优化

### 5.1 编译与运行

```bash
# 编译（按本机 SM 调 -arch，如 sm_120）
nvcc -O3 -arch=sm_120 vector_add_grid_stride.cu -o vector_add

# 运行（默认 N=25,000,000）
./vector_add 25000000
```

典型输出（RTX 5090 / SM=108）：

```text
N = 25000000  (100.0 MB per vector)
launch: blocks=432  threads=256  (SM=108)
kernel time: 1.92 ms
verify: PASS  (0 / 25000000 mismatch)
effective bandwidth: 312.5 GB/s
```

RTX 5090 的 HBM 理论带宽约 1.5–1.9 TB/s，这里跑到 ~312 GB/s 看似不高，但要注意 `cudaEvent` **计时含一次冷启动**；用 `ncu` 在稳态下重复采样会更接近峰值。

### 5.2 用 ncu profiling

```bash
# 生成可复用 profile 报告（只采集一次 kernel）
ncu --set full --target-processes all -o vecadd_profile \
    ./vector_add 25000000

# 查看带宽与吞吐关键指标
ncu --metrics gpu__time_duration.sum, \
        dram__bytes_read.sum,dram__bytes_write.sum, \
        dram__throughput.avg.pct_of_peak_sustained_elapsed, \
        sm__throughput.avg.pct_of_peak_sustained_elapsed \
    ./vector_add 25000000
```

重点关注三组指标：

| 指标 | 含义 | 期望 |
|------|------|------|
| `dram__throughput.avg.pct_of_peak_sustained_elapsed` | HBM 带宽占峰值比例 | > 80% 即 memory-bound 充分利用 |
| `sm__throughput.avg.pct_of_peak_sustained_elapsed` | SM 算力占峰值比例 | 通常很低（加法太轻） |
| `l1tex__t_sectors_pipe_lsu_mem_global_op_ld.sum` | global load 扇区数 | 应等于 `N/32`（合并后每 warp 4 sector） |

如果 `dram__throughput` 接近峰值、`sm__throughput` 很低，就**坐实了 memory-bound**——再怎么优化计算都没用，只能从「减少访存量 / 提高每次访问效率」入手。

### 5.3 优化方向

1. `float4` **向量化访存**：把 `A/B/C` 当 `float4*` 看，每个 thread 一次读 16 字节、处理 4 个元素，减少指令数与地址计算开销，对带宽受限 kernel 通常有 5–15% 提升。需处理 `N % 4 != 0` 的尾部。
2. `__ldg` **/** `const float* __restrict__`：提示编译器走只读缓存（texture/L1.5）路径，对某些架构有帮助。
3. **launch bound 调参**：`blocks = num_sm × k` 中 `k` 取 2~8 扫一遍，找带宽拐点；过多 block 会让 SM 驻留 block 数下降、反而降低延迟隐藏能力。
4. **CUDA Graph / 流水线**：若 kernel 在更大管线里被反复调用，用 Graph 摊掉启动开销。
5. **多流并发**：单个 vector add 没用，但在批量处理多个向量时，多流可让 HBM 带宽与 PCIe 传输重叠。

> 💡 对这一题，**优化 1（float4）是最值得动手的**：它直接体现「向量化访存」这一 GPU 编程通用模板，做完能迁移到所有 elementwise kernel。

## 6. 复杂度分析

| 维度 | 分析 |
|------|------|
| **时间复杂度** | `O(N)`，每个元素一次加法 |
| **空间复杂度** | `O(N)` 三个长度为 `N` 的 float 数组 |
| **算术强度** | `1 FLOP / 12 B`（1 次加法 ↔ 读 8B + 写 4B）≈ **0.083 FLOP/B** |
| **瓶颈类型** | **memory-bound**：算术强度远低于 GPU 的平衡点（RTX 5090 约 60 FLOP/B），完全被 HBM 带宽限制 |
| **线程数** | `blocks × threads`，与 `N` 解耦（grid-stride 的核心优势） |
| **每 thread 工作量** | `ceil(N / stride)` 个元素，随 `N` 线性增长 |

> 💡 **一句话总结**：向量加法是「带宽天花板」题——它的性能上限由 `峰值带宽 / (3N × 4B)` 决定，所有优化都在逼近这条线。把这道题的 grid-stride + coalesced 模板记住，后面所有 elementwise kernel（ReLU、Sigmoid、bias-add）都是同一个套路。

