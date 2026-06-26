---
title: "(Aside)一个 Token 的旅程"
published: 2026-06-22
updated: 2026-06-22
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / aside"
description: "(Aside)一个 Token 的旅程"
draft: false
sourceLink: ""
---
# 一个 Token 的旅程

第 21 讲不是引入一个新 API，而是把前面所有操作系统概念串成一条端到端路径：

```text
用户发出请求
-> 网络与数据中心接住请求
-> 后端把请求排队、鉴权、计费、调度
-> GPU 集群执行 next-token prediction
-> 生成的 token 以 event-stream 形式流式返回
```

这条路径的核心不变量是：

```text
控制流上，大量并发请求不能被重线程和阻塞等待拖垮；
数据流上，必须把计算搬到数据/缓存/显存附近；
硬件上，必须把工作重排成规则、同构、局部的并行形式。
```

所以本讲其实是在回答一个大问题：你按下回车后，为什么一个看似普通的 HTTP 请求会穿过整个现代计算机系统栈。

---

## 1. 从用户视角看请求

用户看到的只是：

```bash
curl https://api.deepseek.com/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${DEEPSEEK_API_KEY}" \
  -d '{"model":"deepseek-v4-flash","messages":[...],"stream":true}'
```

但这一行命令已经触发了很多系统事件：

- shell 创建进程，设置 stdin/stdout/stderr。
- libc / runtime 发起 socket、connect、send、recv 等系统调用。
- DNS 把域名解析成 IP，DNS 本身也可能参与负载均衡。
- TCP/TLS 建立连接，HTTP 请求被发往远端。
- 服务端以 `text/event-stream` 返回一段段 token。

这一层的关键不是“会用 curl”，而是：

```text
API endpoint 不是一台机器；
它是 DNS、路由、负载均衡、API 网关、业务服务和推理集群共同暴露出来的入口。
```

域名解析、traceroute、HTTP header 只是我们能从用户侧观察这套系统的几个窗口。

---

## 2. 为什么数据中心是核心

数据中心可以粗略看成：

```text
计算资源 + 存储资源 + 网络资源 + 调度系统 + 运维系统
```

互联网时代，它主要支撑 Web、移动应用、搜索、支付、社交、内容分发；AI 时代，它又变成模型训练和推理的基础设施。

这也是课程里“操作系统不是孤立知识点”的具体体现：

- fd、socket、pipe、mmap 支撑服务间通信和数据搬运。
- 线程、锁、条件变量、信号量支撑后端队列和 worker pool。
- epoll、coroutine、async/await 支撑大量连接的等待型并发。
- 并行算法、分片、缓存和近似计数支撑规模化吞吐。
- SIMD/SIMT/GPU 支撑最终的密集矩阵计算。

一句话：

```text
数据中心是 OS 知识的工业级展开。
​```---
## 3. C10K 到 AI 推理瓶颈

C10K 问题问的是：一台服务器如何同时处理一万个连接。

朴素写法是：

​```c
while (true) {
    Request *rq = get_request();
    pthread_create(&tid, NULL, handle_request, rq);
}
```

这个模型的问题不在正确性，而在成本模型：

- 每个 OS 线程有栈、TCB、TLS、内核调度实体等资源。
- 阻塞 I/O 会让线程睡进内核。
- 大量线程会带来上下文切换、cache 扰动和调度开销。
- 连接数上来后，线程数不能线性跟着涨。

于是系统演化出：

```text
C10K: epoll / Nginx / event-driven server
C10M: 用户态网络栈 / 零拷贝 / DPDK / 更强的 runtime
C10B: CDN / 边缘计算 / service mesh / 分布式调度
```

但 AI 推理时代的瓶颈又变了。传统 Web 请求可能主要卡在网络、数据库、缓存和业务逻辑；LLM 请求背后还挂着一次昂贵的 GPU 推理。

所以新的瓶颈是：

```text
并发连接数不再是唯一问题；
每个请求消耗多少 GPU 算力、显存、KV cache 和调度资源，才是核心问题。
​```---
## 4. 一个请求穿过后端

一个 LLM API 请求进入数据中心后，大致会经历：

​```text
DNS / route
-> L4 load balancer
-> L7 reverse proxy
-> API gateway
-> auth / billing / audit / rate limit
-> application server
-> inference queue
-> GPU scheduler
-> CUDA kernels
-> SSE / WebSocket stream
```

每一层都有自己的 correctness condition。

鉴权要求：

```text
API key disabled 后不能继续无限使用。
```

计费要求：

```text
实际消耗的 token 必须最终进入账单和日志。
```

限流要求：

```text
不能因为多节点并发访问同一个 key 就绕过 quota。
```

推理队列要求：

```text
请求不能丢，取消和超时不能破坏队列不变量。
```

