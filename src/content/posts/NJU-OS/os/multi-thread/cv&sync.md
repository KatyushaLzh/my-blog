---
title: "10.并发控制：条件变量和万能同步方法"
published: 2026-06-22
updated: 2026-06-19
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / multi-thread"
description: "10.并发控制：条件变量和万能同步方法"
draft: false
sourceLink: ""
---
# 条件变量与同步

## 同步问题的基本语义

互斥解决的是“同一时刻谁能访问共享状态”，同步解决的是“某个事件必须发生在另一个事件之前”。在多线程程序中，很多问题并不是单纯的数据竞争，而是某个线程必须等待共享状态满足某个条件后才能继续。

同步问题可以统一写成：

```c
while (!sync_condition()) {
    wait();
}
proceed();
```

`sync_condition()` 是共享状态上的谓词，例如“所有子线程已经结束”“缓冲区非空”“前驱节点全部完成”。条件变量的作用就是把这种等待从忙等变成阻塞等待，并在状态可能改变时唤醒等待者。

## 条件变量的状态条件模型

条件变量本身不保存业务状态，也不表示条件已经成立。真正的条件必须由共享变量记录，并由互斥锁保护。

典型组成是：

- 共享状态：标志位、计数器、队列长度、剩余依赖数等。
- 互斥锁：保护共享状态的检查与修改。
- 条件变量：让等待条件的线程睡眠，并在条件可能成立时被唤醒。

因此条件变量不是“消息队列”，也不是“带记忆的 signal”。如果没有线程正在等待，一次 `cond_signal` 或 `cond_broadcast` 通常不会被保存。正确性来自“共享状态 + mutex + while 检查”的组合，而不是来自通知本身。

## `cond_wait` 的原子释放与等待

`cond_wait(&cv, &lk)` 的核心语义是：调用时线程必须已经持有 `lk`；进入等待时，库会原子地释放 `lk` 并把当前线程加入 `cv` 的等待队列；被唤醒后，线程会先重新获得 `lk`，再从 `cond_wait` 返回。

这个原子性用于避免漏唤醒：

```text
错误模型：
线程 A 检查 condition == false
线程 A 手动 unlock，准备 sleep
线程 B 修改 condition == true，并 signal
线程 A 还没有进入等待队列，通知丢失
线程 A 随后 sleep，可能永久阻塞
```

如果 `cond_wait` 不释放锁，修改条件的线程又无法拿到锁推进状态，等待者会拿着锁睡眠，系统直接失去进展。因此 `cond_wait` 必须同时满足两点：等待者睡眠时不持有锁；释放锁和进入等待队列之间没有可见空窗。

## 条件变量的标准使用模板

等待者模板：

```c
mutex_lock(&lk);
while (!cond) {
    cond_wait(&cv, &lk);
}
// 此时 cond 成立，并且当前线程持有 lk
do_work_under_condition();
mutex_unlock(&lk);
cond_broadcast(&cv);
```

修改者模板：

```c
mutex_lock(&lk);
update_shared_state();
mutex_unlock(&lk);
cond_broadcast(&cv);
```

必须使用 `while` 而不是 `if`。在 Mesa 语义下，唤醒只表示“条件可能已经改变”，不保证条件在当前线程重新获得锁时仍然成立。可能出现假唤醒、多个线程争抢同一份资源、或者条件被其他线程再次改回去。

## 唤醒与重新竞争互斥锁

`cond_broadcast(&cv)` 唤醒一组等待线程时，这些线程不会同时从 `cond_wait` 返回。它们只是从条件变量等待队列进入可运行状态，并开始竞争同一把互斥锁。

过程可以理解为：

```text
T0 持有 lk
T0 修改共享状态
T0 cond_broadcast(cv)
等待在 cv 上的线程被唤醒，但仍不能从 cond_wait 返回
T0 mutex_unlock(lk)
被唤醒的线程竞争 lk
只有一个线程获得 lk，并重新检查 while 条件
条件不成立的线程再次 cond_wait
```

