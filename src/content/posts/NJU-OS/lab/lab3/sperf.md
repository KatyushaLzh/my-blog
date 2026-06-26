---
title: "Lab 3: sperf"
published: 2026-06-22
updated: 2026-06-11
category: "NJU OS"
tags: ["NJU OS","Lab"]
series: "NJU OS / lab / lab3"
description: "Lab 3: sperf"
draft: false
sourceLink: ""
---
[M3: 系统调用性能分析器 (sperf)](https://jyywiki.cn/OS/2026/labs/M3.md)

简化题意：运行 `strace` 跟踪指定程序，流式读取每次系统调用的耗时，并每隔约 100 ms 输出累计耗时前5高的系统调用。

# Lab 3: `sperf` 与进程间通信接口笔记

## 1. 整体进程模型

程序中实际存在三层角色：

```text
sperf 父进程
  └─ strace 子进程
       └─ 被跟踪的目标程序
```

- 父进程负责读取、解析、累计和定时输出。
- `fork` 出来的子进程通过 `execve` 变成 `strace`。
- `strace` 再启动目标程序，并把跟踪结果写到自己的标准错误。

父进程必须和 `strace` 并发工作，不能先 `waitpid`，等它退出后再读取 pipe。否则 pipe 写满后，`strace` 等待读者，父进程又等待 `strace` 退出，会形成死锁。

## 2. `strace`

常用命令：

```bash
strace -T command arguments...
```

`-T` 会在每次系统调用末尾输出该次调用的耗时：

```text
read(3, "abc", 3) = 3 <0.000012>
```

- `read` 是系统调用名。
- `<0.000012>` 是这一次系统调用经过的时间。
- `strace` 默认把跟踪信息写到 `stderr`，避免和目标程序的正常 `stdout` 混在一起。
- `-c` 可以在程序结束后生成汇总表，但不适合本实验要求的流式、周期性输出。

`strace` 还可能产生信号、退出信息等非系统调用行，因此 parser 不能假设每一行都有 `name(...) <time>` 的格式。

## 3. `pipe`

接口：

```c
#include <unistd.h>

int pipe(int pipefd[2]);
```

成功后：

- `pipefd[0]` 是读端。
- `pipefd[1]` 是写端。
- pipe 是内核维护的单向字节流缓冲区，不保留“行”或“消息”的边界。

对读端调用 `read` 时：

- 缓冲区有数据：返回实际读到的字节数。
- 缓冲区为空，但仍有写端：阻塞等待。
- 缓冲区为空，并且所有写端引用都已关闭：返回 `0`，即 EOF。
- 出错：返回 `-1`，具体原因在 `errno` 中。

pipe 可读不要求缓冲区已满，只要有任意数据，`poll` 就可以报告 `POLLIN`。缓冲区满影响的是写端：此时继续 `write` 可能阻塞。

## 4. `fork` 与 fd 继承

接口：

```c
pid_t fork(void);
```

返回值：

- `0`：当前位于子进程。
- `> 0`：当前位于父进程，返回值是子进程 PID。
- `-1`：创建失败。

`fork` 后父子进程拥有各自的 fd table，但复制得到的 fd 表项仍指向相同的内核文件对象。因此，父子双方都可能持有同一个 pipe 端点的引用。

必须及时关闭不用的端：

- 父进程只读，所以关闭 `pipefd[1]`。
- 子进程只写，所以关闭 `pipefd[0]`。

这不只是资源清理。父进程如果忘记关闭自己的写端，内核会认为 pipe 未来仍可能收到数据，读端就无法得到 EOF。

## 5. `dup2` 与重定向

接口：

```c
int dup2(int oldfd, int newfd);
```

它让 `newfd` 指向 `oldfd` 指向的同一个内核对象。若 `newfd` 原本已打开，内核会先关闭它。

本实验中：

```c
dup2(pipefd[1], STDERR_FILENO);
```

执行后，`STDERR_FILENO`（fd 2）指向 pipe 写端。此时原来的 `pipefd[1]` 只是一个多余别名，应当关闭：

```c
close(pipefd[1]);
```

不能关闭 `STDERR_FILENO`，因为后续运行的 `strace` 正是通过 fd 2 向 pipe 写跟踪信息。

## 6. `execve` 与参数数组

接口：

```c
int execve(const char *pathname, char *const argv[],
           char *const envp[]);
```

`execve` 用新程序映像替换当前进程。成功时不会返回；失败时返回 `-1`。

它会替换代码、数据、堆栈等用户态内容，但默认保留 fd table，所以在 `execve` 前完成的 stderr 重定向仍然有效。设置了 `FD_CLOEXEC` 的 fd 是例外，会在成功执行时关闭。

执行：

```bash
strace -T ls -l
```

对应的参数数组应满足：

```text
argv[0] = "strace"
argv[1] = "-T"
argv[2] = "ls"
argv[3] = "-l"
argv[4] = NULL
```

关键约束：

- `argv[0]` 是被执行程序约定的程序名。
- 最后必须有一个空指针，而不是字符 `'\0'`。
- 字符串字面量本身已经带结尾 NUL，不需要写成 `"strace\0"`。
- `execve` 不会自动搜索 `PATH`；需要搜索时应自行解析 `PATH`，或使用提供 PATH 搜索语义的其他接口。

## 7. `poll`

接口：

```c
#include <poll.h>

int poll(struct pollfd *fds, nfds_t nfds, int timeout);
```

`struct pollfd`：

```c
struct pollfd {
    int fd;
    short events;
    short revents;
};
```

- `events` 表示希望监听的事件。
- `revents` 由内核填写，表示实际发生的事件。
- `timeout` 单位是毫秒；`0` 表示立即返回，`-1` 表示无限等待。

返回值：

- `> 0`：至少一个 fd 发生事件。
- `0`：超时。
- `-1`：出错，例如被信号中断。

本实验主要关心：

- `POLLIN`：当前存在普通数据可读。
- `POLLHUP`：pipe 的所有写端均已关闭，不会再产生新数据。
- `POLLERR`：fd 出现错误。
- `POLLNVAL`：fd 无效。

父进程只需主动订阅 `POLLIN`：

```c
pfd.events = POLLIN;
```

`POLLHUP`、`POLLERR` 和 `POLLNVAL` 即使没有写入 `events`，也会由内核报告在 `revents` 中。组合多个事件或检查返回事件时应使用按位或和按位与，不能使用逻辑运算代替。

`POLLIN` 和 `POLLHUP` 可以同时出现，表示写端已经关闭，但 pipe 中仍有残留数据。不能看到 `POLLHUP` 就直接退出，最终 EOF 应以 `read(...) == 0` 为准。

## 8. 流式分行

一次 `read` 与一行 `strace` 输出没有对应关系。一次读取可能得到：

- 半行；
- 恰好一行；
- 多行；
- 多行加最后半行。

因此需要维护用户态残留缓冲区：

1. 把本次读取的数据追加到残留数据后面。
2. 按 `'\n'` 提取所有完整行并解析。
3. 把最后不完整的一段移动到缓冲区开头。
4. 等待下一次 `read` 继续拼接。

这体现了 pipe 的核心语义：它只提供有序字节流，不提供消息边界。

## 9. 每秒约输出 10 次

100 ms 表示刷新周期，不是统计窗口。每次输出应展示程序开始以来的前缀累计统计：

```text
第 1 次：[0, 100 ms]
第 2 次：[0, 200 ms]
第 3 次：[0, 300 ms]
```

打印时机不能只依赖 `poll` 超时。如果 pipe 持续可读，`poll` 会不断提前返回，可能永远没有 `r == 0`。

更稳定的模型是维护一个绝对截止时间：

1. 使用单调时钟记录 `next_print = now + 100 ms`。
2. 每轮把 `next_print - now` 换算为 `poll` timeout。
3. 处理完本轮 I/O 后重新读取时间。
4. 若 `now >= next_print`，输出当前统计并推进截止时间。

计量时间间隔适合使用：

```c
#include <time.h>

clock_gettime(CLOCK_MONOTONIC, &ts);
```

`CLOCK_MONOTONIC` 不受系统墙钟时间被人工调整的影响。

## 10. `waitpid`

接口：

```c
pid_t waitpid(pid_t pid, int *status, int options);
```

父进程在读完 pipe、确认 EOF 后调用 `waitpid`，回收 `strace` 子进程并取得退出状态，避免产生僵尸进程。

正确顺序是：

```text
持续 poll/read/parse
        ↓
read 返回 0，确认 EOF
        ↓
waitpid 回收子进程
```

不能在读取 pipe 前阻塞等待子进程结束。

## 11. 输出 80 个 NUL

`printf("\0")` 输出不了 NUL，因为 `"\0"` 对 `printf` 来说只是长度为 0 的空字符串。

可以逐字节输出：

```c
for (int i = 0; i < 80; i++) {
    fputc('\0', stdout);
}
fflush(stdout);
```

也可以构造全零数组后使用 `fwrite`。`fflush(stdout)` 用于确保 stdio 缓冲区中的结果及时提交。

## 12. 这次实现中踩过的坑

- 父进程先 `waitpid`、不读取 pipe，导致 pipe 写满后父子进程互相等待。
- `dup2` 后忘记关闭多余 fd 别名，干扰 pipe 写端引用计数和 EOF 判定。
- 误以为 pipe 缓冲区满才算可读；实际上存在任意数据即可报告 `POLLIN`。
- 用按位与组合希望监听的事件，导致 `events` 变成 0；实际只需订阅 `POLLIN`，并从 `revents` 检查 `POLLHUP`。
- 看到 `POLLHUP` 就退出，忽略了 pipe 中可能仍有残留数据。
- 认为一次 `read` 可以读完整行，没有考虑短读、多行和半行拼接。
- `execve` 的参数数组忘记以 `NULL` 结尾，或把结尾下标写到分配范围之外。
- 为参数字符串 `malloc` 后立刻覆盖指针，造成无意义的内存泄漏。
- `strace` 的非系统调用输出也进入 parser，导致未初始化字符串或错误耗时被加入统计。
- 只在 `poll` 超时时打印；持续产生 syscall 时，`poll` 总因 `POLLIN` 返回而无法稳定刷新。
- 混用微秒和毫秒，导致 timeout 变成约 5 ms 或出现负值。
- 使用 `printf("\0")`，实际上没有输出题目要求的 80 个 NUL。
- 在 shell 外层写 `> /dev/null`，连 `sperf` 自己的标准输出也一起重定向掉了。

## 13. 总结

- `fork` 创建并发执行环境，`execve` 替换子进程程序映像。
- `pipe` 提供内核字节流，`dup2` 把 `strace` 的 stderr 接入 pipe。
- fd 是否仍然打开由引用决定；pipe EOF 的条件是缓冲区为空且所有写端都关闭。
- `poll` 负责等待“I/O 就绪或时间到达”，`read` 才真正消费数据。
- 对字节流必须自行恢复行边界，对周期输出必须把输入事件与时钟节拍解耦。
- `waitpid` 应在通信完成后回收子进程，而不是阻塞在通信之前。

