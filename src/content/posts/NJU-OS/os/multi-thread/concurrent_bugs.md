---
title: "12.并发 Bugs 和应对"
published: 2026-06-22
updated: 2026-06-21
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / multi-thread"
description: "12.并发 Bugs 和应对"
draft: false
sourceLink: ""
---
# 并发 Bugs 与应对

并发 bug 的统一模型是：程序员在脑中假设了一种执行顺序，但真实机器允许更多 interleaving、重排和可见性延迟。  
所以修 bug 的核心不是“多加几把锁”，而是把隐含顺序显式写成同步约束：

```text
共享状态 + 不变量 + happens-before
```

只要一个并发程序不能说清楚“哪些状态由谁保护、哪些事件必须先发生”，它就只能靠调度运气运行。

## 并发错误的根源

顺序程序可以近似看成：

```text
state_{i+1} = f(state_i)
```

多线程程序则多了一层调度选择：

```text
1. 每个线程内部仍保持局部顺序
2. 全局执行由多个线程的局部步骤交错而成
3. 编译器和处理器还可能在内存模型允许范围内重排
```

因此，课堂里把并发 bug 叫做 Learning from Mistakes：不是因为 API 难，而是因为人的顺序直觉会自动补全一些机器没有承诺的东西。

典型错误都可以归结为某种错误假设：

- 死锁：以为“我最终能拿到所有资源”。
- 数据竞争：以为“别人不会同时访问这个内存位置”。
- 原子性违反：以为“check 和 act 之间不会插入别的线程”。
- ABA：以为“值还是 A 就说明状态没变过”。
- TOCTOU：以为“检查完之后对象不会被替换”。
- 顺序违反：以为“代码顺序就是其他线程观察到的顺序”。

## 死锁的基本模型

Deadlock 是一种系统状态：一组线程里的每个成员都在等待组内另一个成员采取行动，甚至可能是等待自己。

最小例子是 AA 型死锁：

```c
mutex_lock(&A);
mutex_lock(&A); // 非递归 mutex: 自己等自己
```

这看起来像是显然不会写出的错误，但真实代码里第二次加锁可能藏在 callback、递归、错误处理路径或多层封装里。只要 `pthread_mutex_t` 是普通非递归锁，同一线程第二次 `lock` 就会阻塞在自己持有的锁上。

另一个经典形态是 ABBA 型死锁：

```c
// Thread 1
mutex_lock(&A);
mutex_lock(&B);

// Thread 2
mutex_lock(&B);
mutex_lock(&A);
```

如果 T1 持有 A 等 B，T2 持有 B 等 A，等待图中出现环，两个线程都无法推进。哲学家吃饭问题就是 ABBA 的环形推广：每个人都拿了左手叉子，然后等待右手叉子。

## 死锁的四个必要条件

Coffman 等人在 1971 年总结了死锁的四个必要条件。关键是“必要条件”的含义：四条必须同时成立，死锁才可能发生；打破任意一条，死锁就不会发生。

```text
1. Mutual Exclusion: 资源互斥占用
2. Wait-For: 持有已有资源，同时等待更多资源
3. No Preemption: 资源不能被外部强制抢走
4. Circular Wait: 等待关系形成环
```

这四条不是“满足就一定死锁”的充分条件，而是“死锁发生时一定满足”的必要条件。很多网上速记会把这个逻辑讲反。

对应到代码：

- AA 死锁主要暴露的是 wait-for：线程已经持有 A，却又等待 A。
- ABBA 死锁主要暴露的是 circular wait：`A -> B` 与 `B -> A` 构成环。
- 哲学家吃饭问题暴露的是多节点 circular wait。

## 破坏死锁条件的方法

所有死锁治理都可以映射回“打破四条件”。

### 破坏互斥占用

有些资源天生互斥，例如锁保护的共享数据结构、独占设备、文件写入位置。  
这条通常最难破坏，因为它本来就是资源正确性的来源。能做的优化往往是减少共享状态，或者把共享资源改成可复制、可合并的结构。

例如并行 reduce 中，每个线程使用私有局部累加器，最后再合并，就相当于减少了对同一个共享计数器的互斥需求。

### 破坏持有并等待

最直接的方法是一把大锁：

```c
mutex_lock(&global);
// 一次性访问所有共享状态
mutex_unlock(&global);
```