这些问题很快会撞上分布式系统的墙：延迟、故障、重试、乱序、部分失败、CAP 取舍。单机上一个 mutex 可以保护的东西，到了分布式环境里可能变成跨节点共识、幂等接口、日志重放和最终一致性。

---

## 5. UNIX 模型为什么不够

UNIX 很擅长：

```text
open / read / write / pipe
把数据带到本机进程里处理
```

这对单机系统非常优雅。但大规模分布式系统更常见的方向是：

```text
把计算带到数据附近。
```

原因很直接：数据太大、机器太多、网络太慢且不可靠。

于是系统接口从“字节流”扩展到更高层：

- GFS / HDFS：把大文件切块复制到多台机器。
- BigTable / DynamoDB：用 key-value / table 抽象支撑在线查询。
- MapReduce / Spark：限制计算形式，使其能被自动分发和容错。
- Serverless / FaaS：用函数描述计算图，让平台负责调度、重试和伸缩。

这里和第 19 讲的 Promise / async 模型有相似之处：

```text
程序员描述依赖关系；
运行时/平台负责在事件完成后推进后续计算。
​```---
## 6. 从 Token 到 Tensor

LLM 推理的核心可以压成：

​```text
p(token_{t+1} | token_1 ... token_t) = f_theta(token_1 ... token_t)
```

也就是从一个学到的巨大函数里采样下一个 token。

这里的 `theta` 是参数，`f_theta` 是 Transformer 计算图。所谓 tensor，本质上就是多维数组：

```text
scalar: []
vector: [C]
matrix: [M, N]
image batch: [B, H, W, C]
attention: [B, Head, T, T]
KV cache: [Layer, B, Head, T, Dim]
```

讲义强调 `llm.c` / `gpt.c` 的意义就在这里：大模型原理上并不神秘，很多核心路径就是数组、下标、循环、矩阵乘、softmax 和采样。

神秘感主要来自规模：

```text
参数量巨大；
张量巨大；
显存压力巨大；
带宽压力巨大；
调度系统巨大。
​```---
## 7. Attention 的系统视角

Attention 可以从 Q/K/V 理解：

​```text
Q: 当前查询，我要找什么
K: 历史内容的索引，它们能匹配什么
V: 历史内容的值，匹配后实际取回什么
```

推理时，每一层都在把当前 token 的表示和已有上下文交互，得到新的表示。实现上，它会落到一系列张量计算：

```text
linear projection
QK^T
softmax
attention weights * V
MLP
layernorm
sampling
```

从操作系统/体系结构视角看，关键不是公式本身，而是公式的执行形态：

```text
大量同构算子；
规则但巨大的张量访问；
高带宽需求；
高度依赖 batching、layout、tiling 和 cache。
```

这就是第 20 讲 SIMD/SIMT 的直接应用场景。

---

## 8. CUDA kernel 在做什么

CUDA 的 `<<<grid, block>>>` 可以理解为：

```text
CPU 把 kernel 参数和执行形状提交给 GPU；
GPU 创建大量逻辑线程；
线程按 block / warp 组织执行；
CPU 通常立即返回，GPU 异步推进计算。
```

例如矩阵乘里的每个线程或线程块负责输出矩阵的一小块。它和第 18 讲计算图的关系很直接：

```text
节点 = 一个 tile 的本地计算
边 = 全局内存读取、shared memory 同步、kernel 边界
```

GPU 适合 LLM，不是因为“GPU 比 CPU 神奇”，而是因为 workload 长这样：

- 同一操作重复在大量元素上。
- 分支相对少，控制流比较统一。
- 数据可以被整理成矩阵和张量。
- tile 复用可以提高算术强度。
- Tensor Core 可以高吞吐执行混合精度矩阵 FMA。

真正难点也在这里：

```text
不是写出一个能算的 kernel；
而是让访存、布局、同步、并行粒度和硬件执行单元匹配。
​```---
## 9. Prefill、Decode 与 KV Cache

生成一个回复不是一次性算完，而是反复生成 token。通常分成两个阶段：

​```text
Prefill:
  处理完整 prompt，算出每层的 K/V，写入 KV cache。

Decode:
  每次生成一个新 token；
  读取已有 KV cache；
  用当前 Q 和历史 K/V 做 attention；
  采样出 token；
  把新 token 的 K/V 追加进 cache。
```

如果没有 KV cache，每生成一个 token 都要重新计算所有历史 token 的 K/V，代价会非常夸张。KV cache 的作用是把历史上下文变成显存里的可复用状态。

但 KV cache 也带来新的系统问题：

- 它占用大量显存。
- 多用户共享时需要分配、回收、驱逐。
- 长上下文会让 cache 线性增长。
- batching 时不同请求长度不同，会造成碎片和调度难题。
- 请求取消、超时、完成时必须正确释放 cache。

这就是为什么现代推理引擎会做 PagedAttention、prefix cache、continuous batching、KV cache paging 等优化。它们本质上都在回答：

