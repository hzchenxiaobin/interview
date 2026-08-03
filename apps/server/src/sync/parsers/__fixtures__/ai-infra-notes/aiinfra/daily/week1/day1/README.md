# Week 1 Day 1

## Day 1：GPU 执行模型基础

### 🎯 目标

理解 SM/Warp/SIMT 执行模型，写出第一个 CUDA 程序。这一天建立对 GPU 硬件执行方式的直觉，
为后续 Occupancy 与内存优化打基础。内容足够长以超过正文下限，此处继续补充说明文字若干。

### 理论学习

GPU 由多个 SM 组成，每个 SM 包含若干 CUDA core。kernel 以 grid/block/thread 三级层次启动，
warp 是 32 个线程的调度单位，采用 SIMT 执行模型。

### 面试要点

1. **什么是 SIMT？与 SIMD 的区别？**

<details>
<summary>点击查看答案</summary>

 - SIMT：32 个线程执行同一条指令，各自处理不同数据
 - SIMD：一条指令处理固定宽度向量

</details>

2. **Warp divergence 是什么？如何避免？**

<details>
<summary>点击查看答案</summary>

 - 同一 warp 内线程走不同分支，需串行执行
 - 让相邻线程走相同分支

</details>

### 今日总结

回顾执行模型要点。