这样线程不再“持有 A 等 B”，因为它只需要获取一个全局资源。  
缺点也明显：并行度会被大锁压扁，临界区占比变大后，Amdahl 瓶颈会非常硬。

另一种思想是 transactional memory：把一段共享内存操作当成事务执行，语义上要求 all or nothing。

```c
atomic {
    A -= 100;
    B += 100;
}
```

事务内存的模型是：先乐观执行，记录 read set / write set，提交时检查冲突；无冲突则一次性提交，有冲突则 abort 并回滚重试。  
它试图避免程序员手动管理多把锁的顺序，从而降低 wait-for 和 lock ordering 的复杂度。

但它难实现，也不能覆盖所有副作用：

- I/O、系统调用、打印、网络发送通常无法自然回滚。
- HTM 受 cache 容量、中断、调度、系统调用限制，可能无冲突也 abort。
- STM 需要软件维护日志、版本号和回滚，开销较大。
- 事务反复 abort 可能导致活锁或饥饿。

所以它是理解“all or nothing 临界区”的好模型，但不是工程里的万能替代品。

### 破坏不可抢占

如果系统能在发现危险时撤销某个线程的资源持有，就可以破坏 no-preemption。数据库事务常用这种方式：检测到死锁后选择一个事务 abort，释放它持有的锁，让其他事务继续。

在普通 C/Pthreads 程序里，这很难，因为线程持有锁时可能已经修改了复杂共享状态、执行了不可回滚的 I/O，外部很难安全地“抢锁”。  
因此普通 mutex 世界里更常见的是预防锁顺序问题，而不是运行时强行回滚线程。

### 破坏循环等待

工程上最常用的方法是 lock order：给所有锁规定一个全局顺序，所有线程必须按同一顺序加锁。

```text
A < B < C

允许: lock(A); lock(B); lock(C);
禁止: lock(C); lock(A);
```

如果所有边都从低编号锁指向高编号锁，等待图就不可能形成环。这条规则非常朴素，但能处理大量 ABBA 问题。

## 动态死锁检测

死锁的症状通常比数据竞争明显：程序本该继续输出，突然完全静默；用 GDB attach 进去，经常能看到所有线程阻塞在 `futex_wait` 或 mutex lock 路径上。

但更好的目标不是等它真的卡死，而是在测试时发现潜在环。

lockdep 的核心思路是把上锁顺序转化成图：

```text
线程当前持有 A，再请求 B => 加边 A -> B
线程当前持有 B，再请求 A => 加边 B -> A
图里出现环 => 存在潜在 ABBA 死锁
```

伪代码模型：

```c
thread_local vector<mutex_t *> held;
Graph order;

void on_lock(mutex_t *m) {
    for (mutex_t *h : held) {
        order.add_edge(h, m);
    }
    if (order.has_cycle()) {
        warn("potential deadlock");
    }
    held.push_back(m);
}
```

讲义中还强调了 `LD_PRELOAD` 的做法：写一个共享库定义同名 `pthread_mutex_lock/unlock`，通过动态链接器优先加载我们的版本，就能在不重新编译目标程序的情况下插桩记录锁顺序。Linux 内核的 lockdep 也是同类思想的工程化版本，只是要额外处理 spinlock、rwlock、RCU、中断上下文等复杂情况。

## 数据竞争

数据竞争的判定条件是：

```text
1. 至少两个线程访问同一内存位置
2. 至少一个访问是写
3. 这些访问之间没有 happens-before 关系
```

例如：

```c
int x = 0;

void T1() { x++; }
void T2() { x++; }
```

`x++` 会被拆成 load / add / store。两个线程可能都读到旧值，再分别写回，导致 lost update。  
更重要的是，在 C/C++ 内存模型里，普通变量上的 data race 是 undefined behavior。编译器可以基于“无数据竞争程序”的假设优化代码，因此不能把它只理解为“结果随机一点”。

正确修复有两条主路：

- 用同一把 mutex 保护同一组共享不变量。
- 如果只是单变量原子读改写，用 atomic 并明确内存序。

锁的含义不仅是互斥，还建立 release-acquire happens-before：

```text
T1: 写共享状态; unlock(m)
T2: lock(m); 读共享状态

unlock(m) happens-before lock(m)
```

