---
title: "1.绪论"
published: 2026-06-22
updated: 2026-06-01
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / intro"
description: "1.绪论"
draft: false
sourceLink: ""
---
计算机世界没有魔法。

## 应用视角的操作系统

应用视角的操作系统是一组 `API`：进程、地址空间、文件描述符、内存映射等资源都通过系统调用访问。

### 程序

`Everything is a state machine`：一切都是状态机。

硬件状态可以粗略看成：

```text
(registers, memory)
```

CPU 执行指令，就是把状态迁移到下一个状态。用户态程序也类似：

```text
用户态寄存器 + 用户虚拟地址空间 + OS 维护的进程状态
```

虚拟地址空间包含代码段、只读数据、全局变量、堆、栈、`mmap` 区域等。

注意：`PC/RIP` 是寄存器，不在栈顶。CPU 根据 `PC/RIP` 取下一条指令；栈上主要保存返回地址、局部变量、保存的寄存器等函数调用状态。

程序也不是从 `main` 直接开始。Linux 执行 ELF 时大致是：

```text
execve
  -> 内核加载 ELF，建立地址空间
  -> 准备初始用户栈：argc / argv / envp / auxv
  -> 设置 RIP = ELF entry，通常是 _start
  -> _start 初始化运行时，再调用 main
```

所以：

```text
_start 是进程真正入口；
main 是 C/C++ 运行时调用的普通函数。
```

函数调用通常会创建栈帧，但这是 ABI/编译器约定；优化后可能内联、尾调用、省略帧指针，因此不能把“每个函数一定有一个栈帧”当成语义保证。

`C` 可以改写成“每行只做一件事”的 Simple C 风格，因此接近机器模型；但现代 C 不是简单的高级汇编，它有 UB、别名规则、对象生命周期和优化语义。

### 编译器

早期编译器可以近似理解为直接翻译语句；现代编译器会在保持可观察行为不变的前提下激进优化。

编译正确性：

```text
对任意符合语言语义的输入，编译后程序与源程序具有相同的可观察行为。
```

可观察行为包括程序终止性、`volatile` 访问、I/O、系统调用产生的外部效果、与外部函数/ABI 的交互等。

如果计算结果不影响可观察行为，编译器可以删除它；但 `write/read/mmap/exit` 这类有外部副作用的调用不能被当作普通算术随意删除、合并或重排。

系统调用相关优化要分层：

```text
编译器：可能优化 printf("x\n") 这类库调用形式
libc：通过 stdio buffering 减少 write 次数
内核：执行 syscall 后走具体内核路径
```

### 系统调用指令

最小的 `hello world` 不是在 `main` 中调用 `printf`，而是从 `_start` 开始直接执行：

```text
write(1, "hello world\n", 12)
exit(0)
```

Linux x86-64 系统调用 ABI：

```text
rax = syscall number
rdi/rsi/rdx/r10/r8/r9 = args
syscall
```

`write()` 是 C 库函数，真正进入内核的是 `syscall` 指令。

用户态程序直接能做的事情：

```text
改变用户态可见寄存器状态；
读写自己有权限的虚拟内存；
通过 syscall/ecall/svc 请求内核服务。
```

系统调用会把状态机暂时交给 OS：CPU 切到内核态，内核检查参数和权限，执行服务，再返回用户态；`exit` 这类系统调用可能不返回。

程序也可能通过异常被动进入内核，例如缺页、除零、非法指令、非法地址访问。非法内存访问通常最终变成 `SIGSEGV`。

### 应用、工具程序、后台程序

用户态程序大致包括：

```text
Applications：浏览器、IDE、播放器等面向用户任务的程序
Utilities：ls、cat、cp、mv、rm、sort、wc 等工具程序
Daemons：systemd、sshd、cron 等长期运行的后台服务
```

它们本质上都是：

```text
用户态计算 + 系统调用
```

