---
title: "13.并行算法和数据结构"
published: 2026-06-22
updated: 2026-06-21
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / multi-thread"
description: "13.并行算法和数据结构"
draft: false
sourceLink: ""
---
# 并行算法与数据结构

第 18 讲的核心问题不是“并发程序如何写对”，而是“已经写对以后，如何让它随 CPU、线程数甚至机器数增长而加速”。互斥锁、条件变量、信号量能把共享状态的不变量保护起来，但如果所有操作都被压成一个全序，程序就获得了正确性，却失去了 scalability。

本讲可以压缩成一个统一模型：

```text
把共享热点移出高频路径，把同步边压到计算图边界。
```

并行算法关注如何把计算拆成大块本地任务；并行数据结构关注如何把全局共享状态拆成局部状态、分片状态或近似状态。二者本质相同：减少必须被 release-acquire 串行化的事件。

## 从互斥正确性到可扩展性瓶颈

并发编程中最常见的操作仍然是 `sum++` 这一类极短临界区：

```c
void T_sum() {
    mutex_lock(&lk);
    sum++;
    mutex_unlock(&lk);
}
```

现实系统中的很多操作都具有同样形态：

```c
buf[len++] = elem;
mapping[key] = value;
counter++;
queue.push(task);
```

互斥锁给出的保证很强：

```text
unlock(lk) release
lock(lk)   acquire
```

只要所有线程都用同一把锁保护同一组共享状态，每次临界区就可以被理解为某个全局顺序中的一个原子步骤。这解决了 data race、lost update 和不变量破坏问题。

但它也带来硬瓶颈：如果每次 `sum++` 都必须进入同一把锁，那么无论有 1 个核还是 128 个核，同时能推进这个操作的线程仍然只有一个。临界区越短，锁本身的同步、缓存一致性和调度成本占比越高；线程越多，竞争越重，扩展性越差。

因此，本讲讨论的不是“是否需要同步”，而是：

```text
哪些同步是语义上必要的？
哪些同步只是实现方式造成的热点？
```

## Scale Up 与 Scale Out

Scale up 是单机内增加 CPU、核心、硬件线程，让同一个程序获得更高吞吐。Scale out 是增加机器，让集群整体吞吐增长。

二者的共同条件是：问题必须能分解为大量主要本地执行、少量边界通信的任务。典型结构是：

```c
mutex_lock(&lk);
job = get();
mutex_unlock(&lk);

job->run();   // 主要是线程本地计算
job->done();  // 释放后继任务
```

只要 `job->run()` 的时间远大于获取任务、提交结果、唤醒后继任务的同步时间，系统就有机会 scale。如果任务本身只有几条指令，同步就会吞掉所有并行收益。

这个模型和第 15/16 讲的同步原语直接相连：

- 条件变量适合表达“所有 predecessor 完成后才能继续”。
- 信号量可以把 predecessor 的完成事件抽象成若干把 key。
- 互斥锁保护 ready queue、引用计数、完成状态等共享元数据。
- 真正的并行工作应该尽量位于锁外。

## 计算图模型

并行算法的基本抽象是计算图：

```text
节点 = 一段本地计算
边   = 数据依赖 / 同步约束
```

如果两个节点之间没有路径依赖，它们就可以并行执行。算法设计的关键不是机械地“开很多线程”，而是设计一张具有足够宽度、足够粗粒度、关键路径足够短的计算图。

评价一张并行计算图时，至少要看三个量：

```text
work  = 总计算量
span  = 关键路径长度
grain = 单个任务的计算粒度
```

理论并行度近似受 `work / span` 限制；实际并行度还受同步、调度、缓存和通信开销限制。一个看似有很多节点的图，如果每个节点都很小，调度和同步会成为主要开销。

## 粒度选择与动态规划反例

以 LCS、编辑距离、矩阵 DP 为例，单个格子的转移通常依赖左、上、左上：

```c
DP[i][j] = f(DP[i - 1][j], DP[i][j - 1], DP[i - 1][j - 1]);
```

最天真的并行化是把每个格子当成一个任务。这样会得到大量节点，但每个节点只做极少数加法、比较或赋值，却需要等待多个 predecessor、通知多个 successor。同步成本会远大于计算成本。

更合理的做法是按对角线或按块划分：

```text
1. 同一条反对角线上的格子互不依赖，可以并行。
2. 块内顺序计算，块间按依赖同步。
3. 块越大，同步越少，但可并行宽度下降。
4. 块越小，可并行宽度上升，但同步和调度成本增加。
```