所以“加锁”不是形式动作，必须保护同一个状态条件和同一组不变量。

## ThreadSanitizer 的检测模型

ThreadSanitizer 通过编译期插桩和运行期记录访问历史来检测 happens-before race：

```bash
gcc -fsanitize=thread -g main.c -o main
./main
```

它大致维护：

- 每个线程的逻辑时间；
- 每个同步操作建立的 happens-before；
- 每个内存位置最近读写历史。

当两个访问没有 happens-before，且至少一个是写，就报告 race。  
TSan 的限制也要记住：动态工具只能检查这次运行覆盖到的路径；如果错误 interleaving 没被触发，它未必能报告。

相关工具的定位：

- Eraser：早期 dynamic race detector，核心是 lockset 思想。
- Helgrind：Valgrind 套件里的线程错误检测工具，不需要重编译但慢。
- ThreadSanitizer：编译插桩，工业里更常用。
- KCSAN：Linux 内核中的并发访问检测工具。

## Therac-25 的事故教训

讲义用 Therac-25 强调了一点：并发 bug 不只是输出错几个数字，它可能直接伤害现实世界中的人。

Therac-25 是一台放射治疗设备，软件需要协调操作员输入、治疗模式、靶板位置和射线剂量。事故中的关键问题可以抽象成：

```text
UI 线程快速修改治疗模式
硬件控制线程尚未把保护装置移动到正确位置
软件却继续按“状态已经一致”的假设发射高剂量射线
```

这类 bug 的本质是 race condition / order violation：程序以为模式切换、硬件状态更新、剂量控制之间有可靠顺序，但代码没有用同步机制把这个顺序固定下来。  
它的工程教训是：涉及设备、权限、安全边界的并发程序，不能只依赖“正常操作路径”测试；必须把异常速度、重复输入、中断、取消、回滚路径都纳入状态机验证。

## 原子性违反

Atomicity violation 是“程序员以为一段代码不可打断，但实际上它可以被插入别的线程”。

典型 check-then-act：

```c
if (ptr != NULL) {
    *ptr = 42;
}
```

错误窗口在检查和使用之间：

```text
T1: 读到 ptr != NULL
T2: free(ptr); ptr = NULL
T1: *ptr = 42
```

修复不是“多检查一次”，而是让检查和使用属于同一个临界区：

```c
mutex_lock(&m);
while (ptr == NULL) {
    cond_wait(&cv, &m);
}
*ptr = 42;
mutex_unlock(&m);
```

条件变量模板之所以要求 `while + cond_wait`，就是为了在“条件成立且锁在手”的状态下继续执行。  
这里的关键不变量是：只要线程从 `while` 之后继续运行，它仍持有保护 `ptr` 的锁，因此别的线程不能在 act 前破坏条件。

## ABA 与 Use-After-Free

ABA 问题是：一个值从 A 变成 B，又变回 A；观察者只看到“还是 A”，于是误以为状态没变过。

在 CAS 和 lock-free 数据结构里很常见：

```text
T1: 读取 top = A
T2: pop A; pop B; push A
T1: CAS(top, A, next_of_A) 成功
```

T1 的 CAS 只验证了“top 现在等于 A”，没验证中间有没有发生过结构变化。  
Use-After-Free 也可以看成指针层面的 ABA：

```text
T1: 保存指针 p -> 对象 X
T2: free(X)
T2: malloc 得到同一地址，构造对象 Y
T1: 继续通过 p 访问，以为是 X，实际写到 Y
```

防御方法通常不是简单加 atomic，而是管理对象生命周期：

- 引用计数；
- hazard pointer；
- epoch-based reclamation；
- 给指针附加版本号，CAS 比较 `(ptr, version)`。

也就是说，ABA 的核心是“值相等不代表语义状态相同”。

## TOCTOU

TOCTOU 是 Time of Check to Time of Use：检查和使用之间存在时间窗口，对象可能被别人替换。

经典模式：

```c
if (is_safe(path)) {
    open(path);
}
```

检查的是路径当时指向的对象；使用时路径可能已经被攻击者换成符号链接。讲义里提到的 sendmail 类漏洞就是：setuid root 程序先检查 mailbox 不是 symlink，随后攻击者在 check/use 窗口把它替换成指向 `/etc/passwd` 的 symlink，最终高权限程序写错目标。