`coreutils` 是 GNU 提供的一组基础命令行工具集合，例如 `ls/cat/cp/mv/rm/mkdir/wc/sort/date/sleep`。它不是“系统调用薄包装”的泛称，而是一批标准工具程序；这些程序内部通常调用 libc/POSIX API，最终落到系统调用。

典型例子：

```text
cat file -> openat/read/write/close
ls       -> openat/getdents64/stat/write
```

`daemon` 也是普通用户态进程，只是长期运行、通常没有交互式终端，用来提供系统服务。

Linux 下可以用 `strace` 观察程序发出的系统调用；它看到的是用户程序和内核之间的 syscall 边界，而不是所有普通用户态指令或 libc 内部细节。

## 硬件视角的操作系统

硬件根本不知道有没有操作系统。从硬件看，OS 首先也只是会被 CPU 执行的一段程序；机器只关心状态、初始状态和状态迁移。

### 计算机的状态机模型

最简模型是：

```text
(registers, memory)
```

CPU 每执行一条指令，就是把当前状态迁移到下一个状态；`PC/RIP` 决定下一条从哪里取指。

但只看寄存器和内存还不够，因为真实计算机不是封闭系统。还要加入“外部世界”：I/O 设备，中断线，GPIO 这类最基础的设备引脚等

CPU 和设备通信的典型方式有两种：

- `port I/O`：例如 x86 的 `in/out`
- `MMIO`：把设备寄存器映射到物理地址空间，像访存一样读写GPIO 就是最简单的 `MMIO` 设备之一

对多处理器系统，可以先用一个简化模型理解：

```text
每个 CPU 有自己的寄存器；
处理器之间共享内存和外设；
系统的执行像是在多个 CPU 之间交错选择一步。
```

这个模型足够建立直觉；但真实机器上还会叠加 cache、乱序执行和 memory model，因此并发行为会比“轮流单步执行”复杂得多。

### 硬件的初始状态

`reset` 不是普通中断。中断的语义是“打断当前控制流，保存现场，处理完再回来”；`reset` 的语义是“当前上下文作废，硬件强制回到定义好的初始状态重新开始”。

这就是为什么老式机器常有 `reset` 按钮：系统可能已经因为内核、驱动或硬件状态异常而不再可靠响应，中断也未必救得回来，只能丢弃当前状态重启。

### 固件

断电后 RAM 内容可能丢失，但如果不加处理，`reset` 后 CPU 的第一条指令会来自那片不可信的 RAM，导致执行非法指令。

所以`reset` 后不是从随机 RAM 开始跑，而是从预先约定好的启动入口取指，这个过程由固件`firmware`控制。

`firmware` 是 reset 后第一个执行的软件，它可以看作“OS 之前的 OS”。

```text
CPU reset
  -> PC 指向 firmware
  -> firmware 初始化最小硬件环境
  -> 初始化 DRAM / 检测设备
  -> 加载后续 bootloader / kernel
```

早期 OS能力弱， firmware 往往还长期提供运行时服务；现代系统里，OS 启动后通常会尽快接管设备和资源管理，firmware 更多只负责引导和少量平台服务。

`BIOS`和`UEFI`是firmware的两种实现标准，其中后者是一种更现代的，更模块化的架构替代

`BIOS` 是传统 PC 固件：16 位实模式、接口简单、历史包袱重。IBM PC 的经典启动流程是：

```text
BIOS 扫描启动设备
  -> 读取启动盘前 512B 到 0x7c00
  -> 检查末尾魔数 0x55AA
  -> 跳转到 0x7c00 执行
```

`UEFI` 则不是“更大的 BIOS 中断库”，而是一套更完整的固件执行环境和启动规范。它通常能直接识别分区和文件系统，加载 `.efi` 程序；本质上更像一个最小固件操作环境。

从 OS 视角，BIOS 和 UEFI 的共同点比差异更重要：

可以把整个启动链压缩成：

```text
CPU Reset -> Firmware -> Bootloader -> Kernel -> 第一个用户进程 
```

补充：`CIH`病毒通过获取足够高的权限，对firmware进行写，导致机器无法启动