这就是 granularity tuning：把任务切到“本地计算显著大于同步开销”的尺度。真正的并行算法优化，经常不是换一个神奇 API，而是重新选择计算图节点的粒度。

## 高性能计算的局部性结构

HPC 的典型任务来自数值密集型科学计算，例如物理模拟、天气预报、有限元、量子化学、线性代数求解和 AI 推理。它们能大规模并行，根源通常是物理世界或数学结构提供了局部性。

例如网格模拟：

```text
每个网格点主要依赖邻近网格点
网格内部可以本地计算
边界处需要交换数据
每一轮 delta t 之后做同步
```

这和生产者-消费者或 DAG 执行模型并不冲突，只是规模更大：

```text
单机线程: shared memory + lock/cv/barrier
多机集群: message passing + barrier/reduction
```

MPI 和 OpenMP 分别代表两类常见抽象：

```c
#pragma omp parallel for
for (int i = 0; i < n; i++) {
    work(i);
}
```

OpenMP 让共享内存机器上的循环并行化非常直接；MPI 则显式表达多进程/多机器之间的消息传递。它们服务的是同一件事：把大规模计算拆成本地执行和边界通信。

## Embarrassingly Parallel

有些问题几乎不需要同步，被称为 embarrassingly parallel。典型例子包括：

- Mandelbrot set 中每个像素的迭代计算。
- Monte Carlo 模拟中的独立采样。
- 视频逐帧处理。
- fork-based DFS / tree search 的部分场景。

这类问题的计算图几乎没有边：

```text
input[i] -> output[i]
```

并行化主要问题不是同步正确性，而是任务分配、负载均衡、缓存局部性、I/O 吞吐和结果汇总。Mandelbrot 的每个像素独立，但不同像素迭代次数可能不同，因此静态均分也可能出现负载不均。

## Linpack 与分块线性代数

HPC-China 100 / Top500 常用 Linpack 作为性能基准，它衡量的是大型稠密线性方程组 `Ax = b` 的求解能力。

这个基准重要，是因为大量科学计算最终会落到线性代数：

```text
非线性物理系统
-> Newton method
-> 稀疏/稠密线性系统
-> 矩阵分解、矩阵乘、向量运算
```

线性代数适合优化的根源是可分块：

```text
矩阵块 = 本地计算单元
块边界 = 数据依赖和通信
```

分块同时服务两个目标：

- 并行性：不同块可以分给不同核心、GPU 或机器。
- 局部性：块能更好地复用 cache、shared memory 或 HBM。

这也是后续 SIMD/GPU、AI 推理和 kernel fusion 的基础：不是“并行”这个词本身带来性能，而是把计算组织成硬件喜欢的局部访问模式。

## 并行算法的性能判断

一个并行化方案是否有意义，不能只看线程数，而要看瓶颈在哪里。粗略判断可以用：

```text
T_total = T_local_compute + T_sync + T_comm + T_sched + T_imbalance
```

如果优化只增加线程数，却让 `T_sync`、`T_comm` 或 `T_imbalance` 急剧上升，总时间可能反而变差。

常见失败模式：

- 任务太细：调度成本大于计算。
- 共享热点：所有线程竞争同一个 counter、queue 或 lock。
- 负载不均：某些线程早早结束，等待慢线程。
- 通信过密：每一小步都跨线程/跨机器交换数据。
- 缓存抖动：false sharing 或频繁迁移同一 cache line。

并行算法的正确打开方式是先画计算图，再决定任务粒度、调度策略和同步边界。

## 并行数据结构的核心矛盾

并行算法可以把大部分计算变成本地任务，但系统里仍然存在大量数据结构操作密集的场景：

- 操作系统内核对象。
- 数据库索引和锁表。
- 网络服务器连接表。
- 游戏服务器状态表。
- 高频交易订单簿。
- 分配器中的 free list。

这些场景里，`sum++` 不是可以忽略的小元数据，而是吞吐瓶颈本身。此时必须重新审视数据结构的语义保证。

强一致版本的 counter 语义是：

```text
每次读都看到一个完全线性化的最新值。
```

但很多系统其实只需要弱一点的保证：

```text
读到的值可以略旧，但不能离谱，最终必须收敛。
```

这个放松就是性能空间的来源。

## Sloppy Counter

Sloppy counter 的思想是：每个线程先更新自己的局部计数，累计到阈值后再批量提交到全局计数。