因此 `broadcast + while` 是鲁棒组合：`broadcast` 负责通知所有可能受影响的线程，`while` 负责筛掉当前条件并不满足的线程。

## `broadcast` 与解锁顺序

常见模板选择先 `cond_broadcast` 再 `mutex_unlock`：

```c
update_shared_state();
cond_broadcast(&cv);
mutex_unlock(&lk);
```

这样可以把“共享状态已经修改”和“等待者可以重新检查”绑定在同一个临界区中。被唤醒的线程即使已经可运行，也必须等当前线程释放锁后才能从 `cond_wait` 返回，因此不会在状态更新尚未完成时抢跑。

严格说，部分实现和部分场景允许在解锁后通知，但这种写法更难证明。课程中的稳妥规则是：修改了可能影响同步条件的共享状态，就在持锁状态下广播，然后释放锁。

## 左右括号模型的不变量

第 15 讲把生产者-消费者问题简化成左右括号打印：

```c
void T_producer() { printf("("); }
void T_consumer() { printf(")"); }
```

令 `depth` 表示当前未被右括号匹配的左括号数量，令 `n` 表示最大允许嵌套深度。系统需要维护的不变量是：

```text
0 <= depth <= n
```

对应的同步条件是：

```text
打印 "(" 的条件：depth < n
打印 ")" 的条件：depth > 0
```

左括号线程生产一份未匹配的左括号，使 `depth++`；右括号线程消费一份未匹配的左括号，使 `depth--`。因此任何前缀中右括号数量都不能超过左括号数量，并且嵌套深度不能超过缓冲区容量 `n`。

## 左括号生产者的条件变量实现

左括号线程的代码是生产者逻辑：

```c
void T_producer() {
    mutex_lock(&lk);
    while (!(depth < n)) {
        cond_wait(&cv, &lk);
    }

    assert(depth < n);
    depth++;
    printf("(");

    cond_broadcast(&cv);
    mutex_unlock(&lk);
}
```

`depth++` 和 `printf("(")` 放在同一个临界区内，是因为输出序列本身也是共享结果。若先修改 `depth` 再让其他线程插入打印，输出字符与深度状态就可能不一致。

右括号线程是对称的消费者逻辑：

```c
void T_consumer() {
    mutex_lock(&lk);
    while (!(depth > 0)) {
        cond_wait(&cv, &lk);
    }

    assert(depth > 0);
    depth--;
    printf(")");

    cond_broadcast(&cv);
    mutex_unlock(&lk);
}
```

当一个左括号线程把 `depth` 从 0 改为 1 并广播后，多个右括号线程可能同时被唤醒，但只有一个线程能先获得锁。第一个右括号线程可能把 `depth` 重新减为 0，其余右括号线程随后重新检查 `depth > 0`，发现条件不成立后继续睡眠。

## `signal` 与 `broadcast` 的选择边界

`cond_signal` 只唤醒一个等待者，开销较小，但要求程序员能够证明被唤醒的线程一定有机会继续执行。在左右括号例子中，同一个条件变量上可能同时等待 producer 和 consumer。若 producer 释放出机会后唤醒了另一个 producer，而该 producer 的条件并不成立，就可能造成无效唤醒甚至活性问题。

`cond_broadcast` 会唤醒所有等待者，让每个线程重新检查自己的条件。它可能带来额外上下文切换和抢锁开销，但配合 `while` 更容易保证正确性。课程中的默认策略是：只要某次共享状态修改可能使其他线程的同步条件成立，就使用 `broadcast`。

## 生产者-消费者模型的同步结构

经典生产者-消费者模型维护一个容量为 `N` 的有界缓冲区。共享状态可以抽象为当前元素个数 `cnt`，不变量是：

```text
0 <= cnt <= N
```

对应的两个等待条件是：

```text
producer 可继续：cnt < N
consumer 可继续：cnt > 0
```

