---
title: "Lab 4: crepl"
published: 2026-06-22
updated: 2026-06-12
category: "NJU OS"
tags: ["NJU OS","Lab"]
series: "NJU OS / lab / lab4"
description: "Lab 4: crepl"
draft: false
sourceLink: ""
---
[M4: C Read-Eval-Print-Loop (crepl)](https://jyywiki.cn/OS/2026/labs/M4.md)

简化题意：维护一个小型 C REPL。用户可以先输入函数定义，把它们加入当前进程的符号环境；之后再输入表达式，程序把表达式包装成函数、动态编译、动态装载并执行，输出结果。

# Lab 4: `crepl` 与动态链接接口笔记

## 1. 这题真正要做的事

这题表面上像“解释器”，但实现上并不是自己解析并执行 C 表达式，而是把 `gcc` 和动态链接器当作后端：

1. 用户输入函数定义。
2. 程序生成临时 `.c` 文件。
3. 调用 `gcc -shared -fPIC` 编译出 `.so`。
4. 用 `dlopen` 把 `.so` 加入当前进程。
5. 用户输入表达式时，再生成一个只包含 wrapper 的临时 `.so`。
6. 用 `dlsym` 找到 wrapper 函数地址并调用，得到表达式值。

所以核心不变式是：

- 已定义函数必须能被后续函数和后续表达式看到。
- 语法错误、未定义符号、编译失败都要被识别出来，而不是默默返回成功。

## 2. 整体运行模型

可以把 `crepl` 理解成“进程内不断扩展的符号环境”：

```text
用户输入函数定义
  -> 生成临时 temp.c
  -> gcc -shared -fPIC temp.c -o tempN.so
  -> dlopen(tempN.so, RTLD_NOW | RTLD_GLOBAL)
  -> 新函数加入当前进程的全局符号环境

用户输入表达式
  -> 生成临时 expr.c
  -> expr.c 中写入历史函数原型 + wrapper
  -> gcc -shared -fPIC expr.c -o exprN.so
  -> dlopen(exprN.so, RTLD_NOW | RTLD_GLOBAL)
  -> dlsym(handle, "expr")
  -> 调用 expr() 得到结果
```

这里有两层“可见性”：

- 编译期可见性：新 `.c` 文件里要有旧函数的声明，不然编译器不知道 `test_func()` 的类型。
- 运行期可见性：旧函数所在 `.so` 必须已经被 `dlopen(..., RTLD_GLOBAL)` 加入全局环境，不然新库装载时找不到符号。

## 3. `compile_and_load_function()` 的过程

`compile_and_load_function()` 的任务不是“存字符串”，而是把这段函数定义真正变成当前进程里可用的符号。

典型过程：

1. 打开临时 `temp.c`。
2. 把历史函数原型写进去。
3. 把本次函数定义写进去。
4. `fork` 出子进程。
5. 子进程 `execve("/usr/bin/gcc", argv, environ)` 执行：
   ```bash
   gcc -shared -fPIC temp.c -o tempN.so
   ```
6. 父进程 `waitpid` 等编译结束。
7. 若编译成功，则 `dlopen(tempN.so, RTLD_NOW | RTLD_GLOBAL)`。
8. 成功后从函数定义里提取函数原型，保存给后续代码生成使用。

这里“保存函数原型”不是为了调用，而是为了后面生成新 `.c` 文件时补声明，例如：

```c
int f(int x);
int g() { return f(42); }
```

## 4. `evaluate_expression()` 的过程

表达式不能直接 `dlsym`，因为 `dlsym` 找的是符号地址，而不是“裸表达式”。  
所以表达式必须先被包装成一个真正的函数。

例如用户输入：

```c
test_eval() / 2
```

需要临时生成类似：

```c
int test_eval();
int expr() { return test_eval() / 2; }
```

然后流程与定义函数类似：

1. 写临时 `expr.c`。
2. `gcc -shared -fPIC expr.c -o exprN.so`。
3. `dlopen(exprN.so, RTLD_NOW | RTLD_GLOBAL)`。
4. `dlsym(handle, "expr")` 得到函数指针。
5. 调用 `expr()`，把返回值写进 `*result`。

这里 wrapper 最关键的一点是：必须 `return expression;`，否则函数返回值未定义。

## 5. 关键接口

## 5.1 装载共享库：`dlopen`

```c
void *dlopen(const char *filename, int flags);
```

本实验里最重要的 flags：

- `RTLD_NOW`：现在就解析符号，失败立刻暴露。
- `RTLD_GLOBAL`：把这个库导出的符号放进全局可见环境，供后续新库使用。

如果前面定义了：

```c
int f() { return 42; }
```

后面定义：

```c
int g() { return f() + 1; }
```

那么 `f` 所在的库必须是 `RTLD_GLOBAL` 加载的，否则装载 `g` 时可能找不到 `f`。

## 5.2 查找 wrapper：`dlsym`

```c
void *dlsym(void *handle, const char *symbol);
```

用法：

```c
int (*fun)() = dlsym(handle, "expr");
```

这里 `expr` 必须是你生成的 wrapper 名字。  
`dlsym` 找到的是符号地址，所以表达式必须先包成函数。

## 5.3 错误信息：`dlerror`

```c
char *dlerror(void);
```

当 `dlopen` 或 `dlsym` 失败时，它能给出“未定义符号”“库打不开”等人类可读错误信息。  
调动态链接问题时很有用。

## 5.4 行编辑和历史：`readline` / `add_history`

```c
char *readline(const char *prompt);
void add_history(const char *line);
```

作用：

- `readline` 提供可编辑输入行。
- `add_history` 把输入加入历史，之后上下键才能翻。

注意：

- 只有 `readline()` 不够；不调用 `add_history()`，上下键没有历史可翻。
- 链接时还需要 `-lreadline`。

## 6. Makefile 与链接

本实验的主程序本身要链接：

- `-ldl`：为了 `dlopen` / `dlsym`
- `-lreadline`：为了 `readline` / `add_history`

它们本质上属于链接选项，应放进 `LDFLAGS`，而不是混在只管编译参数的 `CFLAGS` 里。

## 7. 本地测试思路

这题的本地验证可以分三层：

1. 能否编译 `crepl` 本身：
   ```bash
   make clean
   make
   ```

2. 手动 REPL 冒烟：
   ```c
   int f() { return 42; }
   f()
   21 + 21
   int g() { return f() / 2; }
   g()
   undefined_function()
   21 +
   ```

3. 运行 `tests.c` 里的 `UnitTest`
   - 这些测试会直接调用 `compile_and_load_function()` 和 `evaluate_expression()`。
   - 如果 `main()` 是无限 REPL，测试触发方式要额外处理，否则程序不会自然退出。

## 8. 这次实现里踩过的坑

- 把所有动态库都输出到同一个固定路径，如 `/tmp/tmp.so` 或 `/tmp/expr.so`，导致 `dlopen` 复用旧对象，新代码没有真正装入。
- 把共享库路径写成 `.c`，把源码文件和 `.so` 混淆。
- `execve("usr/bin/gcc", ...)` 少了开头的 `/`；`execve` 不帮你查 `PATH`。
- 子进程 `execve` 失败后没有立刻 `_exit(...)`，导致失败路径被误当成功路径继续执行。
- 写完临时 `.c` 后没 `fclose` 就编译，结果 `gcc` 读到半截文件。
- 只保存了旧函数的存在，却没在新生成的 `.c` 文件里写旧函数声明，导致编译期找不到 `test_func()` 的类型。
- 误以为“之前已经 `dlopen` 过函数库”就不需要声明；实际上编译期声明和运行期符号解析是两回事。
- 表达式 wrapper 写成 `int expr(){ expression; }`，忘了 `return`，函数返回值未定义。
- `dlsym` 要找的是函数名，不是裸表达式；所以必须显式生成 `expr()` 之类的 wrapper。
- 在字符串拼接时只覆盖 `_buffer`，导致前序函数原型没真的写进临时源码。
- 以为用了 `readline` 就天然支持上下键历史；实际上还要 `add_history()`。
- 头文件加上了 `readline`，但 Makefile 没加 `-lreadline`，最终报 `undefined reference to readline`。

## 9. 总结

- 这题的本质不是“自己实现 C 解释器”，而是“把编译器和动态链接器接成一个 REPL”。
- `gcc -shared -fPIC` 负责把输入代码变成共享对象。
- `dlopen(..., RTLD_NOW | RTLD_GLOBAL)` 负责把函数定义累积进当前进程的符号环境。
- `dlsym` 负责从表达式 wrapper 中找到真正可调用的函数入口。
- 编译期声明和运行期符号可见性必须同时满足，才能让“后定义代码调用先定义函数”稳定成立。