```c
#define BATCH 100

int sum;
int sum_local[MAX_TID];
mutex_t lk;

void T_sum(int tid) {
    if (++sum_local[tid] == BATCH) {
        mutex_lock(&lk);
        sum += sum_local[tid];
        mutex_unlock(&lk);
        sum_local[tid] = 0;
    }
}
```

这里放松的是实时可见性，不是最终正确性：

```text
高频路径: local increment，无锁
低频路径: batch flush，上锁
```

如果 `BATCH = 100`，理想情况下只有约 1% 的更新会进入全局锁。吞吐提升来自两个方面：

- 大多数写入落在线程本地 cache line。
- 全局锁竞争频率下降两个数量级。

代价是读者看到的 `sum` 可能落后于真实总数，最大误差大致受 `BATCH * 线程数` 控制。工程里可以用时间阈值、主动 flush 或自适应 batch 在准确性和吞吐之间折中。

## 一致性放松的语义边界

Sloppy counter 不是“随便错一点”。它必须先定义清楚允许放松什么：

```text
允许: 短时间读到旧值
禁止: 丢失已经提交的全局更新
禁止: 局部计数永远不合并
禁止: 退出线程时泄漏本地计数
```

适合 sloppy 的场景：

- 统计量、监控指标、近似 QPS。
- 点赞数、连接数、内存使用量的近似读。
- 内核 per-cpu counter。

不适合 sloppy 的场景：

- 银行账户余额。
- 引用计数的最后一次释放判断。
- 安全权限状态。
- 需要严格线性化的队列长度。

优化前必须先回答：这个数据结构的 correctness condition 是什么？如果应用真的需要严格 linearizability，就不能靠近似计数逃课。

## Thread-Local Storage

手写 `sum_local[MAX_TID]` 有几个问题：

- 需要自己分配和管理线程编号。
- 容易出现越界、复用 tid、线程退出清理问题。
- 多个线程的局部计数可能落在同一 cache line，造成 false sharing。

语言和运行时提供了 TLS。下面写法表达的是“每个线程一份全局/静态状态”，具体关键字在 C/C++ 标准中略有差异：

```c
thread_local int sum_local;

void T_sum() {
    if (++sum_local == BATCH) {
        mutex_lock(&lk);
        sum += sum_local;
        mutex_unlock(&lk);
        sum_local = 0;
    }
}
```

`thread_local` 的语义是：每个线程自动拥有该变量的一份独立实例。它不是普通栈变量；它更像“按线程复制的全局变量”。

这里要区分语言规则：C11 使用 `_Thread_local`，C23 才把 `thread_local` 作为标准拼写；C 的块作用域 TLS 声明通常还需要配合 `static` 或 `extern`。C++11 的 `thread_local` 规则更宽，可以出现在块作用域，但它仍然是线程存储期对象，不是每次函数调用重新创建的自动变量。课堂代码强调的重点是：TLS 不能按普通局部变量理解。

## TLS 的实现机制

普通全局变量、栈变量和 TLS 变量的寻址模型不同：

```text
int x;              -> x(%rip)       // 全局静态存储
void foo(){ int y;} -> y(%rsp)       // 当前线程栈
thread_local int z -> z(%fs)        // 当前线程 TLS 区
```

在 x86-64 Linux 上，线程控制块和 TLS 区通常通过 `%fs` 段寄存器定位。编译器把 `thread_local` 访问编译成“TLS base + 固定偏移”的访问。不同线程的 TLS base 不同，因此同一个变量名在不同线程中对应不同地址。

实现上还涉及：

- `.tdata`：带初始值的 TLS 数据。
- `.tbss`：零初始化的 TLS 数据。
- 线程创建时为新线程分配并初始化 TLS 区。
- 动态库中的 TLS 需要动态链接器协作。

所以 TLS 不是语法魔法，而是 ABI、编译器、链接器、线程库共同提供的一块 per-thread 存储机制。

## TLS 的使用边界

TLS 适合保存“线程本地、可延迟合并”的状态：

- 局部计数器。
- allocator thread cache。
- per-thread buffer。
- 日志缓冲区。
- 随机数生成器状态。

但 TLS 也有边界：

- 线程退出时需要 flush 或析构，否则局部状态可能丢失。
- 大对象 TLS 会增加每个线程的内存占用。
- 在线程池中，TLS 生命周期绑定 worker，而不是逻辑请求。
- 跨线程迁移任务时，TLS 可能让状态跟着线程而不是任务走。

