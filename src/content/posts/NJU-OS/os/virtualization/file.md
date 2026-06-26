---
title: "4.访问操作系统对象；文件描述符"
published: 2026-06-22
updated: 2026-06-04
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / virtualization"
description: "4.访问操作系统对象；文件描述符"
draft: false
sourceLink: ""
---
## 操作系统对象与 API

- 从设计者视角看，OS 需要提供一套简单、稳定、可组合的接口，让上层开发者在其上继续封装。
- 文件的抽象本质是：**带名字的数据对象（字节序列）**。
- UNIX 的关键不是“所有东西真的都是磁盘文件”，而是“很多对象都可以用文件接口访问”。普通文件、目录、设备、`/proc/[pid]/...`、socket、pipe 都可以纳入这套统一接口。这让 shell、小工具、脚本、LLM agent 都更容易组合系统对象。`FHS`（Filesystem Hierarchy Standard）规定了目录树的大致职责，让软件和用户能预测文件该放在哪里。
- Windows 的思路是专用 API：文件用 `CreateFile/ReadFile`，进程用 `OpenProcess/ReadProcessMemory`，表达力更细，但 API 更碎。

## 文件描述符 fd

文件的打开状态存放在内核中，因为内核内存相对磁盘读写更快，并且有保护。为了避免使用指针直接访问内存可能出错，unix提供了一个整数fd，作为访问内核的接口

- `fd`（file descriptor）是进程访问操作系统对象的整数句柄。
- 约定：`0` 是 `stdin`，`1` 是 `stdout`，`2` 是 `stderr`。
- `open()` 通常返回当前最小未使用的 `fd`；关闭后编号可以复用。
- `fd` 是进程级索引，不是系统级全局编号；每个进程有自己的fd table，这个table的每一项再指向内核中的一个文件打开状态。所以不同进程里的相同的fd可以指向完全不同的对象。
- 课上用一个简化模型理解“打开文件”：

```c
struct FILE {
    char *data;
    size_t offset;
};
```

## fork与文件打开状态

- Windows 的 `handle` 和 UNIX 的 `fd` 类似，都是用户态持有、由内核解释的对象引用。
- 但 `handle` 的含义更广，可以引用文件、进程、线程、事件、互斥锁等各种内核对象。
- Windows 倾向于把访问权限直接绑定到 handle 上，并默认不在新进程中继承它们。

- UNIX `fork()` 后，子进程复制父进程的 `fd table`，但表项通常仍指向同一个内核文件打开状态。
- 因而父子会共享同一个 `offset`：父进程读过之后，子进程再读会从更新后的偏移开始。
- Windows 没有 `fork()`；`CreateProcess` 非显式指定的情况下不继承 handle，所以默认不会共享文件偏移。

## Pipe

- `pipe` 的本质不是磁盘文件，而是**被文件接口包装的内核字节流缓冲区**。写端向缓冲区写入并唤醒读端，然后读端从缓冲区读出。过程遵循FIFO顺序。
- `pipe(pipefd)` 返回两个 `fd`：`pipefd[0]`：读端`pipefd[1]`：写端
- 匿名管道是“没有文件名、只靠进程手里的 `fd` 引用”的 pipe。
- `fork()` 之后父子都会继承读端和写端，于是它天然适合父子进程通信，只需要`fork` 后立刻关闭自己不用的那一端。
- Shell 中的 `cmd1 | cmd2` 底层就是：`pipe + fork + dup2 + execve`。