实际代码中通常拆成两个条件变量：

```c
void produce(Object x) {
    mutex_lock(&m);
    while (cnt == N) {
        cond_wait(&not_full, &m);
    }
    put(x);
    cnt++;
    cond_broadcast(&not_empty);
    mutex_unlock(&m);
}

Object consume() {
    mutex_lock(&m);
    while (cnt == 0) {
        cond_wait(&not_empty, &m);
    }
    Object x = take();
    cnt--;
    cond_broadcast(&not_full);
    mutex_unlock(&m);
    return x;
}
```

两个不同等待条件对应两个条件变量，是为了减少误唤醒：等待“非满”的 producer 和等待“非空”的 consumer 不应混在同一个等待集合中。

## 同步正确性与并行性能边界

条件变量保证的是同步正确性，不自动带来并行加速。是否退化成串行，取决于临界区占总工作量的比例。

左右括号例子几乎会退化成串行，因为主要工作就是更新 `depth` 并打印一个字符，而这两件事都必须在锁内完成。它是同步语义教学例子，不是高吞吐并行程序。

真正适合生产者-消费者优化的场景通常具有“短交接、长计算”的结构：

```c
producer:
    x = make_object();      // 锁外并行
    lock();
    enqueue(x);             // 锁内短临界区
    broadcast();
    unlock();

consumer:
    lock();
    x = dequeue();          // 锁内短临界区
    broadcast();
    unlock();
    process(x);             // 锁外并行
```

此时锁只串行化共享队列的 push/pop，真正耗时的生产、处理、I/O 或计算在锁外执行。并行度来自锁外工作与流水线重叠，而不是来自条件变量本身。

## 任务流水线的生产者-消费者化

一个模型服务流水线可以被拆成多个生产者-消费者阶段：

```text
请求线程 -> request_queue -> tokenizer workers
tokenizer workers -> token_queue -> batcher
batcher -> batch_queue -> GPU worker
GPU worker -> result_queue -> response workers
```

每个队列的 push/pop 由短临界区保护，每个阶段的主体工作在锁外完成。这样 GPU 推理、CPU 分词、响应发送可以重叠运行。队列和条件变量只负责阶段之间的资源交接与等待唤醒。

## 万能同步方法的计算图解释

生产者-消费者模型可以推广到任意同步条件。关键步骤是：

```text
识别必须等待的 sync condition
用共享状态记录事件或资源是否可用
后执行者在 while (!condition) 中等待
先执行者修改共享状态并 broadcast
```

在 DAG 计算图中，边 `u -> v` 表示 `v` 必须等待 `u` 完成。每个节点 `v` 可以维护 `n_pending_deps`：

```c
mutex_lock(&v->m);
while (v->n_pending_deps > 0) {
    cond_wait(&v->ready_cv, &v->m);
}
mutex_unlock(&v->m);
run(v);
```

当某个前驱完成后，减少后继节点的剩余依赖数：

```c
mutex_lock(&succ->m);
succ->n_pending_deps--;
if (succ->n_pending_deps == 0) {
    cond_broadcast(&succ->ready_cv);
}
mutex_unlock(&succ->m);
```

Makefile 的 `make -j`、动态规划依赖图、神经网络计算图和工作流调度都可以用这个视角理解：每个节点等待前驱生产完成事件，前驱完成后唤醒后继重新检查可执行条件。

## 条件变量使用原则

- 条件变量表达“何时可以继续”，互斥锁保护“谁能访问共享状态”。
- 条件变量不保存业务状态，条件必须由共享变量表示。
- `cond_wait` 必须在持锁时调用，并原子释放锁与进入等待。
- 被唤醒后必须重新获得互斥锁，才能从 `cond_wait` 返回。
- 等待条件必须写成 `while (!cond)`，不能写成 `if`。
- 修改可能影响同步条件的共享状态后，默认使用 `cond_broadcast`。
- 临界区只应覆盖共享状态交接；主要计算应尽量放在锁外。

