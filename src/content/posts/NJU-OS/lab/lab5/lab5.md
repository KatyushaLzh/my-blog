---
title: "Lab 5: mymalloc"
published: 2026-06-22
updated: 2026-06-19
category: "NJU OS"
tags: ["NJU OS","Lab"]
series: "NJU OS / lab / lab5"
description: "Lab 5: mymalloc"
draft: false
sourceLink: ""
---
# Lab 5: 并发内存分配器的设计、落盘与优化复盘

## 1. 实验目标

本实验要实现 `mymalloc(size_t size)` 和 `myfree(void *ptr)`，用自己的 allocator 替代 glibc `malloc/free`，并在多线程测试中保证正确性和尽量好的性能。

allocator 的核心任务不是“调用一次系统接口返回一块内存”，而是：

1. 从 `vmalloc` 得到页级别的大块内存。
2. 在 allocator 内部切分成用户需要的小块。
3. 维护元数据，使 `free(ptr)` 能找回这块内存的来源、大小和复用方式。
4. 在多线程下保护内部状态，避免链表破坏、重复分配、数据竞争和死锁。
5. 通过拆锁、分类、缓存等方式降低同步开销。

几个最基础的接口结论：

- `mymalloc(s)` 只需要返回至少能容纳 `s` 字节的 payload，不需要刚好 `s` 字节。
- 内部大小可以按 8 字节、size class 或 page size 向上取整。
- `vmalloc(NULL, length)` 返回页级别内存，`length` 应该按 4096 对齐。
- `vmfree(addr, length)` 也应该按页级别归还，不能把 allocator 内部切出来的小块直接 `vmfree`。

因此，本实验的正确性不变量可以概括为：

```text
任意时刻：
  一个字节要么属于某个已分配 payload，
  要么属于 allocator 管理的 free block / free slot，
  不能同时属于两个用户分配，
  也不能丢失到 allocator 无法再次管理的状态。
```

## 2. 最关键的工程动作：中间结果落盘

这次实验真正有效的做法不是“一口气写最终 allocator”，而是把每个阶段的中间结果落盘。

原因是 allocator 的错误经常不是普通 WA，而是：

- 随机段错误。
- 链表被破坏后过很久才爆炸。
- 多线程下偶发死锁。
- free 后复用错误。
- benchmark 卡死。
- 正确性测试通过但性能差几个数量级。

如果只保留最终代码，很多关键经验都会丢失：为什么大锁版本是必要的、为什么 per-node lock 不适合、为什么 slot 初始化会炸、为什么 thread-local cache 提升明显。

因此整个过程应该保留这些阶段产物：

| 阶段 | 落盘内容 | 价值 |
| --- | --- | --- |
| 大锁 baseline | 一个正确但慢的 allocator | 建立 split/coalesce 和 header 布局不变量 |
| 独立正确版 | 在当前框架外另存一份参考实现 | 后续优化出错时有可回退版本 |
| 本地测试系统 | `/home/katyusha/vibe` 下的 tester | 弥补课程自带测试偏弱的问题 |
| 性能输出 | glibc baseline 与 mymalloc 对比结果 | 判断优化是改善吞吐还是只修正确性 |
| 当前最终版 | `mymalloc/mymalloc.c` | 保留最新结构：large free-list + small slot/span + thread cache |
| 实验笔记 | 本文件 | 记录设计决策、坑点和下一步优化方向 |

这个“中间结果落盘”是 allocator 实验里的关键一刀。它把调试过程从“凭记忆试错”变成了“有阶段检查点的系统演进”。

## 3. 阶段一：一把全局大锁的正确性版本

最初的实现目标不是性能，而是保证最小 allocator 语义成立。

大锁版本的模型：

```text
mymalloc:
  lock(global)
    在 free list 找可用块
    找不到则 vmalloc 新页
    必要时 split
  unlock(global)

myfree:
  lock(global)
    通过 ptr 回退到 block header
    插回 free list
    尝试 coalesce
  unlock(global)
```

此时数据结构可以只有一个全局 free list：

```c
struct Node {
    struct Node *pre, *nxt;
    size_t size;
};
```

每个大块的内存布局：

