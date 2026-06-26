---
title: "Lab 2: pstree"
published: 2026-06-22
updated: 2026-06-11
category: "NJU OS"
tags: ["NJU OS","Lab"]
series: "NJU OS / lab / lab2"
description: "Lab 2: pstree"
draft: false
sourceLink: ""
---
C++写太多不会写C了，没了stl写出来的代码巨丑无比（

[M2: 打印进程树 (pstree)](https://jyywiki.cn/OS/2026/labs/M2.md)

简化题意：实现一个类似于pstree的进程树打印工具

# Lab 2: `pstree` 与 `/proc` 接口笔记

## 1.  `/proc` 接口

- `/proc` 不是普通磁盘目录，而是 `procfs` 的挂载点。
- 它对用户态表现成“可以 `open/read/...` 的文件和目录”，但内容往往是内核在读取时按当前状态动态生成的。
- 因此 `/proc/<pid>/...` 看到的是“某个进程当前状态的投影”，不是一份持久化文件。

遍历 `/proc` 下名字为纯数字的目录，可以得到当前时刻“可见的所有进程 pid 候选集合”。

注意这不是原子快照，可能在看到了尝试读取时，文件不存在。

`/proc/<pid>/comm` 暴露进程名，读取结果是一行字符串。

 `/proc/<pid>/stat` 中，第四个字段给出了父进程信息。

## 2.做法

对于每个进程都向父进程连接一条边，然后从根开始dfs输出即可。

注意根的id是0,systemd只是第一个用户态进程，事实上很多内核线程挂在 `2` 下面。

## 3. 这次实现里踩过的坑

- 把 `const int MAXN` 当成文件作用域数组大小，实际上在 C 里不算这种用途下的编译期常量
- 只从 `PID 1` 开始 DFS，导致漏掉 `PID 2` 及其后代
- 忽略 `/proc` 的动态变化，读失败后仍继续使用未初始化数据