对 allocator、runtime、serving system 来说，最后一点尤其重要：如果逻辑请求在不同 worker 间迁移，线程本地缓存能提升局部吞吐，但也可能带来内存膨胀和负载不均。

## 锁拆分与数据结构局部性

并行数据结构的基本思路是避免“一把锁保护整个世界”。如果数据结构天然由多个独立部分组成，就可以把锁拆到更小粒度：

```text
global lock          -> per-structure lock
per-structure lock   -> per-bucket lock
per-bucket lock      -> per-element lock / atomic
```

哈希表是最典型例子。`hash(key)` 把 key 映射到 bucket 后，不同 bucket 的操作通常可以并行：

```c
bucket = hash(key) % N;
mutex_lock(&bucket_locks[bucket]);
operate(table[bucket], key);
mutex_unlock(&bucket_locks[bucket]);
```

这比全局锁更可扩展，因为互不相关的 key 不再竞争同一把锁。读多写少时，还可以用 reader-writer lock 允许多个 reader 并发。

但细粒度锁会把正确性问题重新带回来：

- 一个操作需要多个 bucket 时，必须规定锁顺序，否则会 ABBA。
- resize 会重建整个数组，和所有 bucket 操作冲突。
- open addressing 的 tombstone、删除、遍历和并发 resize 很难组合。
- 锁粒度越细，越需要明确每个不变量由谁保护。

所以并行数据结构不是“把锁拆小”这么简单，而是重新定义不变量的所有权。

## 原子指令与 Lock-Free 思路

如果一个操作能用单条或少量原子指令完成，就可以避免进入 mutex：

```c
atomic_fetch_add(&cnt, 1);
```

原子操作减少了内核阻塞和调度开销，但并不自动带来无限扩展。多个核心反复修改同一个 atomic counter，仍然会竞争同一条 cache line；硬件必须在核心之间转移该 cache line 的独占权限。

因此：

```text
atomic 解决的是阻塞和临界区管理问题；
local/sharding 解决的是共享 cache line 热点问题。
```

Lock-free list、queue、stack 常用 CAS 维护指针结构，但会引入 ABA、内存回收、hazard pointer、epoch reclamation 等生命周期问题。第 17 讲的 ABA/UAF 在这里会重新出现，而且更难调试。

## Hash Table 的并发难点

哈希表看似天然适合 per-bucket lock，但真实实现有几个麻烦点。

第一，链式哈希和开放寻址的并发语义不同：

```text
separate chaining: bucket 内链表/树可单独保护
open addressing: 查找路径可能跨多个槽位
```

开放寻址依赖探测序列，删除还需要 tombstone。并发删除、查找、插入会改变探测路径的语义；遍历时还可能看到中间状态。

第二，resize 是全局结构变化：

```text
old array -> new larger array
rehash all keys
publish new table
retire old table
```

简单做法是 resize 时持有全局 write lock，阻止所有并发访问。这样正确但会产生长暂停。复杂做法是渐进式 rehash、双表查询、RCU 发布和延迟回收，但设计空间会迅速变复杂。

第三，多个锁之间需要固定顺序：

```text
resize_lock -> bucket_lock
```

如果某条路径先拿 bucket lock 再等 resize lock，另一条路径先拿 resize lock 再等 bucket lock，就会回到第 17 讲的 ABBA 死锁。

这也是讲义提醒“对库函数保持敬畏”的原因：高性能并发容器背后通常有大量不变量和内存回收细节。

## Malloc/Free 的并行化启示

第 18 讲把并行数据结构自然连到 malloc/free。分配器本质上维护“空闲内存块集合”这个数据结构。简单设计可能会想到 balanced tree：

```text
find-first(size)
delete(block)
insert(freed_block)
coalesce(neighbor)
```

但真实 workload 下，小对象分配/释放远比大对象频繁。脱离 workload 做“最优数据结构”往往是错误方向。

更常见的高性能思路是 segregated free lists / slab：

```text
1. 按对象大小分 size class。
2. 每个 slab 只存同一大小的对象。
3. 线程本地维护小对象 freelist。
4. fast path 在本地 freelist O(1) 分配/释放。
5. slow path 才向中心池申请新 slab 或归还空闲 slab。
```

这和 sloppy counter 完全同构：

```text
counter local batch      -> allocator thread cache
global counter flush     -> central heap refill/return
近似实时统计             -> 内存占用和碎片折中
```

