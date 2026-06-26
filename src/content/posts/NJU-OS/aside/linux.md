---
title: "(Aside)从零开始构建 Linux 应用世界"
published: 2026-06-22
updated: 2026-06-11
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / aside"
description: "(Aside)从零开始构建 Linux 应用世界"
draft: false
sourceLink: ""
---
# Lecture 12 Aside: 从零开始构建 Linux 应用世界

## 1. 本课定位与三条线索

这一讲是虚拟化部分的收官，不是新增零散考点，而是把前面学过的系统调用串成一条完整故事线：

`CPU Reset -> Firmware -> Bootloader -> Kernel -> 第一个进程 -> 真实 Linux 用户态 -> 应用生态`

核心 message：

`操作系统给应用程序提供对象和 API；前面讲过的进程、文件描述符、libc、链接加载，都在解释这套 API 怎么工作。`

虚拟化部分的四块拼图：

- 进程与地址空间
- 文件描述符与内核对象
- C 标准库与系统调用封装
- 链接、加载与 `execve`

本课三条线索：

- 历史线：`UNIX -> MINIX -> Linux`
- 动手线：`initramfs -> 最小 init -> BusyBox -> switch_root -> 可用 Linux`
- 生态线：`内核 API -> 工具链/运行库 -> 包管理 -> 应用生态`

---

## 2. UNIX、fork 与 MINIX

最早的 UNIX 甚至没有 `fork`。shell 运行命令的方式很原始：

1. 关闭原有文件
2. 把 `fd 0/1` 接回终端
3. 把自己从内存卸掉
4. 加载目标程序执行
5. 程序退出后再把 shell 重新加载回来

也就是说，同一时刻往往只有一个用户态程序在跑。后来的 `fork` 之所以早期能用很小的代码实现，是因为当时的进程抽象本来就很薄，只涉及少量段边界、寄存器状态和内核 bookkeeping。

MINIX 的意义在于，它把操作系统做成了可完整阅读、修改和教学的系统：

- MINIX 1：UNIX v7 兼容
- MINIX 2：POSIX 兼容
- MINIX 3：更成熟，仍在维护

它也是 Linus 早期写 Linux 的直接土壤。

MINIX 代表的还是微内核路线：

- 内核尽量小
- 文件系统、驱动、内存管理尽量放到用户态服务
- 彼此靠消息传递协作

它的问题不是思想错误，而是当年的 IPC 和调度切换开销太大，所以“过早正确”。

---

## 3. Linux 的诞生与时代问题

1991 年 Linus 发出那封 “just a hobby” 邮件时，Linux 还只是一个给 386 机器写的、替代 MINIX 的 UNIX-like 系统。早期 Linux 并不是凭空出现，而是站在已有土壤上长出来的：

- 依赖 MINIX 的环境
- 依赖 GNU 的编译器和工具
- 依赖已有的用户态生态

Tanenbaum-Linus 论战表面上是“微内核 vs 宏内核”，本质上是：

- Tanenbaum 强调结构上的先进与优雅
- Linus 强调当下硬件、性能和可用性

后来的历史说明，技术方向不只看“概念是否先进”，还要看它是否处在合适的硬件和时代上。

课里插入 AI 的意思也类似：今天从 0 到 0.1 做出系统原型，比过去容易得多。重点不是等机会，而是看懂机制、做出最小版本、在可观测现实里迭代。

---

## 4. 初始状态与启动链

这节课从“初始状态”重新串起前面的知识。

进程的初始状态由 `execve(path, argv, envp)` 决定：

- 建新地址空间
- 装入 ELF 与解释器
- 准备初始栈 `argc/argv/envp/auxv`
- 让 PC 跳到入口

计算机系统的初始状态则是：

- CPU Reset
- Firmware 接管
- Bootloader 加载内核
- 内核最终启动第一个用户态进程

所以问题落到一句话：

`第一个进程住在哪里，它怎么把整个 Linux 世界长出来？`

后半段的主线就是：

`Firmware -> Bootloader -> Kernel -> initramfs:/init -> switch_root/pivot_root -> 真实根 -> /sbin/init -> systemd services`

这里要明确区分两个世界：

- 早期启动世界：`initramfs`
- 发行版世界：真实根文件系统上的用户态

---

## 5. initramfs 与第一个进程

`initramfs` 是启动早期的临时根文件系统，不是平时看到的完整 Linux 世界。

它存在是因为内核刚起来时，常常还不能立刻访问真正的根分区，这时可能还缺：

- 块设备驱动
- 文件系统驱动
- LVM/RAID/加密卷支持
- 找根分区的脚本和配置

所以它的任务很明确：

1. 加载剩余驱动
2. 找到真实根分区
3. 挂载真实根
4. 切换到真实根

最早的第一个用户态进程通常不是 `systemd`，而是 `initramfs` 里的 `/init`。它可以通过内核命令行显式指定：

`rdinit=/init`

这个 `/init` 可以是 ELF，也可以是 shell 脚本。也就是说，“第一个进程”不是魔法，而是可控状态。

---

## 6. 最小 init 与 PID 1 panic

最小实验的目标，是证明：

