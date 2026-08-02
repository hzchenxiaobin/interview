# Day 1（周一）：内存模型与基础语义

> **本周定位**：本专题是 C++ 面试的系统化准备，覆盖语言核心高频考点。本周目标是每天吃透一个主题，配可编译代码与面试问答，最终能应对大厂 C++ 一二面。
> **前置要求**：有 C/C++ 基础语法知识，能独立编写简单 C++ 程序
> **今日目标**：理解 C++ 内存区域划分（栈/堆/全局/常量/代码段）、对象生命周期与存储期、指针 vs 引用的本质区别、`const`/`constexpr` 语义、值类别（lvalue/rvalue/xvalue/prvalue），能回答"栈和堆的区别""指针和引用的区别"等高频题
> **时间投入**：2.5h（早间 1.5h 精读内存模型 + 晚间 1h 跑代码与值类别实验）
> **考察度**：⭐⭐⭐⭐ 高频考点，几乎每场 C++ 面试都会涉及

---

## 本日在本周知识图谱中的位置

| 本日产出 | 对应本周验收标准 |
|----------|-----------------|
| C++ 五大内存区域划分表 | ① 能画出 C++ 对象内存布局（基础） |
| 指针 vs 引用对比表 | ① 同上 |
| 值类别（lvalue/rvalue/xvalue）判断练习 | ③ 为 Day 3 移动语义打基础 |
| `const`/`constexpr` 语义对比 | ④ 为 Day 4 模板非类型参数打基础 |

---

### 学习任务 1：C++ 内存区域划分（45 分钟）

#### 五大内存区域

C++ 程序运行时的内存分为五个区域，每个区域的生命周期和管理方式不同：

| 内存区域 | 存储内容 | 分配方式 | 生命周期 | 访问速度 |
|----------|----------|----------|----------|----------|
| **栈（Stack）** | 局部变量、函数参数、返回地址 | 编译器自动分配/释放 | 函数返回即销毁 | 最快（移动栈指针） |
| **堆（Heap）** | `new`/`malloc` 分配的对象 | 手动分配/释放（或智能指针） | 手动释放或 RAII | 较慢（需要搜索空闲块） |
| **全局/静态区** | 全局变量、静态变量 | 程序启动分配 | 程序结束销毁 | 中等 |
| **常量区** | 字符串字面量、`const` 全局变量 | 程序启动分配 | 程序结束销毁 | 中等 |
| **代码区** | 编译后的机器指令 | 程序加载时 | 程序结束 | 只读 |

> 💡 **一句话总结**：栈是编译器管理的"自动挡"，堆是程序员管理的"手动挡"——智能指针（Day 2）就是给堆装上"自动挡"。

#### 栈 vs 堆的深度对比

| 维度 | 栈 | 堆 |
|------|------|------|
| 分配/释放 | 编译器自动，函数返回即释放 | 手动 `new`/`delete`，或智能指针 |
| 空间大小 | 有限（Linux 默认 8MB，`ulimit -s`） | 大（受物理内存限制） |
| 碎片 | 无（连续分配/释放） | 有（外部碎片） |
| 速度 | O(1)，只需移动栈指针 | 较慢，需搜索空闲块 + 可能触发系统调用 |
| 线程安全 | 是（每线程独立栈） | 否（需同步，或用线程局部存储） |
| 生长方向 | 向下（高地址 → 低地址） | 向上（低地址 → 高地址） |

#### 代码验证（`kernels/memory_model_basics.cpp`）

```cpp
// memory_model_basics.cpp —— C++ 内存区域与生命周期演示
// 编译: g++ -std=c++20 -o memory_model_basics memory_model_basics.cpp && ./memory_model_basics

#include <iostream>
#include <string>

int g_global = 42;              // 全局/静态区
static int s_static = 100;      // 全局/静态区
const char* g_str = "hello";    // "hello" 在常量区，g_str 指针在全局区

void demo_memory_regions() {
    int stack_var = 1;          // 栈
    static int func_static = 2; // 全局/静态区（只初始化一次）
    int* heap_ptr = new int(3); // 堆

    std::cout << "=== 内存区域地址 ===" << std::endl;
    std::cout << "栈变量 stack_var:       " << &stack_var << std::endl;
    std::cout << "堆指针 heap_ptr 指向:   " << heap_ptr << std::endl;
    std::cout << "堆指针 heap_ptr 本身:   " << &heap_ptr << " (在栈上)" << std::endl;
    std::cout << "全局变量 g_global:      " << &g_global << std::endl;
    std::cout << "静态变量 s_static:      " << &s_static << std::endl;
    std::cout << "函数静态 func_static:   " << &func_static << std::endl;
    std::cout << "字符串字面量 g_str 指向:" << (const void*)g_str << std::endl;

    // 栈地址 vs 堆地址 vs 全局地址：观察地址范围差异
    // 栈地址通常最大（高地址），全局区居中，堆在中间

    delete heap_ptr;  // 手动释放堆内存
}

int main() {
    demo_memory_regions();
    return 0;
}
```

```bash
g++ -std=c++20 -o memory_model_basics memory_model_basics.cpp && ./memory_model_basics
```

```text
=== 内存区域地址 ===
栈变量 stack_var:       0x7ffd3a2b1c3c
堆指针 heap_ptr 指向:   0x55a1e8c2a2e0
堆指针 heap_ptr 本身:   0x7ffd3a2b1c30 (在栈上)
全局变量 g_global:      0x55a1e8b9d010
静态变量 s_static:      0x55a1e8b9d014
函数静态 func_static:   0x55a1e8b9d018
字符串字面量 g_str 指向:0x55a1e8b98214
```

> ⚠️ **注意**：`heap_ptr` 本身是一个指针变量，它在**栈**上（8 字节），它指向的 `new int(3)` 才在**堆**上。面试中常被问"指针本身存在哪里"——答案是指针变量本身在栈上（如果它是局部变量），它指向的对象在堆上。

#### 存储期（Storage Duration）

C++ 定义了四种存储期，对应对象的生存时间：

| 存储期 | 关键字/特征 | 生命周期 |
|--------|------------|----------|
| **自动存储期** | 局部变量（无 `static`） | 所在代码块结束 |
| **静态存储期** | 全局变量、`static` 变量 | 程序结束 |
| **动态存储期** | `new` 分配的对象 | `delete` 时 |
| **线程存储期** | `thread_local` 变量 | 线程结束 |

```cpp
void demo_storage_duration() {
    int auto_var = 1;               // 自动存储期：函数返回销毁
    static int static_var = 0;      // 静态存储期：程序结束销毁，只初始化一次
    thread_local int tl_var = 0;    // 线程存储期：线程结束销毁
    int* dyn_var = new int(1);      // 动态存储期：delete 时销毁
    // ...
    delete dyn_var;
}
```


### 编译速查（短条目应被过滤）

g++ 一把梭。

### 代码块内标题干扰测试

 fenced code 中的标题行不应被当作条目切分点：

```bash
## 这是代码注释不是标题
### 这也不是
echo hello
```

以上代码块内的 `##` 行只是注释，本条目的正文应当完整包含它们，而不是被切开。这个测试条目特意写长一点以超过一百字的下限，确保它会被收录为知识点条目。
