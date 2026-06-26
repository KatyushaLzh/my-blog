---
title: "Lab 1:labyrinth"
published: 2026-06-22
updated: 2026-06-03
category: "NJU OS"
tags: ["NJU OS","Lab"]
series: "NJU OS / lab / lab1"
description: "Lab 1:labyrinth"
draft: false
sourceLink: ""
---
以下内容均由codex生成，代码由codex调试，codex我们喜欢你😍

[M1: 迷宫游戏 (labyrinth)](https://jyywiki.cn/OS/2026/labs/M1.md)

简要题意：补全一个迷宫游戏的后端，这个后端由前端使用命令行的形式调用

# Lab 1: `getopt_long` 与这次调试踩坑总结

## 1. `getopt_long` 是做什么的

`getopt_long` 用来解析命令行参数，把

```bash
./labyrinth --map test.map --player 1 --move right
```

这种 `argv` 序列解析成“选项 + 选项参数”的结构，避免手写一堆 `strcmp(argv[i], "...")`。

常见调用骨架：

```c
static struct option long_options[] = {
    {"map", required_argument, 0, 'm'},
    {"player", required_argument, 0, 'p'},
    {"move", required_argument, 0, 'M'},
    {"version", no_argument, 0, 'v'},
    {0, 0, 0, 0}
};

int opt;
while ((opt = getopt_long(argc, argv, "", long_options, NULL)) != -1) {
    switch (opt) {
        case 'm': map = optarg; break;
        case 'p': player = optarg; break;
        case 'M': move = optarg; break;
        case 'v': version = true; break;
        case '?': return 1;
    }
}
```

## 2. `getopt_long` 每个参数的意义

函数原型：

```c
int getopt_long(int argc, char * const argv[],
                const char *optstring,
                const struct option *longopts,
                int *longindex);
```

- `argc`
  命令行参数个数。
- `argv`
  命令行参数数组。
- `optstring`
  短选项规则表，例如 `"m:p:v"` 表示 `-m` 和 `-p` 需要参数，`-v` 不需要参数。
  如果只想用长选项，可以传 `""`。
- `longopts`
  长选项描述表，也就是 `struct option[]`。
- `longindex`
  如果不为 `NULL`，会写入当前匹配到的是 `longopts` 的第几项。大多数时候可以传 `NULL`。

## 3. `struct option` 的四个字段

```c
{"map", required_argument, 0, 'm'}
```

- 第 1 项 `name`
  长选项名字，对应 `--map`。
- 第 2 项 `has_arg`
  参数模式：
  - `no_argument`
  - `required_argument`
  - `optional_argument`
- 第 3 项 `flag`
  常用时直接写 `0` 或 `NULL`。
- 第 4 项 `val`
  匹配成功时 `getopt_long` 返回的值，这里返回 `'m'`。

最后必须有一个终止项：

```c
{0, 0, 0, 0}
```

否则解析器不知道选项表在哪里结束，属于未定义行为。

## 4. 常用全局变量

- `optarg`
  当前选项对应的参数字符串，例如 `--map test.map` 时，处理 `case 'm'` 时 `optarg == "test.map"`。
- `optind`
  下一个待处理参数在 `argv` 中的下标。解析结束后，如果 `optind != argc`，通常说明还有未消费的多余参数。
- `optopt`
  出错时记录相关选项。
- `opterr`
  是否让库自动打印错误信息。很多题目里会设成 `0`，自己控制报错路径。

## 5. `required_argument` 怎么判断有没有参数

不要靠 `optarg == NULL` 来手搓判断，应该看 `getopt_long` 的返回值。

- 正常匹配到 `--map file`，会返回你设置的 `'m'`，并且 `optarg` 指向 `"file"`。
- 如果缺少必须参数，通常会返回 `'?'`。
- 如果 `optstring` 以 `:` 开头，例如 `":"`，那么“缺少参数”会返回 `':'`，可以和“非法选项”区分开。

典型写法：

```c
while ((opt = getopt_long(argc, argv, ":", long_options, NULL)) != -1) {
    switch (opt) {
        case 'm':
            map = optarg;
            break;
        case ':':
            return 1;  // 缺参数
        case '?':
            return 1;  // 非法选项
    }
}
```

## 6. `getopt_long` 的使用顺序

一条比较稳的主线是：

1. 定义 `long_options`
2. 在 `while (getopt_long(...) != -1)` 里做语法解析
3. 解析结束后检查语义约束
4. 再进入业务逻辑

例如：

1. 先解析出 `map/player/move/version`
2. 再检查：
   - 是否缺 `--map`
   - 是否缺 `--player`
   - `player` 是否是合法数字字符
   - `move` 是否是 `up/down/left/right`
3. 最后再 `loadMap`、`movePlayer`、`saveMap`

这比“边解析边做大量业务操作”更稳，因为语法层和语义层分开了。

## 7. 这次自己踩到的坑

### 7.1 空指针先被用了

原来在 `main` 里先写了：

```c
strlen(player)
```

但如果命令行没有 `--player`，此时 `player == NULL`，会直接段错误。

经验：

- 先判空，再使用。
- 先检查参数是否存在，再做 `strlen`、索引、转换。

### 7.2 误以为 `malloc` 出来就是“可用对象”

原来写了：

```c
Labyrinth *mp = malloc(sizeof(Labyrinth));
```

但没有初始化 `rows/cols/map`，随后 `loadMap` 里直接使用 `labyrinth->rows`，会把垃圾值当合法下标。

经验：

- `malloc` 只保证“给你一块内存”，不保证里面是 0。
- 要么 `calloc`，要么显式 `memset`，要么直接用 `Labyrinth mp = {0};`。

### 7.3 越界判断写成了开区间

原来用了：

```c
0 < row && row < labyrinth->rows
0 < col && col < labyrinth->cols
```

这会错误排除第 0 行、第 0 列，导致边界上的合法位置全被判错。

经验：

- 数组下标合法区间是 `[0, n)`，不是 `(0, n)`。

### 7.4 `isEmptySpace` 没做边界检查

原来直接访问：

```c
labyrinth->map[row][col]
```

如果传入 `(-1, 0)` 或 `(rows, 0)`，就是越界读，单测里正好卡了这个。

经验：

- 所有“带坐标访问数组”的函数，先做边界检查，再读数组。

### 7.5 `switch` 漏写 `break`

`case 'M'` 后漏掉了 `break`，导致合法的 `--move` 也会掉进 `case '?'` 直接报错。

经验：

- `switch` 里每个分支都要显式确认是“故意 fallthrough”还是“必须 break”。

### 7.6 把“只看首字母”当成“解析方向”

原来只看 `direction[0]`，所以 `"diagonal"` 会被当成 `"down"`。

经验：

- 这种有限离散集合，应该做精确字符串匹配。
- `up/down/left/right` 是协议，不是“首字母提示”。

### 7.7 `saveMap` 名字对了，但行为错了

原来 `saveMap` 里：

- 用 `"r"` 打开文件
- 用 `putchar` 往标准输出写

所以它根本没有保存文件。

经验：

- 文件写回要检查三件事：
  - 打开模式是不是 `"w"` 或可写模式
  - 写的是不是目标 `FILE *`
  - 写完是否真的关闭/落盘

### 7.8 混淆了“打印地图”和“报错退出”

原来没有 `--move` 时会打印地图，但返回 `1`。

经验：

- “查询模式”和“错误模式”要分清。
- 能正常打印地图，说明程序成功完成了请求，应该返回 `0`。

### 7.9 忘了测试框架也会影响命令行解析状态

这次本地 `testkit` 会在同一进程里多次调用 `main`，而 `getopt_long` 的状态不是自动清空的。

经验：

- 如果 `main` 可能被测试框架重复调用，要注意 `getopt` 相关全局状态。
- 调试“手工运行正常，测试全挂”时，要怀疑框架调用模型，而不只是怀疑业务逻辑。

## 8. 这次调试后的简化结论

- `getopt_long` 负责“把命令行拆成结构化选项”。
- 判空、合法性检查、业务语义检查，要放在解析之后统一做。
- 任何可能为空、未初始化、越界的对象，都不能先用后查。
- 文件 IO 的正确性要分别检查“打开、读写对象、输出目标、关闭”。
- 段错误大多不是“算法错”，而是对象生命周期、边界、空指针、未初始化状态错。

