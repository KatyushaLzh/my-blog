---
title: "7.链接和加载"
published: 2026-06-22
updated: 2026-06-11
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / os / virtualization"
description: "7.链接和加载"
draft: false
sourceLink: ""
---
# 链接和加载

## 核心模型

可执行文件不是“装着机器指令的盒子”，而是一份描述**进程初始状态**的数据结构：

- 哪些文件内容映射到哪些虚拟地址；
- 每段内存具有哪些读、写、执行权限；
- 未初始化数据需要补多少个零；
- 初始 `PC/RIP` 指向哪里；
- 动态程序应先运行哪个解释器；
- 初始栈中的 `argc/argv/envp/auxv` 如何布置。

整个过程可以压缩成：

```text
源文件
  -> 编译/汇编
  -> 可重定位目标文件 .o
  -> 链接：合并片段、解析符号、计算并填写地址
  -> 可执行文件/共享对象
  -> execve
  -> 加载：建立地址空间、映射段、准备初始栈
  -> 从入口地址开始执行
```

其中：

- **链接**解决“这些代码和数据最终放在哪里，引用它们时应填什么数字”。
- **加载**解决“怎样按照可执行文件的描述建立进程初始地址空间”。

讲义中“链接就是算数字填 offset，加载就是按描述 `mmap`”是最重要的去神秘化模型。

## 与 `Linking.md` 的分工

[Linking.md](</notes/csapp/notes/7-linking/>) 已经系统覆盖了静态链接那一侧：

- `.c -> .i -> .s -> .o -> executable`；
- ELF 的常见 section；
- 符号解析、强弱符号、`COMMON/.bss`、`-fno-common`；
- 静态库扫描顺序；
- 基本重定位算法与 `R_X86_64_PC32` 等例子。

这里不再重复那部分细节，只保留进入操作系统视角所必需的一座桥：

- 链接器主要处理 `section/symbol/relocation`；
- 加载器主要处理 `segment/address space/initial stack`；
- 对 OS 来说，重点不再是“某个重定位项怎么算”，而是“内核如何把 ELF 变成一个真正开始运行的进程”。

### Section 与 Segment 的最小区分

这份笔记只保留一个后面会一直用到的分界：

- `section` 是链接视图，服务于目标文件组织、符号表、重定位表；
- `segment` 是加载视图，服务于虚拟地址映射和 `R/W/X` 权限。

可以粗略记成：

```text
readelf -S 主要在看链接器关心的结构
readelf -l 主要在看加载器关心的结构
```

## 加载：把 ELF 变成进程

执行：

```c
execve(path, argv, envp);
```

后，当前进程映像被替换。Linux 中 ELF 加载的核心实现位于 `fs/binfmt_elf.c`，概念流程是：

1. 检查 ELF 魔数、体系结构、文件类型等。
2. 读取 Program Header Table。
3. 为每个 `PT_LOAD` 建立文件支持的虚拟内存映射。
4. 对 `p_memsz > p_filesz` 的尾部清零，其中常包含 `.bss`。
5. 设置各段的读、写、执行权限。
6. 映射 `vvar/vdso` 等内核提供的区域。
7. 在用户栈上放置 `argc/argv/envp/auxv` 和对应字符串。
8. 设置初始栈指针和程序计数器，返回用户态。

`PT_LOAD` 中关键字段的关系是：

- `p_offset`：数据在 ELF 文件中的偏移；
- `p_vaddr`：映射后的虚拟地址；
- `p_filesz`：文件中实际存在的字节数；
- `p_memsz`：内存中需要占据的字节数；
- `p_flags`：`R/W/X` 权限；
- `p_align`：对齐要求。

可以用下面的伪代码建立直觉：

```c
for (each PT_LOAD segment) {
    map_file(segment.p_offset,
             segment.p_vaddr,
             segment.p_filesz,
             segment.p_flags);
    zero_fill(segment.p_vaddr + segment.p_filesz,
              segment.p_memsz - segment.p_filesz);
}
```

真实内核实现还要处理页对齐、地址随机化、权限检查、错误回滚等细节，不能直接等同于一条用户态 `mmap`，但抽象上确实是在建立同样的映射关系。

### Initial Process Stack

程序刚进入用户态时，栈大致包含：

```text
低地址
SP -> argc
      argv[0] ... argv[argc-1], NULL
      envp[0] ... envp[n-1], NULL
      auxv[0] ... AT_NULL
      参数字符串、环境变量字符串等
高地址
```