```text
+----------------+----------------------+
| Node metadata  | user payload         |
+----------------+----------------------+
^                ^
block start      returned pointer
```

用户拿到的是 `Node` 之后的地址；释放时用：

```c
Node *node = (Node *)((char *)ptr - sizeof(Node));
```

找回块头。

这一版要先确认以下不变量：

- free list 中只保存空闲块。
- 已分配块不在 free list 中。
- split 后剩余部分仍然是合法 `Node`。
- coalesce 只合并物理地址相邻的空闲块。
- 所有链表修改都在同一把锁下完成。

这一阶段落盘的意义：即使后续所有性能优化都失败，也仍然有一个语义正确的版本可以回退。

## 4. 阶段二：地址有序 free list 与 split/coalesce

free-list allocator 的关键不是“有一个链表”，而是链表顺序要服务于 coalesce。

如果链表按地址递增维护：

```text
free block A -> free block B -> free block C
地址也满足 A < B < C
```

插入一个释放块时，只要检查它的前驱和后继就能判断能否合并：

```c
is_adj(prev, p)
is_adj(p, next)
```

物理相邻的判断应该是字节地址判断：

```c
(char *)a + a->size == (char *)b
```

这一点非常重要。早期如果维护的是逻辑区间 `[l, r)`，但它不对应真实地址，就无法可靠判断两个块是否真的相邻。allocator 管的是虚拟地址空间中的真实区间，不是抽象编号。

分配时的 split 逻辑：

```text
原空闲块:
+-------------------------------+
| size                           |
+-------------------------------+

切出 len:
+---------------+---------------+
| allocated len | remainder      |
+---------------+---------------+
```

只有当 remainder 足够容纳 `Node` 和最小 payload 时才 split。否则整块给用户，避免产生无法管理的碎片。

这一阶段主要解决：

- `free` 后内存能复用。
- 相邻 free block 能合并。
- 大块分配不会无限向系统申请新页。

## 5. 阶段三：从全局锁拆到 size-class 锁

全局锁的瓶颈非常直接：

```text
所有线程、所有大小的 malloc/free 都抢同一把锁。
```

即使线程 A 申请 32B，线程 B 申请 4096B，它们也完全串行。

第一步拆锁不是给每个节点一把锁，而是按大小分类：

```c
static Node head[20], tail[20];
static int if_init[20];
static spinlock_t list_lock[20];
```

每个 size class 有自己的 free list 和锁。

这样做的正确性边界比较清晰：

- 某个 class 的链表只能在持有 `list_lock[class]` 时修改。
- 一个 free block 在任意时刻只能属于一个 class。
- split、remove、insert、coalesce 必须在同一把 class 锁内完成。
- 尽量避免一次操作持有多把 class 锁。

这里踩过的坑是：如果当前 class 找不到块，就向更大的 class 借块，可能带来跨 class 锁顺序问题。

例如：

```text
线程 A: 持有 class 1，等待 class 2
线程 B: 持有 class 2，等待 class 1
```

这就是死锁。

因此当前实现选择了更稳的路线：大块按 `getid(size)` 进入一个 class，主要在本 class 内申请和回收。这样可能牺牲一点全局利用率，但锁协议简单很多。

## 6. 为什么小对象要换成 slot/span

free list 对大块合适，但对小对象不合适。

如果 24B 对象也走 `Node + payload`：

```text
+----------------+----------+
| Node metadata  | 24B user |
+----------------+----------+
```

问题有三个：

1. 元数据占比太高。
2. 小对象分配频率极高，链表操作太频繁。
3. 多线程同 class 小对象会高频抢锁。

所以小对象更适合固定大小 slot：

```text
32B class:
  24B 请求 -> 32B slot
  slot 内没有完整 Node header
```

大对象仍适合 free list，因为大对象大小差异大，保留 split/coalesce 能减少外部碎片。

因此当前最终结构是混合 allocator：

```text
size <= 2048:
  slot/span allocator

size > 2048:
  size-class free-list allocator
```

## 7. 阶段四：span 管理

当前小对象路径使用 span。

一个 span 是一页 4096B：

```c
#define SPAN_SIZE 4096
```

span 结构：

```c
struct span {
    size_t class_id;
    size_t cap;
    size_t size;
    int magic;
    void *free_list;
    struct span *nxt;
};
```