Fast path 覆盖绝大部分请求，必须极短、少同步、cache 友好；slow path 处理 refill、mmap、跨线程释放、归还大块内存等复杂情况，可以慢一些但必须正确。

## Workload 优先原则

讲义中特别强调：脱离 workload 做优化就是耍流氓。

优化前至少要知道：

```text
请求大小分布
对象生命周期分布
线程间释放比例
分配/释放频率
峰值内存占用
cache miss / lock contention / syscall 占比
```

例如 allocator 中通常可以观察到：

- 小对象创建和销毁最频繁。
- 中对象数量较少但生命周期更长。
- 大对象通常应由 `mmap` 等慢路径直接处理。
- 如果大对象只扫描一遍就释放，很可能是 workload 或程序本身的性能问题。

这类观察决定了设计空间：与其为所有大小做一个理论优雅的数据结构，不如让小对象 fast path 极快，让大对象走清晰可靠的 slow path。

## Fast Path 与 Slow Path

系统优化中常见两层结构：

```text
Fast path:
  覆盖绝大多数情况
  少分支、少同步、局部性好
  失败后转入 slow path

Slow path:
  处理复杂边界情况
  可以加锁、调用系统调用、整理元数据
  维护全局不变量
```

CPU cache、TLB、slab allocator、JIT inline cache、网络协议栈、模型 serving batching 都有类似结构。

关键是 fast path 不能破坏 slow path 依赖的不变量。否则快路径越快，错误扩散越快。并行系统里的 fast path 设计尤其需要写清楚：

```text
本地状态什么时候有效？
什么时候必须同步？
退出线程/释放资源时如何归还？
全局状态如何看到本地状态？
```

## 与 AI Infra 的连接

第 18 讲的思想可以直接迁移到 AI infrastructure。

GPU kernel 优化：

```text
global memory 访问 -> shared memory / register tiling
全局同步           -> block 内同步或 kernel 边界同步
小任务             -> 合并成更大 tile 提高算术强度
```

模型 serving：

```text
单请求立即执行     -> batching
全局队列大锁       -> sharded queues / per-worker queues
频繁 malloc/free   -> arena / cache / pool
严格实时统计       -> approximate counters / periodic aggregation
```

分布式训练：

```text
每步全量同步       -> gradient accumulation / overlap communication
中心参数服务器     -> sharding / all-reduce / pipeline parallelism
跨机通信热点       -> topology-aware placement
```

这些系统的核心问题仍然是第 18 讲那句话：把本地计算做大，把同步和通信压到边界。

## 设计检查清单

写并行算法或并行数据结构时，可以按下面顺序检查：

```text
1. correctness condition 是什么？
2. 哪些状态必须严格线性化？
3. 哪些状态可以延迟、近似或批量合并？
4. 计算图的节点和边是什么？
5. 任务粒度是否足够大？
6. 是否存在单个锁、单个 atomic、单条 cache line 的热点？
7. resize、退出、失败、取消、跨线程释放等 slow path 是否维护不变量？
8. workload 是否真的匹配这个优化方向？
9. 如何用 benchmark 证明瓶颈被移动或消除？
```

最危险的优化是只看到平均路径，不写边界路径。并行数据结构的 bug 往往不在“普通插入一次”，而在 resize、销毁、异常返回、线程退出、内存回收和锁顺序交叉处。

## 本节小结

```text
1. Mutex 解决正确性，但完全 serializability 会限制 scalability。
2. 并行算法的核心是计算图：节点本地计算，边表示同步依赖。
3. 任务粒度太细会让同步、调度和通信成本吞掉并行收益。
4. HPC 能扩展，根源是空间局部性、分块计算和少量边界同步。
5. Embarrassingly parallel 问题几乎没有同步边，主要挑战转为负载均衡和 I/O。
6. 并行数据结构需要先定义一致性语义，再决定能否放松实时可见性。
7. Sloppy counter 用 per-thread local + batch flush 换取吞吐，代价是短期读旧值。
8. thread_local 是 ABI/编译器/线程库支持的每线程静态存储，不是普通局部变量。
9. 细粒度锁、原子操作和 lock-free 结构都可能重新引入死锁、ABA、UAF 和内存序问题。
10. 高性能 malloc/free 的关键是 workload：小对象 fast path，本地缓存，slow path 维护全局不变量。
11. Fast path/slow path 是系统优化的普遍结构，但 fast path 必须服从全局 correctness condition。
12. 本讲到 AI infra 的桥梁是局部性、批量化、分片、缓存、减少同步和压缩通信边界。
```

