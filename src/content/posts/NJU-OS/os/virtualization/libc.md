---
title: "5.C 标准库原理"
published: 2026-06-22
updated: 2026-06-07
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / virtualization"
description: "5.C 标准库原理"
draft: false
sourceLink: ""
---
## libc 的定位

- `libc` 可以先粗略理解成 C 程序和操作系统之间的一层公共运行时。
- 但它不是“把几个 syscall 包一层”这么简单。很多看起来像普通库函数的东西，其实都卡在语言、ABI、机器模型和操作系统接口的交界处。
- 课程里讲 `libc`，核心不是背函数表，而是理解这层抽象到底替我们吃掉了哪些底层细节。

## C 与二进制接口

- `SimpleC` 那套模型里，指针、数组、结构体、函数调用，本质上都能落回“寄存器和内存怎么变化”。
- 但真实世界里的 C 还要和外部二进制世界打交道：
  - 可以链接汇编函数；
  - 可以写 inline assembly；
  - 可以直接站在 syscall 边界上。

```c
void _start() {
  __asm__("mov $60, %eax\n"
          "xor %edi, %edi\n"
          "syscall");
}
```

- 这个例子已经说明，C 并不是只能老老实实等编译器把代码翻成汇编然后结束。
- 你完全可以绕开大部分运行时，自己从 `_start` 开始写，自己发 `syscall`。
- 也正因为可以这样做，`libc` 的作用才更清楚：它把这些本来要程序员自己处理的底层活，变成了一套统一接口。

## ABI 与平台相关约束

- 有些头文件看起来很“静态”，其实一点也不简单，比如 `stddef.h`、`stdint.h`、`inttypes.h`、`limits.h`、`float.h`。
- 它们里面那些类型、常量、格式化宏，都和平台字长、整数表示、浮点格式、对齐规则、ABI 约定绑得很紧。
- 例如 `PRIdPTR`、`PRIuPTR` 这种东西，本质上就是在适配“这个平台上的指针整数到底该怎么打印”。

- `stdarg.h` 更典型。`printf` 这种变参函数要正确工作，前提是运行时知道参数是怎么传进来的。
- 现代 ABI 下，参数未必老老实实全在栈上，往往是一部分进寄存器，一部分进栈；整数参数、浮点参数、向量参数的规则也可能不同。
- 所以 `va_list` 不是一个脱离机器存在的抽象，它背后直接连着 ABI。

## 标准库中的通用计算组件

- `string.h` 里的 `memcpy`、`memmove`、`strcpy`
- `stdlib.h` 里的 `atoi`、`qsort`、`rand`
- `math.h` 里的各种数学和浮点相关函数

- 这些函数表面上像“自己也能写个差不多的版本”，但真要做到标准要求那样可移植、正确、性能不差，就没有那么随手了。
- 例如：
  - `memcpy` 和 `memmove` 的重叠语义不同；
  - `qsort` 这种接口其实已经把“对象表示 + 回调 + 比较规则”全揉在一起了；
  - 浮点函数还会碰到 NaN、舍入和异常值。

- 所以这部分不是给 syscall 起别名，而是在做真正的库实现。

## stdio 与系统调用封装

- 最容易看到的是 `stdio`。
- `FILE *` 背后通常连着一个文件描述符，但它又不等于文件描述符。
- `stdio` 在 `fd` 之上又维护了一层自己的状态，比如：
  - 缓冲区；
  - 当前位置；
  - EOF 和 error 标志；
  - 锁；
  - 格式化输出逻辑。

- 这就是为什么你写的是 `printf`，`strace` 里看到的却是 `write`。
- `printf` 先在用户态解析格式串、处理 `va_list`、往缓冲区里填数据，最后才在合适的时候发 `write`。
- `fseek`、`ftell`、`feof`、`vfprintf` 这一类接口，也都是这层抽象的一部分。

- 所以这里比较自然的理解方式是：

```text
syscall 提供最原始的机制
libc 在上面组织出更适合应用编程的对象和接口
```

## 进程控制与运行环境

- `abort` 不只是“退出”，而是给自己发 `SIGABRT`，通常还要让 core dump 机制接得上。
- `exit` 也不只是 `_exit`。正常 `exit` 之前，`libc` 还要做不少收尾工作，比如 flush `stdio` buffer、调用 `atexit` handler。
- `system`、`popen`、`pclose` 则是在 `fork/exec/pipe/wait` 这些机制上再包一层更高的接口。

- 环境变量这块也一样。
- 内核在进程刚开始运行时，只是把 `argc/argv/envp/auxv` 这些原始数据按 ABI 约定放到初始栈里。
- 但 C 程序里看到的 `environ` 是一个全局符号，它不是内核直接替你维护好的现成变量。
- 这个整理过程还是 runtime/libc 来做。

## C runtime 与程序入口

- 这一点前面其实已经见过，但放到 `libc` 这里会更完整。
- `execve` 之后，内核大致做的是：

```text
加载 ELF
准备初始用户栈：argc / argv / envp / auxv
把 RIP 设到入口点，一般是 _start
开始执行用户态第一条指令
```

- 所以后面真正先跑起来的是 `_start`，不是 `main`。
- `_start` 再去完成最基本的运行时初始化，然后把控制权交给 `__libc_start_main`，最后才轮到 `main`。
- 这也是为什么链接时你会看到 `crt1.o`、`crtbegin.o`、`crtend.o`、`crtn.o` 这些对象文件。它们都属于 C runtime 这一层。

可以把这条链记成：

```text
execve
  -> _start
  -> runtime 初始化
  -> __libc_start_main
  -> main
  -> exit
```

- `main` 只是这条链中间的一个普通函数，不是进程天然的起点。

## libc 与 ABI 的联系

- 因为很多 `libc` 功能，表面是“库函数”，底层其实离机器非常近。
- 比如：
  - `printf` 要按 ABI 读变参；
  - `_start` 要按 ABI 理解初始栈布局；
  - `setjmp/longjmp` 要保存和恢复寄存器现场；
  - `environ` 的建立要依赖进程启动时那套约定。

- 所以 `libc` 这一层有点像一条分界线：
  - 往下，是机器、ABI、syscall、进程启动细节；
  - 往上，是 C 程序、C++ 标准库、各种更高层运行时。

## 本节要点

- `libc` 不是几个 Linux 接口的说明书，而是一层可移植运行时。
- 它把很多平台相关、ABI 相关、启动相关的脏活都包起来了。
- 没有这层东西，应用程序就得自己处理：
  - 参数怎么从 ABI 边界进来；
  - 初始栈怎么解释；
  - `printf` 怎么格式化；
  - `exit` 之前怎么收尾；
  - 堆分配器怎么维护状态。

- 从操作系统视角看，理解 `libc`，本质上就是理解“一个 C 程序到底是怎么真正跑起来的”。