含义：

- `class_id`：这个 span 属于哪个 size class。
- `cap`：这个 span 中最多有多少 slot。
- `size`：当前已经分配出去的 slot 数量。
- `magic`：用于在 `free(ptr)` 时判断它是不是 slot 分配。
- `free_list`：span 内部空闲 slot 链表。
- `nxt`：挂到 class 的 span 链表中。

span 内存布局：

```text
4096B span

+----------------------+---------+---------+---------+-----+
| span metadata         | slot 0  | slot 1  | slot 2  | ... |
+----------------------+---------+---------+---------+-----+
^                      ^
span base              first aligned slot
```

空闲 slot 自己的开头存 next 指针：

```text
free slot:
+----------------+
| next pointer   |
+----------------+

allocated slot:
+----------------+
| user data      |
+----------------+
```

所以“一个 slot 是否被占用”的判断不是靠单独 bitmap，而是：

```text
如果它在 span->free_list 链上，就是空闲；
如果它不在 free_list 链上，就视为已分配。
```

当前 size class：

```c
const size_t SIZE[] = {32, 64, 128, 256, 512, 1024, 2048};
```

这对应一个简化版 slab/slot allocator。

## 8. 阶段五：thread-local cache

slot/span 解决了小对象元数据问题，但如果每次 `malloc/free` 仍然拿全局 class 锁，多线程性能还是上不去。

因此加入每线程缓存：

```c
struct threadcache {
    void *list[CLASS_NUM];
    size_t count[CLASS_NUM];
};

static thread_local threadcache tcache;
```

分配路径：

```text
slot_malloc(size):
  class = getclass(size)

  if 本线程 tcache[class] 非空:
    直接 pop 一个 slot
  else:
    lock(global class)
      批量取 CACHE_BATCH 个 slot
      放入 tcache[class]
    unlock(global class)
    pop 一个 slot 返回
```

释放路径：

```text
slot_free(ptr):
  找到 ptr 所在 span
  得到 class_id
  push 到本线程 tcache[class]

  if tcache[class] 太满:
    lock(global class)
      批量 flush 一部分 slot 回 span
    unlock(global class)
```

这个优化的本质：

```text
无 thread cache:
  每次小对象 malloc/free 都抢全局锁

有 thread cache:
  大多数 malloc/free 只操作本线程链表
  偶尔 refill/flush 才抢全局锁
```

这是当前性能提升最明显的一步。

代价也很明确：

- 每个线程会暂存一些空闲 slot，增加内存滞留。
- 线程退出时如果不 drain，本地 cache 中的 slot 不会及时回到全局结构。
- batch 太小锁竞争多，batch 太大内存滞留多。

当前实现使用：

```c
#define CACHE_BATCH 32
#define CACHE_VOLUM 64
```

这是一个经验参数，不是理论最优。

## 9. 当前最终 allocator 结构

当前代码可以概括为：

```text
mymalloc(size)
|
+-- align8(size)
|
+-- size <= 2048
|   |
|   +-- slot_malloc
|       |
|       +-- thread-local cache
|       +-- global class lock
|       +-- span available/full list
|       +-- vmalloc new span if needed
|
+-- size > 2048
    |
    +-- list_malloc
        |
        +-- size-class lock
        +-- address ordered free list
        +-- find first enough block
        +-- split
        +-- vmalloc new page block if needed
```

`myfree(ptr)` 的分类逻辑：

```text
page-align ptr -> possible span base

if span->magic == SPAN_MAGIC:
  slot_free(ptr)
else:
  list_free(ptr)
```

这是一种实用但不完美的分类方式。

优点：

- slot 没有 per-object header，节省小对象元数据。
- 通过页对齐可以快速找到 span metadata。

限制：

- 依赖 span 由 4096 对齐页构成。
- 依赖大块路径不会在对应位置偶然出现相同 magic。
- 更工程化的实现通常会使用 page map、arena map 或统一 header 来区分来源。

## 10. 本地测试系统

课程自带测试对并发 allocator 来说偏弱，尤其是之前看到的 concurrent test 主要检查 `malloc_count`，不等价于真正验证内存不重叠、free 后复用、多线程随机行为都正确。