```text
怎样像管理虚拟内存和 slab allocator 一样管理显存里的上下文状态？
​```---
## 10. 最后返回的其实是一个整数

GPU 算完后，模型输出 logits：

​```text
logits: [vocab_size]
```

然后服务端做：

```text
softmax / sampling
-> token id
-> tokenizer decode
-> UTF-8 bytes
-> JSON chunk
-> SSE event-stream
-> reverse proxy / CDN
-> client display
```

所以“模型吐出一个字”在系统里其实是：

```text
一个整数经过 tokenizer 反查后，被包装成网络字节流返回。
```

流式输出的体验来自循环执行：

```text
decode one token
send one chunk
decode next token
send next chunk
...
```

这也解释了为什么首 token 延迟和后续 token 吞吐是两个不同指标：

- 首 token 延迟包含排队、调度、prefill、网络路径等成本。
- 后续 token 吞吐主要受 decode、KV cache 访问、batching 和 GPU 利用率影响。

---

## 11. 和前面课程的连接

这讲可以把前 20 讲压成一张系统图：

```text
进程 / syscall / fd:
  curl、socket、HTTP、日志、pipe、event-stream。

mmap / virtual memory:
  大文件、模型权重映射、显存管理、cache paging。

线程 / 锁 / 条件变量 / 信号量:
  请求队列、worker pool、GPU 调度器、限流器。

并发 bug:
  取消、超时、重复计费、UAF、ABA、死锁、日志丢失。

并行算法:
  batching、work stealing、分片队列、调度图。

协程 / async:
  大量连接、网络等待、流式返回、事件循环。

SIMD / SIMT:
  matmul、attention、tensor core、kernel launch。

分布式系统:
  鉴权、计费、审计、CAP、幂等、重试、容错。
```

这就是讲义的核心：操作系统课不是 API 清单，而是一套还原系统的能力。

---

## 12. 面向 AI Infra 的检查清单

分析一个 LLM serving 系统时，可以按这条链问：

```text
1. 请求在哪里等待？等待的是网络、队列、GPU，还是外部服务？
2. 哪些路径是一请求一线程，哪些路径是 event loop / coroutine？
3. 请求队列的 correctness condition 是什么？取消和超时怎么处理？
4. batching 策略是在优化吞吐，还是牺牲尾延迟？
5. KV cache 如何分配、分页、驱逐和回收？
6. kernel 是 compute-bound、memory-bound，还是 launch/sync-bound？
7. tensor layout 是否让访存 coalesced，tile 是否复用到 shared memory？
8. 统计、计费、日志是否允许最终一致？哪些地方必须严格一致？
9. 如果某个节点 crash，哪些操作会重试？是否幂等？
10. P99/P999 latency 的瓶颈是不是被平均吞吐掩盖了？
```

真正的系统优化不是“把每层都换成最快技术”，而是先定位瓶颈：

```text
连接多 -> 用 event-driven / coroutine；
队列热 -> 分片 / batching / backpressure；
显存紧 -> KV cache paging / eviction；
算力满 -> tensor layout / fusion / tensor core；
尾延迟差 -> 调度、隔离、限流和负载均衡。
​```---
## 本节知识点总结

​```text
1. 第 21 讲的主线是把一次 LLM 请求还原成完整系统路径，而不是介绍孤立新概念。
2. API endpoint 背后是 DNS、路由、负载均衡、网关、业务服务和推理集群共同组成的入口。
3. C10K 说明一连接一 OS 线程不可扩展；epoll、事件驱动和协程把等待成本从线程成本中解耦。
4. AI 推理时代的新瓶颈是每个请求背后的 GPU 算力、显存和 KV cache，而不只是连接数。
5. 数据中心是 OS 知识的工业化展开：fd、线程、锁、队列、缓存、调度和网络都在其中落地。
6. 分布式系统不能只沿用 UNIX 的字节流模型，很多场景必须把计算带到数据附近。
7. LLM 推理本质上是从学到的函数中采样下一个 token，核心实现落在张量、循环、矩阵乘和 softmax 上。
8. Attention 的 Q/K/V 公式最终会落到规则密集张量计算，因此天然适合 GPU/SIMT。
9. CUDA kernel launch 是 CPU 向 GPU 提交大量逻辑线程的异步执行请求，性能关键在布局、访存、同步和粒度。
10. Prefill 负责构建 KV cache，Decode 负责逐 token 读取和追加 KV cache。
11. KV cache 是 LLM serving 的核心系统状态，问题形态很像虚拟内存、cache 和 allocator。
12. 模型最终返回的是 token id；tokenizer decode 后才变成用户看到的 UTF-8 文本。
13. 首 token 延迟和后续 token 吞吐是不同指标，分别受排队/prefill 和 decode/cache/GPU 利用率影响。
14. 本讲给出的能力不是背技术名词，而是用 first principles 还原未知系统的瓶颈、边界和不变量。
```