修复原则是：不要检查一个可变名字后再用它；要拿到稳定对象句柄后检查。

例如：

```c
int fd = open(path, O_NOFOLLOW | O_APPEND);
fstat(fd, &st);
// 后续使用 fd，而不是重新解析 path
```

文件描述符绑定的是内核 open file object / inode 引用；只要拿到了 fd，后续路径名怎么变，都不会把这个 fd 变成另一个文件。

## 顺序违反

Order violation 是：程序员假设 A 一定先于 B，但没有同步原语保证。

常见初始化发布错误：

```c
// Thread 1
config = load_config();
ready = true;

// Thread 2
while (!ready) {}
use(config);
```

这里有两层问题：

- 编译器可能重排或缓存普通变量访问；
- CPU 可能让 `ready` 的写先于 `config` 对另一个核心可见。

如果 `ready` 和 `config` 都是普通共享变量，这本身还会形成 data race。正确发布需要 release-acquire：

```c
// Thread 1
config = load_config();
atomic_store_explicit(&ready, true, memory_order_release);

// Thread 2
while (!atomic_load_explicit(&ready, memory_order_acquire)) {}
use(config);
```

release 的含义是：发布 `ready=true` 前的写入不能跑到发布之后。  
acquire 的含义是：观察到 `ready=true` 后，后续读能看到发布者 release 前写入的状态。

如果同步条件更复杂，直接用 mutex + condition variable 往往更清晰。

## 防御性编程原则

并发程序的防御性编程，不是把每个地方都包一把锁，而是让状态关系可检查、可插桩、可复现。

### 写出共享状态的不变量

例如生产者消费者：

```text
0 <= count <= N
```

例如转账：

```text
A + B 总额不变
```

例如锁顺序：

```text
所有线程只能按 A < B < C 获取锁
```

不变量写不出来，后面的锁、条件变量、信号量都只能靠局部直觉拼凑。

### 让同步边界尽量小而完整

临界区应该覆盖共享状态的检查和修改，不能只锁一半：

```c
mutex_lock(&m);
if (balance >= x) {
    balance -= x;
}
mutex_unlock(&m);
```

但临界区也不应无限扩大。耗时计算、I/O、RPC、sleep 尽量放到锁外，否则会制造性能瓶颈和新的死锁机会。

### 默认使用工具

并发 bug 不能只靠“我想清楚了”。

- 死锁：GDB attach、线程栈、lockdep、锁顺序图。
- 数据竞争：ThreadSanitizer、Helgrind、KCSAN。
- UAF / ABA：ASan、KASAN、引用计数检查、生命周期审计。
- TOCTOU：安全审计、fd-based API、`O_NOFOLLOW`、权限边界检查。

动态工具不能证明无 bug，但能快速打掉大量错误假设。

### 不要相信测试次数

并发 bug 的触发依赖调度。一次、十次、一万次没触发，只能说明测试覆盖的 interleaving 里没出事。

更有效的测试方式是：

- 增加线程数和循环次数；
- 在关键路径插入随机 yield / sleep；
- 固定随机种子复现；
- 用 sanitizer 和断言检查不变量；
- 把“偶现错误”当作确定存在的逻辑漏洞，而不是环境噪声。

## 本节小结

```text
1. 并发 bug 来自“假设的顺序”与“真实允许的执行”不一致。
2. 死锁四条件是必要条件；打破任意一个条件即可排除死锁。
3. AA 是自己等自己，ABBA 是等待图成环；lock order 是最常用防御。
4. Transactional memory 用 all-or-nothing 尝试替代手写锁顺序，但回滚和副作用很难。
5. Data race = 同一内存位置 + 并发访问 + 至少一写 + 无 happens-before。
6. TSan 用运行期 happens-before 推理检测 race，但只能覆盖实际执行路径。
7. Therac-25 说明 race / order violation 在安全关键系统里可能造成真实伤害。
8. Atomicity violation 的核心窗口在 check 和 act 之间。
9. ABA / UAF 说明“值相同”不等于“对象状态相同”。
10. TOCTOU 的修复方向是先获得稳定句柄，再检查和使用。
11. Order violation 需要 release-acquire、mutex/cv 或其他同步原语建立顺序。
12. 并发正确性最终要落回共享状态、不变量、同步边和工具验证。
```