因此额外写了本地测试系统，落盘在：

```text
/home/katyusha/vibe
```

测试系统包括：

- 基本边界测试：0、1、小对象、跨 class、大对象。
- 重复分配释放测试：检查复用。
- coalesce 测试：检查释放相邻块后能否合并。
- single-thread random：随机大小、随机释放顺序。
- multi-thread random：多线程随机 malloc/free。
- perf-only：吞吐量 benchmark。
- glibc baseline：同一套 workload 下对比 glibc malloc。

这个测试系统的意义是把“我感觉可以”变成“有本地证据”。

尤其是性能优化时，不能只说“拆锁会更快”，而要看：

```text
single small
single medium
page-ish
threads same class
threads spread classes
```

分别有什么变化。

## 11. 性能结果与解释

一次较新的 benchmark 结果大致为：

```text
glibc malloc:
  single small 24B              约 166 Mops/s, 约 6 ns/op
  single medium 512B            约 112 Mops/s, 约 9 ns/op
  single page-ish 4096B         约 0.58 Mops/s, 约 1724 ns/op
  threads same class 32B        约 206 Mops/s, 约 4.9 ns/op
  threads spread classes        约 100 Mops/s, 约 10 ns/op

current mymalloc:
  single small 24B              约 90 Mops/s, 约 11 ns/op
  single medium 512B            约 52 Mops/s, 约 19 ns/op
  single page-ish 4096B         约 2.7 Mops/s, 约 369 ns/op
  threads same class 32B        约 68 Mops/s, 约 15 ns/op
  threads spread classes        约 29 Mops/s, 约 35 ns/op
```

这个结果说明：

- 小对象已经不再是灾难级性能，slot + thread cache 有效。
- 中等对象仍弱于 glibc，主要差在 class 管理、cache 策略和元数据路径。
- 4096B 附近反而比 glibc 快，可能是测试 workload 下当前路径更直接。
- 多线程 spread classes 仍明显弱于 glibc，说明全局 class 锁、span 链表和 refill/flush 策略还有优化空间。

更重要的是，性能结果证明了中间版本落盘的价值：如果没有大锁 baseline、free-list 版本、slot 版本、thread-cache 版本，就无法判断性能提升来自哪一步。

## 12. 主要踩坑

### 12.1 `vmalloc` 不是输出参数

错误理解：

```text
vmalloc 把结果写进传入指针
```

正确理解：

```c
void *p = vmalloc(NULL, length);
```

它直接返回地址。

并且 `length` 应该是 4096 的倍数。不能对 split 出来的小块调用 `vmfree`。

### 12.2 `mymalloc(s)` 不要求精确返回 s 字节

真实 allocator 都会有对齐和 size class。

因此：

```text
mymalloc(24) 返回 32B slot 是合法的。
```

只要用户能安全访问前 24B 即可。

### 12.3 链表必须基于真实地址

coalesce 依赖物理相邻。

所以链表中块的范围必须对应真实地址，而不是抽象编号。

正确模型：

```text
block_start + block_size == next_block_start
```

### 12.4 指针运算容易产生 UB 或 GNU C 依赖

典型错误：

```c
Node *p;
p + sizeof(Node);   // 错：按 Node 为单位移动
```

应该写成：

```c
(char *)p + sizeof(Node)
```

当前代码中仍有一些 `void *` 指针算术和 `unsigned long long` 地址转换。它们在 GNU C 下通常可工作，但更严谨的写法应该使用：

```c
char *
uintptr_t
```

分别处理字节指针和整数地址。

### 12.5 per-node lock 不适合当前 allocator

曾考虑过每个链表节点一把锁：

```text
查找进入节点时加锁
离开时释放
插入/删除时同时锁前驱、当前、后继
```

问题是：

- 节点可能被 split 或 coalesce 后消失。
- 其他线程可能还想访问这个节点的锁，生命周期很难管理。
- 同时锁多个节点需要严格锁顺序，否则死锁。
- allocator 链表操作很短，per-node lock 的开销和复杂性不划算。

所以更稳定的拆锁方向是 size-class lock，而不是 node lock。

### 12.6 跨 class 借块会引入锁顺序问题