辅助向量 `auxv` 是内核向用户态运行时传递信息的键值表，例如：

- `AT_ENTRY`：主程序入口；
- `AT_PHDR`：主程序 Program Header 的地址；
- `AT_BASE`：动态链接器的装载基址；
- `AT_RANDOM`：随机数据地址，可用于栈保护等；
- `AT_SYSINFO_EHDR`：vDSO 的 ELF 头地址。

内核不会调用 `main`。它只负责建立满足 ABI 的初始机器状态，并跳到 ELF 入口。

## Shebang：另一种可执行文件格式

`#!` 不是 shell 自己实现的语法，而是 Linux 内核 `fs/binfmt_script.c` 支持的一种加载格式。

假设脚本 `S` 的第一行是：

```text
#!A B C
```

在 Linux 上执行 `S x y`，可以近似理解为内核改为执行：

```text
execve("A", ["A", "B C", "S", "x", "y"], envp)
```

Linux 通常把解释器路径后的剩余部分作为一个可选参数；其他 Unix 系统的拆分规则可能不同，因此 shebang 中不宜放复杂参数。

这里的脚本解释器和 ELF 的 `PT_INTERP` 都由内核识别，但作用不同：

- shebang 解释器读取并执行脚本文本；
- ELF 解释器是动态链接器，负责装载共享对象和完成运行时重定位。

## 动态链接

动态链接把应用代码和共享库分开。主程序记录依赖哪些共享对象以及哪些引用仍需运行时解析，而不直接包含全部库代码。

构建阶段产生的动态 ELF 通常包含：

- `PT_INTERP`：动态链接器路径；
- `PT_DYNAMIC`：动态链接元数据；
- `DT_NEEDED`：所需共享对象；
- `.dynsym/.dynstr`：动态符号与字符串；
- `.rela.dyn/.rela.plt`：动态重定位；
- GOT/PLT 等间接访问结构。

### 完整启动路径

```text
execve(dynamic_program)
  -> 内核映射主程序的 PT_LOAD
  -> 内核映射 PT_INTERP 指定的动态链接器
  -> PC 指向动态链接器入口
  -> 动态链接器读取主程序的 PT_DYNAMIC
  -> 搜索并映射 DT_NEEDED 指定的共享对象
  -> 建立依赖图和全局符号查找范围
  -> 处理重定位、TLS 等运行时状态
  -> 运行必要的初始化代码
  -> 跳到主程序 ELF 入口 _start
  -> C runtime 调用 __libc_start_main
  -> main
```

因此动态程序中：

- 主程序通常仍静态包含来自 `crt1.o` 的 `_start`；
- 但 CPU 刚进入用户态时，最先执行的是动态链接器自己的入口；
- 动态链接器完成工作后，才跳到主程序的 `_start`；
- `_start` 再按 libc ABI 进入 `__libc_start_main`，最终调用 `main`。

## `PT_INTERP`：ELF 的动态链接器

`PT_INTERP` 的内容只是一个以 `\0` 结尾的路径字符串，例如 x86-64 上常见：

```text
glibc: /lib64/ld-linux-x86-64.so.2
musl:  /lib/ld-musl-x86_64.so.1
```

可以用以下命令查看：

```bash
readelf -l ./a.out | grep interpreter
```

内核不会根据主程序的符号推断该用哪个动态链接器，而是按这个路径打开文件。路径不存在时，即使主程序文件本身存在，`execve` 仍可能返回 `ENOENT`，shell 表现为“No such file or directory”。

### 为什么 glibc 和 musl 的解释器不同

解释器路径不同不是单纯改了文件名，而是说明程序属于不同的 libc 运行时生态：

- glibc 动态程序依赖 glibc 的 loader、`libc.so.6`、符号版本和 GNU ABI 扩展；
- musl 动态程序依赖 musl 的 loader/libc 组织方式和对应 ABI 实现；
- 两者在库名、符号版本、TLS、启动协议、库搜索和若干扩展行为上存在差异。

动态链接器必须和它加载的 libc 及共享对象相互配合。把 glibc 程序的 `PT_INTERP` 机械改成 musl loader，或者反过来，通常会因缺少库、符号版本不匹配、重定位或 ABI 不兼容而失败。

讲义中修改解释器文件名后再建立软链接能够恢复运行，只说明：

```text
内核按 PT_INTERP 字符串寻找文件
```

软链接最终仍指向原来兼容的动态链接器，并不能证明不同 loader 可以互换。

### 解释器不同带来的实际影响