`Linux 加载的第一个用户态进程，可以由我们自己构造。`

做法是写一个只会：

- `write`
- `exit`

的最小程序，把它打包进 `initramfs`，再用 `rdinit=/init` 让内核把它当作第一个进程运行。

如果这个最小 `/init` 直接退出，内核会 panic：

`Attempted to kill init!`

原因不是“它权限高”，而是：

- `PID 1` 是用户态世界的根
- 它承担进程树和系统服务的生存结构
- 它死了，内核无法把系统视为仍然正常运行

这里对应的不变式是：

`内核一旦把控制权交给用户态，用户态根必须持续存在。`

---

## 7. BusyBox、initrd 与救援 shell

真实的 `initramfs` 通常不是只放一个二进制，而是放一套最小用户态环境。`BusyBox` 的作用就是一次性提供大量基础命令，例如：

- `sh`
- `mount`
- `switch_root`
- `ls/cp/cat`
- 各种恢复和诊断工具

所以 `initramfs` 虽然小，但已经是一个真正能跑脚本、能挂文件系统、能排错的用户态世界。

把真实机器的 `initrd` 解开后，会看到它像一个微型 Linux：

- `/init` 启动脚本
- BusyBox 命令集
- 文件系统和设备驱动模块
- 键盘、字体、firmware 等启动资源

这说明开机早期并不是“只有一个内核”，而是已经有一个缩小版用户态环境。

开机失败时掉进 BusyBox shell，通常不表示“内核死了”，而表示：

- 内核起来了
- `initramfs` 起来了
- 但从临时根切到真实根这一步失败了

常见原因：

- 根分区找不到
- `fstab` 写错
- 磁盘或文件系统损坏
- 加密卷没解锁

所以这个 shell 本质上是早期启动阶段的故障恢复入口。

---

## 8. switch_root、systemd 与完整 init

这节课最关键的系统调用/工具节点是：

- `pivot_root(new_root, put_old)`
- `switch_root`

它们做的不是“再启动一个系统”，而是：

`把当前进程看到的根目录，从 initramfs 切换到真实根文件系统。`

典型流程：

1. `mount` 真实根到 `/new_root`
2. `pivot_root` 或 `switch_root`
3. `exec /sbin/init`

`systemd` 通常最终是 `PID 1`，但它不是最早那个进程。真实过程是：

- 早期 `PID 1` 是 `initramfs` 里的 `/init`
- 切到真实根后，它执行 `exec /sbin/init`
- `exec` 替换程序映像，但不改变 PID

所以看起来像“systemd 一直都是 PID 1”，其实是 PID 被继承了。

一份能工作的早期 `init` 脚本，通常会依次做这些事：

- 展开 BusyBox 命令链接
- 挂载 `proc`、`sysfs`、`dev`
- `insmod` 加载块设备/网卡驱动
- `mknod` 创建设备节点
- 提供交互 shell 或调试入口
- 挂载真实根
- `switch_root`

这就是“把 Linux 世界点亮”的最小施工流程。

---

## 9. 从最小 Linux 到可用 Linux

从一个空的 `initramfs` 出发，逐步补齐：

- 命令行工具
- 驱动
- `/dev` 设备节点
- `proc/sysfs`
- 真实根
- 第二段 init
- 网络配置
- `httpd`

最终可以让宿主机浏览器真的访问到虚拟机里的服务。

这一段想证明的是：

`一个可用的 Linux 世界，本质上就是一串对象创建和系统调用拼起来的结果。`

---

## 10. 狭义操作系统、广义操作系统与生态

狭义的 OS 是：

- 对象
- API

也就是：

- `fork/execve/waitpid`
- `open/read/write/close`
- `mount/mknod/stat/socket`
- `mmap/munmap/mprotect`

广义的 OS 还包括：

- 运行库：`libc`、`libm`、`libstdc++`
- 工具链：`gcc`、`clang`、`binutils`、`make`
- 包管理：`apt`、`rpm`、`npm`、`pip`
- 系统管理与应用分发工具

“有没有国产操作系统”这类问题，真正难点不在内核，而在生态：

- 运行库
- 编译工具链
- 包管理
- 应用分发
- 开发者社区
- 长期维护流程

所以：

`一张系统调用表不等于一个操作系统；真正让 Linux 无处不在的是围绕它长出来的整座生态。`

---

## 11. 本课结论

- 前面的进程、文件描述符、libc、链接加载，最终都汇到“OS 提供对象和 API”这一句上。
- Linux 启动链可以拆得非常具体：`Reset -> Firmware -> Bootloader -> Kernel -> initramfs -> /init -> switch_root -> 真实根 -> systemd`。
- `initramfs` 是临时根，不是最终世界；最早的 `PID 1` 是它里面的 `/init`。
- `systemd` 是后来的 `exec` 结果，因此保留了 `PID 1` 身份。
- BusyBox shell 是早期启动失败时的恢复入口，不等于内核已经崩掉。
- 从最小 init 到联网的 Linux，整个过程都只是系统调用和内核对象的组合，没有魔法。
- 操作系统真正难的往往不是“内核能不能跑”，而是“上面的生态能不能持续支撑应用世界”。

