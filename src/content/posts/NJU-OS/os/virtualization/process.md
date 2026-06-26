---
title: "2.程序和进程"
published: 2026-06-22
updated: 2026-06-03
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / virtualization"
description: "2.程序和进程"
draft: false
sourceLink: ""
---
## 程序与进程

- 程序是状态机的静态描述：代码规定了状态转移规则，但自己不会运行。
- 进程是运行中的状态机实例：有当前 `PC/寄存器`、地址空间、打开文件、信号状态、凭据、工作目录、环境变量等上下文。
- 因而“程序”更像模板，“进程”更像带现场的执行对象。
- 不是所有进程的父进程都是 systemd；只有孤儿进程才会被 PID 1 接管。
- 子进程退出时发 `SIGCHLD` 给它的父进程，不是直接通知 `systemd`。
- 僵尸进程的本质是“已经退出，但父进程还没 `wait`”；PID 1 接管孤儿后会负责回收。

## 虚拟化与 CrazyOS

- 操作系统对 CPU 的核心虚拟化可以抽象成：

```c
while (1) {
  p = pick_next();
  run_one_step(p);
}
```

- `CrazyOS` 用用户态模拟器把这个想法落地：每个 `proc` 维护自己的寄存器和内存，主循环每次只执行当前进程的一条 guest instruction。
- 于是“并发”首先是交错执行，不是同时执行；哪个进程更快看到输出，取决于它完成同一可观察动作需要多少条指令。
- 这也是 `./crazy-os p2.bin p1.bin | less` 中 `p2` 看起来更快的原因：`p2` 打印 `1,2,3...`，`p1` 打印 `10,20,30...`，后者每行通常多一位数字，也就多一次 `ecall` 和更多模拟指令。

## 进程状态与可观测性

- 进程的最小可执行核心是：寄存器现场 + 虚拟地址空间。
- 但一个 Unix 进程的完整状态远不止这些，还包括：
  `pid/ppid`、调度状态、页表与映射、文件描述符表、cwd、`umask`、信号处理器与 mask、session/process group、uid/gid、资源限制、环境变量等。
- 用户态可以直接读自己地址空间中的数据，也天然在使用当前寄存器；但内核代管的那部分状态不能直接 load，只能通过内核接口观测。
- 这些接口既可以是系统调用，也可以是内核导出的伪文件系统，如 `/proc`。

## /proc 与 procfs

- `procfs` 是文件系统类型，`/proc` 是它通常的挂载点；前者是机制，后者是位置。
- `/proc` 中的项在接口层面确实是“文件/目录/链接”，可以 `open/read/write/stat`。
- 但它们通常不是磁盘上长期存在的普通文件，内容多半由内核在读取时按当前状态动态生成。
- 因而 `/proc/<pid>/maps`、`/proc/<pid>/status`、`/proc/<pid>/fd` 本质上是“进程状态的文件化视图”。

## fork / execve / exit

- `fork()` 复制当前进程，返回两次：父进程得到子进程 PID，子进程得到 `0`；失败返回 `-1`。
- 语义上 `fork` 复制的是整个执行上下文，实现上通常依赖 Copy-on-Write：先共享物理页，写时再真正复制。
- `fork` 不是“从初始模板创建新进程”，而是“把当前计算过程分叉成两条执行线”；这使共享预处理结果、zygote process、checkpoint、fork-based DFS 变得自然，避免了对公共子问题的重复计算。
- fork bomb `:() { : | : & }; :` 的危险在于进程数指数增长；系统可能通过 `RLIMIT_NPROC`、cgroup、PID/内存限制、OOM 等机制缓解
- `execve(path, argv, envp)` 用新程序替换当前进程的代码/数据/堆/栈；PID 通常不变，默认文件描述符保留，成功后不返回。
- 环境变量就是 `execve` 的 `envp`：一组传给新进程的 `key=value` 字符串，如 `PATH/HOME/LANG`。
- `_exit(status)` 终止当前进程，释放资源，并向父进程发送 `SIGCHLD`；父进程通过 `wait/waitpid` 回收退出状态。

## UNIX 设计哲学

- `fork + execve` 的分离体现了“小原语 + 可组合”的哲学。
- `fork` 只负责复制当前上下文，`execve` 只负责替换程序映像；两步之间用户态可以自由做重定向、改环境变量、改工作目录、设置信号处理。
- 因而 shell 能用 `fork + dup2 + execve + wait` 组合出管道、重定向、后台任务，而不需要一个臃肿的“万能创建进程”系统调用。