- **可启动性**：目标系统必须存在该路径以及兼容的依赖库。
- **容器兼容**：Alpine 常用 musl；许多预编译 Linux 软件默认面向 glibc，直接复制进去可能无法运行。
- **ABI 兼容**：同名 C API 不代表二进制实现细节完全兼容。
- **行为差异**：DNS/NSS、locale、线程、扩展接口、错误处理等可能不同。
- **调试工具链**：`ldd`、符号版本、调试符号和 loader 选项也随实现变化。

纯静态链接的 ELF 通常没有 `PT_INTERP`，因而不会遇到动态解释器路径缺失的问题。

## 共享库为什么能节省内存

同一个 `.so` 会在每个进程中获得各自的虚拟地址区间，但这些虚拟页可以映射到相同的物理文件页：

```text
进程 A 虚拟页 ----\
                   -> 同一个 libc.so 只读物理页
进程 B 虚拟页 ----/
```

需要精确区分：

- 代码和只读数据页通常是文件支持、不可写的，可以通过页缓存跨进程共享；
- 这并不要求用户语义上的 `MAP_SHARED`，`MAP_PRIVATE` 的干净只读文件页同样可以共享物理页；
- `.data` 等可写状态在每个进程中必须逻辑独立，初始时可以共享底层文件页，写入后通过 Copy-on-Write 得到私有页；
- GOT 等运行时会被修改的页通常也是每进程私有的；
- 每个进程仍有自己的页表项和虚拟地址，ASLR 可以让同一库出现在不同虚拟地址。

因此“动态链接在内存中只有一个副本”只能用于描述可共享的干净文件页，不能理解为共享库的全部代码、数据和运行时状态在系统中只有一份。

## PIC：为什么共享库要位置无关

ASLR 和不同进程的地址布局意味着同一个 `.so` 不能假设自己总被加载到固定虚拟地址。

位置无关代码（PIC）的核心约束是：

```text
代码不依赖固定装载基址，换一个地址仍能执行
```

常见方法包括：

- 使用 PC/RIP-relative 寻址访问本模块附近的代码和只读数据；
- 通过 GOT 访问装载时才能确定地址的外部数据；
- 通过 PLT/GOT 调用可能被动态解析或符号抢占的外部函数。

PIC 还避免动态链接器修改共享库的只读代码页。若必须修改 `.text` 中的绝对地址，会产生 text relocation，使代码页变脏并破坏跨进程共享，也与 W^X 和 RELRO 等保护机制冲突。

## GOT 与 PLT

动态链接把部分“填地址”的工作推迟到运行时。问题是：一条机器指令的位数和寻址范围有限，而且共享对象的最终装载地址未知。

### GOT：存放运行时地址

Global Offset Table 是一张位于数据区的地址表。代码使用相对寻址先找到 GOT 项，再从表项中取出目标的真实地址：

```asm
mov external_object@GOTPCREL(%rip), %rax
movl $1, (%rax)
```

动态链接器在启动重定位阶段把外部对象的实际地址写入 GOT。

### PLT：外部函数调用跳板

Procedure Linkage Table 是一组短小的代码桩。典型外部调用路径是：

```text
call printf@plt
  -> PLT 桩读取对应 GOT 项
  -> 跳到 printf 的真实地址
```

GOT 回答“真实地址存在哪里”，PLT 提供“如何通过这个地址完成函数调用”的跳板。

### Lazy Binding

在延迟绑定模式下：

1. `printf` 第一次被调用时，其 GOT 项尚未指向真正的 `printf`；
2. PLT 把控制权交给动态链接器的解析例程；
3. 动态链接器查找符号并把真实地址写入 GOT；
4. 本次及后续调用跳到真实函数。

设置：

```bash
LD_BIND_NOW=1 ./a.out
```

可以要求启动时完成这类函数重定位。现代系统也可能因安全、构建选项或实现策略默认采用立即绑定。

动态调用的额外间接层可能影响分支预测、优化和调用开销，但是否构成性能瓶颈必须结合调用频率、缓存行为和总体 workload 测量。共享库内部已知不可被抢占的符号可以通过 hidden visibility 等方式直接绑定。

## 动态符号解析与 `LD_PRELOAD`

动态链接器为未定义符号在一个有顺序的查找范围中寻找定义。`LD_PRELOAD` 可以在普通依赖之前加入共享对象，因此常用于符号插桩：

```bash
LD_PRELOAD=./libtrace.so ./program
```

