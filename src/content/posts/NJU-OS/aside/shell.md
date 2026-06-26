---
title: "(Aside) - 终端和 UNIX Shell"
published: 2026-06-22
updated: 2026-06-05
category: "NJU OS"
tags: ["NJU OS"]
series: "NJU OS / aside"
description: "(Aside) - 终端和 UNIX Shell"
draft: false
sourceLink: ""
---
# Shell / Terminal Notes

## 1. 第 8 讲的主线

这一讲讲的不是零散名词，而是一条完整的人机交互链：

`人 -> 终端 -> 操作系统 -> shell -> 其他程序`

- 终端提供字符交互入口
- 操作系统在这条字符流上附加控制语义
- shell 把系统调用组织成一门命令语言

---

## 2. 几个容易混的名词

- `tty`: 终端接口/设备的总称，历史上来自 teletypewriter
- `pty`: pseudo terminal，软件实现出来的伪终端机制
- `pts`: 某个 pty 的 slave 设备实例，例如 `/dev/pts/3`
- `terminal emulator`: 终端模拟器，是用户看见的窗口程序
- `shell`: 运行在终端里的命令解释器，如 `sh`、`bash`、`zsh`

最直白的关系：

`你 -> 终端模拟器 -> pty master <-> pty slave(/dev/pts/N) -> shell -> 其他程序`

其中：

- 真正执行命令的是 shell 和它 fork/exec 出来的子进程
- terminal emulator 不执行命令，它只负责收输入、显示输出

---

## 3. 终端、shell、bash 的区别

- 终端模拟器：窗口和交互界面
- shell：命令解释器这一类程序
- bash：shell 的一种具体实现

所以平时说“打开 terminal”，说的是外层交互环境；里面默认跑着一个 shell。

---

## 4. 用户为什么总是从终端进入系统

终端是人机交互的第一个设备。

- 本地登录：`内核 -> init -> getty`
- 远程登录：`sshd -> fork -> openpty`

这些程序会先做几件事：

- 分配一个终端
- 让 `stdin/stdout/stderr` 指向这个终端
- 建立一个 `session`
- 把这个 session 关联到 controlling tty

`login` 的作用主要是认证和进入用户环境；严格说，session 往往不是 `login` 创建的，而是它继承的。

---

## 5. 终端到底做了什么

终端本身可以粗略看成“字符输入输出前端”：

- 把按键变成字节流送给操作系统
- 把程序输出的字节流显示出来

但终端不是直接把字符送到某个程序的 `stdin`。更准确地说：

- 终端把字符送进内核的 tty 子系统
- 内核再决定把这些字符交给哪个前台进程

所以复杂的交互语义主要不在终端模拟器里，而在操作系统的 tty 机制里。

---

## 6. Ctrl-C / Ctrl-Z 为什么会“有特殊含义”

终端自己只负责传字符。

- `Ctrl-C` 常被编码成字节 `0x03`
- `Ctrl-D` 常被编码成字节 `0x04`

这些字节有没有特殊含义，取决于内核保存的这条 tty/pts 的状态。

也就是说：

- 按下 `Ctrl-C`
- 终端把它送进 tty 子系统
- 操作系统根据当前 tty 配置，把它解释成“给前台进程组发 `SIGINT`”

所以 `Ctrl-C` 不是按键自己会杀进程，而是内核在当前终端语义下把这个字符解释成了中断请求。

`stty -a` 显示的就是当前 tty 的这组状态。

---

## 7. 为什么 vim 通常不会被 Ctrl-C 杀掉

因为 `vim` 运行时会修改终端属性，接管键盘输入。

所以：

- shell 里，`Ctrl-C` 往往会被 tty 解释成 `SIGINT`
- vim 里，输入往往先被 vim 自己读走并处理

因此 `Ctrl-C` 在不同程序里的效果不一样，本质上取决于当前 tty 状态和程序自己的处理方式。

---

## 8. session 和 process group 在管什么

这两个分组解决的是不同层次的问题。

### session

`session` 是更大的“登录会话”分组：

- 一整组共享同一个登录上下文的进程
- 通常关联一个 controlling terminal

可以理解成“这一整轮终端交互环境”。

### process group

`process group` 是更小的“作业控制”分组：

- 当前一起工作的那一拨进程
- 例如一条 pipeline 里的多个进程

操作系统收到 `Ctrl-C` 时，针对的是前台进程组，不是整个 session。

所以：

- session 管“这一大片是谁的终端会话”
- process group 管“当前这一拨进程该一起暂停/继续/收信号”

---

## 9. Job Control 是什么

job control 可以看成“终端里的窗口管理”。

- 前台只能有一个 process group
- `Ctrl-Z` 把前台作业暂停
- `fg/bg` 在前后台之间切换作业

它的核心问题不是“怎么运行程序”，而是“多个进程组共享一个终端时，谁现在算前台”。

---

## 10. shell 的本质

shell 不只是“启动程序的工具”，而是一门极简编程语言。

它做的事是：

- 读入一行命令
- 做文本层面的展开和组合
- 把命令翻译成系统调用序列

典型地会用到：

- `open`
- `dup/dup2`
- `pipe`
- `fork`
- `execve`
- `waitpid`

所以重定向、管道、后台运行，本质上都是文件描述符和进程控制的编排。

一句话：

**shell 是 kernel 外面的壳，它把系统调用组织成了用户可直接编程的命令语言。**