如果 class A 没有空间就去 class B 找，会出现多锁操作。

除非全局规定严格锁顺序，否则容易死锁。

当前实现避免跨 class 借块，是为了保持锁协议简单。

### 12.7 slot 初始化边界错误会导致随机段错误

span 切 slot 时必须保证：

```text
slot_start + slot_size <= span_start + SPAN_SIZE
```

常见错误：

- next 指针写到了页外。
- `s + slot_size` 把 `span *` 当字节指针。
- 最后一个 slot 的 next 没有置空。
- 用 `unsigned` 保存指针导致 64 位地址截断。
- 第一个 slot 没有按 8 字节对齐。

这类错误很隐蔽，因为第一次分配可能没问题，等 free-list pop 到坏指针时才段错误。

### 12.8 空 span 不能轻易立刻 `vmfree`

理论上 span 全空后可以还给系统。

但当前有 thread-local cache 后，某些 slot 可能还滞留在线程本地 cache 中。如果直接 `vmfree(span)`，cache 中的 slot 就变成悬垂指针。

因此当前版本注释掉了积极归还 empty span 的逻辑，选择先保留 span 复用。

这是一个合理的阶段性选择：先保证正确性和性能，再做更复杂的 span 生命周期管理。

## 13. 当前代码仍需注意的问题

当前版本已经通过本地正确性测试，并且性能相比早期版本有明显提升，但还有几个工程上不够干净的地方：

1. `void *` 指针算术依赖 GNU C 扩展，应改成 `char *`。
2. 地址整数转换应优先用 `uintptr_t`，而不是 `unsigned long long`。
3. `magic` 分类方式有小概率误判风险，最好用 page map 或统一 metadata。
4. `getclass` 对大于 2048 的路径没有显式返回，虽然调用方已经过滤，但函数本身不够完整。
5. thread-local cache 没有在线程退出时 drain。
6. span 的 `full/available` 链表移动仍然有线性查找。
7. 大块 free list 仍是 first-fit 线性扫描。
8. `malloc_count` 虽是 atomic，但它更像测试辅助变量，不应参与 allocator 核心设计。

这些不是当前实验一定要全部解决的问题，但应该在笔记里保留，防止以后把“能过测试”误认为“已经工程完备”。

## 14. 后续优化方向

后续如果继续优化，可以按风险从低到高推进：

1. 清理 UB：统一使用 `char *` 和 `uintptr_t` 做地址计算。
2. 调整 size class：根据 benchmark workload 优化 class 分布。
3. 调整 `CACHE_BATCH` 和 `CACHE_VOLUM`：平衡锁竞争和内存滞留。
4. 给 span 增加更清晰状态：empty、partial、full。
5. 建立 page map：通过页号直接找到 span 或大块 metadata。
6. 支持线程退出时 drain thread-local cache。
7. 大块路径使用更好的数据结构，例如 segregated list 更细分或 tree。
8. 增加更强 stress：跨线程 free、长时间随机 trace、ASan/UBSan、重复 benchmark。

## 15. 总结

这次 allocator 的完整路线是：

```text
全局大锁 baseline
  -> 地址有序 free list
  -> split/coalesce
  -> size-class lock
  -> 小对象 slot/span
  -> thread-local cache
  -> 本地 correctness + perf 测试系统
  -> 写入实验笔记复盘
```

其中最重要的不是某个具体技巧，而是阶段化方法：

```text
先做正确版本；
再拆锁；
再分类；
再缓存；
每一步都落盘；
每一步都用测试验证。
```

allocator 的难点在于它维护的是一套隐式状态机：每块内存不断在 “系统页”、“free block”、“allocated payload”、“free slot”、“thread cache slot” 等状态之间转换。只要某次状态转移没有被锁保护，或者元数据没有同步更新，错误就可能在很久之后才出现。

当前版本已经具备现代 allocator 的简化雏形：

- 大对象用 free list 管理，支持 split 和 coalesce。
- 小对象用 span/slot 管理，降低元数据开销。
- 多线程用 thread-local cache 减少锁竞争。
- 本地测试系统用于验证正确性和性能。

这比单纯完成 lab 更重要：它把 malloc 从一个 API 练习，推进到了 runtime memory manager 的设计问题。