`libtrace.so` 若导出兼容的 `malloc`，程序对可抢占 `malloc` 的引用就可能绑定到它，而不是原实现。

典型用途包括：

- 跟踪 `malloc/free`；
- 记录文件和网络调用；
- 替换时间函数，实现测试用虚拟时间；
- 替换随机函数，复现实验；
- 在不修改目标程序的情况下做性能分析。

但“同名符号一定覆盖”过于绝对。以下情况可能绕过 preload：

- 程序是静态链接的；
- 调用被编译器内联；
- 符号使用 hidden/protected visibility 或本地直接绑定；
- 程序直接发系统调用，没有经过被 hook 的 libc 包装；
- setuid/setgid 等 secure-execution 模式会限制相关环境变量；
- 函数签名、ABI 或递归处理不正确会导致崩溃。

hook 函数若需要调用原实现，通常使用：

```c
dlsym(RTLD_NEXT, "malloc");
```

但还必须处理初始化递归、线程安全和重入问题。

## 从入口到 `main`

### 动态链接程序

```text
execve
  -> 内核加载主 ELF 和 PT_INTERP
  -> ld-linux/ld-musl 的入口
  -> 加载 .so、符号解析、动态重定位
  -> 主程序 _start
  -> __libc_start_main
  -> main
  -> exit
```

严格来说，动态链接器可能在跳到主程序 `_start` 之前完成部分初始化，但 C/C++ 构造器通常由后续 runtime 启动流程按 ABI 约定调用。关键不变量是：`main` 从来不是 ELF 被内核直接跳入的入口。

## 观察与验证

### 查看文件类型和 ELF 头

```bash
file ./a.out
hexdump -C ./a.out | head
readelf -h ./a.out
```

### 查看加载视图

```bash
readelf -l ./a.out
```

重点观察：

- `LOAD`；
- `INTERP`；
- `DYNAMIC`；
- Section to Segment mapping；
- 各段的 `R/W/E` 权限。

### 查看链接视图

```bash
readelf -S ./a.out
readelf -s ./a.out
readelf -r ./a.out
objdump -dr ./a.o
```

`objdump -dr` 可以把反汇编和重定位项放在一起，最适合观察 `call foo` 的占位数是如何等待链接器修补的。

### 查看动态依赖和加载过程

```bash
readelf -d ./a.out
ldd ./a.out
LD_DEBUG=libs,reloc ./a.out
LD_SHOW_AUXV=1 ./a.out
```

对不可信程序不要随意运行 `ldd`；优先使用 `readelf -d` 静态检查其 `DT_NEEDED`。

### 查看运行时映射

```bash
cat /proc/$PID/maps
pmap $PID
lsof /path/to/libfoo.so
```

可以观察：

- 主程序和共享库的虚拟地址；
- ASLR；
- `r-xp/r--p/rw-p` 权限；
- `[stack]`、`[heap]`、`[vvar]`、`[vdso]`；
- 同一共享库被多个进程映射。

### 对比静态和动态 ELF

```bash
gcc hello.c -o hello-dynamic
gcc hello.c -static -o hello-static

file hello-dynamic hello-static
readelf -l hello-dynamic | grep interpreter
readelf -l hello-static  | grep interpreter
ls -lh hello-dynamic hello-static
```

预期现象：

- 动态版本存在 `PT_INTERP`，静态版本通常没有；
- 静态版本通常明显更大；
- `ldd hello-static` 通常报告它不是动态可执行文件；
- 两者的 program headers 和运行时 maps 明显不同。

## 本讲要点

1. 可执行文件是一份进程初始状态的描述，不只是机器指令集合。
2. [Linking.md](</notes/csapp/notes/7-linking/>) 负责静态链接、ELF section、符号解析和重定位细节；这里主要补 loader/process 视角。
3. 加载器根据 Program Header 建立地址空间、初始栈和入口机器状态。
4. Section 服务链接视图，Segment 服务加载视图，不能混为一谈。
5. `PT_INTERP` 指向用户态动态链接器；动态 ELF 最先执行 loader 的入口，而不是主程序 `_start`。
6. glibc 与 musl 的解释器属于不同运行时生态，不能靠修改路径随意互换。
7. PIC 使同一共享库可以装载到不同地址；GOT 保存运行时地址，PLT 为外部函数调用提供跳板。
8. 共享的是 `.so` 的干净文件页，不是所有进程状态；可写页仍需保持进程隔离。
9. `LD_PRELOAD` 利用动态符号解析实现非侵入式插桩，但受可见性、内联、静态链接和安全模式等约束。

