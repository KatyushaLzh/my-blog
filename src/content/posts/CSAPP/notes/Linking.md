---
title: "Linking"
published: 2026-06-22
updated: 2026-06-11
category: "CSAPP"
tags: ["CSAPP"]
series: "CSAPP / Linking"
description: "Linking"
draft: false
sourceLink: ""
---
## 链接
将各种代码和数据片段收集并组合成一个单一文件的过程称为链接
通过链接，我们得以将更小的，更易于管理调试的模块组合起来，形成大型程序，同时便于引入共享库，降低编码难度

### 链接概述




![image](./csapp-linking-linking-image-001.jpg)




在shell中，使用`linux>gcc -o prog main.c sum.c` 调用编译器驱动程序，得到两个模块组合形成的程序prog
具体来说，从$.c$文件开始
1.预处理：驱动程序运行C预处理器(cpp)，对源代码进行替换(头文件包含，宏展开，条件编译`#if #ifdef #endif...`)，删除注释得到ASCII码的中间$.i$文件
2.编译：驱动程序运行C编译器(`cc1`)，将$.i$文件进行编译得到$.s$汇编语言文件
3.汇编：驱动程序运行汇编器(as)，将$.s$翻译成机器指令，得到可重定位文件 $.o$
4.链接：驱动程序运行链接器将`.o`文件和必要的系统目标文件组合在一起，生成可执行文件
5.运行：使用`linux>./prog` 调用操作系统中的加载器，将指令和数据加载到内存中，并控制转移到这个程序的开头

### 静态链接

静态链接器由一组可重定位目标文件和命令行参数作为输入，生成完全链接的可执行文件
链接器完成以下两个任务：
1.符号解析：将一个符号和一个符号定义关联起来(是全局变量，静态变量，或者函数)
2.重定位：将每个符号定义与一个内存位置关联起来，然后修改所有对这些符号的引用，使它们指向这个内存位置
x86-64 linux使用可执行可链接格式(Executable and Linkable Format，ELF)作为目标文件的格式，下文以其为例

#### 可重定位目标文件的格式


![image](./csapp-linking-linking-image-002.jpg)


- ELF头：描述生成该ELF文件的系统的信息，以及该ELF文件的一些基本信息
- .text：已编译生成的机器代码
- .rodata：只读数据，如常量，printf输出的字符串等
- .data：被初始化的全局和静态变量
- .bss：未初始化的静态变量或初始化为0的全局和静态变量，这些变量运行时占用内存，但在目标文件中通常只记录大小而不占用实际数据字节
- .symtab：存放在该程序中定义和引用的全局变量，静态变量和函数的信息
- .rel.text .text部分中需要重定位的位置(引用的外部函数)
- .rel.data .data中需要被重定位的位置(引用的外部全局变量)
- .debug .line 编译选项-g得到的调试信息
- .strtab 存储.symtab和.debug中符号的一个字符串表

##### 符号的类型

symtab包含以下三种符号：
1. 全局符号：由该模块定义，并被其他程序引用的符号
2. 外部符号：由其他模块定义，在该程序中被引用的符号
3. 局部符号：在该模块中定义的静态函数和变量(static)

本地变量不会包含在symtab中，而是会在运行栈中被管理；而使用static的符号虽然在symtab中，但是是该模块私有的，不会被其他模块引用

##### symtab的构成

symtab中包含多个符号，每个符号用一个如下结构的条目表示


![image](./csapp-linking-linking-image-003.jpg)


- name：该条目符号在.strtab中的偏移量，从.strtab中这个位置开始一直取字符直到遇到结束符
- type：该符号为函数还是变量
- binding：该符号是在该模块中定义的还是从外部引用的
- section：表明该符号属于哪一节
- value：该符号相对于其所在节的地址偏移量
- size：该符号的字节大小

注意`section`字段指明了该符号属于哪一节，但除了`.data`，`.text`，`.bss`，`.rodata`外，它还可能指向三个在ELF中不存在的伪节
1.`ABS`表示该符号不应该被重定位
2.`UNDEF`表示在该模块中未定义，即从外部模块引用的符号
3.`COMMON`表示未初始化的全局变量的试探性定义；对比`.bss`通常保存未初始化的静态变量以及初始化为0的全局和静态变量


我们可以使用`GNU READELF`程序查看目标文件内容，一个示例如下


![image](./csapp-linking-linking-image-004.jpg)


#### 符号解析

**强符号**：函数和已初始化的全局变量
**弱符号**：未初始化的全局变量
不难发现，对于变量来说，弱符号都被分配到`COMMON`节

链接器使用以下规则处理多重定义的符号：

1. 不允许有多个同名的强符号
2. 如果有一个强符号和多个弱符号同名，选择强符号
3. 如果有多个弱符号同名，任意选择一个

以下是一个由该规则可能导致的错误


![image](./csapp-linking-linking-image-005.jpg)


两个模块中，第一个x是强符号，而第二个是COMMON，链接器将它们合并，并按较大的对象大小分配存储，那么对 `x` 的写入可能覆盖相邻数据，例如修改到 `y`

在C中，可以使用`gcc -fno-common`这样的选项，让链接器在遇到多重定义的全局符号时报错；而在C++中不支持`COMMON`，相当于默认使用该行为

#### 与静态库链接

静态库是相关目标文件(.o文件)的集合，以存档格式(.a文件)存储，链接静态库时，链接器只复制被程序引用的目标模块
使用AR工具，可以创建函数的一个静态库
`linux> gcc -c addvec.c multvec.c`
`linux> ar rcs libvector.a addvec.o multvec.o`
要使用这个静态库，我们直接在`main.c`中加入`#include "vector.h"`即可调用`addvec`，`multvec`这两个函数(无需声明原型)
然后再使用`-static`使链接器进行静态链接
`linux> gcc -c main.c` 
`linux> gcc -static -o prog main.o ./libvector.a`


![image](./csapp-linking-linking-image-006.jpg)


##### 链接器静态链接的行为
对于输入文件，链接器按输入顺序从左到右扫描
若当前文件是一个`.o`目标文件，链接器会无条件把它加入链接，并用其中的定义更新已定义符号集合和未解析符号集合
若当前文件是一个`.a`存档文件，链接器会扫描其中的目标模块；只有某个成员定义了当前未解析的符号时，才会把该成员加入链接，并继续更新符号集合
结束后，若集合不为空，链接器报错；否则执行合并与重定位，生成可执行文件

由该过程可见，链接存在依赖关系，符号应该先引用，后定义；同时链接器支持重复库，即同一个库多次输入在可以在链接器中不同位置

#### 重定位
完成符号解析后，链接器进行重定位，包含两个关键步骤：
1. 合并输入模块得到聚合节，并为每个聚合节和其中的符号分配运行时内存地址
2. 根据重定位条目，修改每个符号的引用，使它们指向正确的运行时地址

#### 重定位条目
重定位条目存在于`.rel.data`和`.rel.text`中，作用是告知链接器如何对于一个外部符号进行修改，其结构如下


![image](./csapp-linking-linking-image-007.jpg)


重定位的算法描述如下


![image](./csapp-linking-linking-image-008.jpg)


为了便于理解，我们直接举下面的例子


![image](./csapp-linking-linking-image-009.jpg)


注意：linux x86-64使用小端序！！！
`array`是一个外部变量，我们想要将它的地址作为参数传入`%edi`中，但是由于地址未知，所以32位都用0来填充，并在这里留下一个类型为`R_X86_64_32`的重定位条目，表示进行32位绝对重定位。该条目的`offset`偏移值为$0xa$，即重定位会从该偏移值开始填充32位，`addend`为0（结构体访问成员时可能不为0）。`refptr`指向这段填充的0的起始位置，然后将从这个位置开始的4个字节赋为该符号分配的地址的值，得到`array`的正确地址，并传入`sum`函数作为参数

同样由于`sum`的具体代码的内存地址未知，使用0填充并留下一个类型为`R_X86_64_PC32`的重定位条目，表示进行32位相对重定位(因为`call` 一般使用相对寻址)，当执行`call`时，PC指向下一条指令的开头，即PC增加了4，为了补偿这个增量，我们将`addend`设置为-4，`refptr`指向这段填充的0的起始位置，然后计算`.text`聚合节中分配运行内存后，`sum`函数相对于`.text`的地址偏移量，并加上`addend`作为补偿，得到的就是在分配的内存中PC跳转到`sum`需要的地址偏移量，将这个值存入`refptr`指向的后4个字节中。当调用`sum`函数时，PC的值增加这个偏移量，刚好是`sum`函数的第一条指令

经过重定位，最后得到可执行目标文件

### 可执行目标文件
ELF可执行文件被设计为易于加载到内存，格式如下：


![image](./csapp-linking-linking-image-010.jpg)


- ELF头部：描述文件的总体格式，包括程序入口点（entry point）
- 段头部表：描述可执行文件中的片（segment）到内存段的映射关系
- .init：定义初始化代码
- .text、.rodata、.data、.bss：程序代码和数据
- 其他节：如.symtab、.debug等

可执行文件通过加载器映射到内存中并运行：
1. 创建进程和地址空间
2. 将可执行文件的片（segment）映射到相应的虚拟内存区域，必要时按需调页载入
3. 跳转到程序的入口点（通常是_start）

在Linux x86-64系统中，程序入口点不是`main`函数，而是`_start`函数，它调用`__libc_start_main`，后者再调用`main`函数

运行时的内存分配情况如下：


![image](./csapp-linking-linking-image-011.jpg)


### 动态链接

共享库是一个目标模块，该模块在运行的时候可以加载到任意地址，和一个内存中的程序链接起来，该过程称为动态链接
该技术节省了空间，不需要在编译时将库中相应的文件链接过来，而是在运行前或运行中才进行链接；同时也方便了库的更新，不需要每次更新库的时候都对目标文件重新链接

在linux下，动态库文件扩展名为`.so`，windows中为`.dll`

`linux> gcc -shared -fpic -o libvector.so addvec.c multvec.c `
`linux> gcc -o prog main.c ./libvector.so`
得到在运行时，可以与`libvector.so`进行动态链接的可执行文件`prog`

#### 动态链接的过程

首先，执行一次静态的链接，生成的部分链接的可执行文件中含有共享库中的重定位和符号表信息，但是没有符号具体的定义
在执行这个部分链接的可执行文件前或运行中，动态链接器动态地将共享库中符号具体定义链接进来，内存中即为完全链接的可执行文件


![image](./csapp-linking-linking-image-012.jpg)


linux系统提供了相关的程序接口`dlopen()、dlsym()、dlclose()、dlerror()`，可以在程序运行中进行动态链接

#### 位置无关代码
咕咕咕

#### 库打桩机制
打桩允许我们截获对共享库函数的调用，取而代之执行自己的代码，这对于调试大型项目时极其有效

打桩可以在三个不同的阶段进行：

1. 编译时打桩

例如，为了对于程

```bash
gcc -DCOMPILETIME -c mymalloc.c
gcc -I. -o prog main.c mymalloc.o
```

2. 链接时打桩

```bash
gcc -DLINKTIME -c mymalloc.c
gcc -c main.c
gcc -Wl,--wrap,malloc -Wl,--wrap,free -o prog main.o mymalloc.o
```

3. 运行时打桩

```c
#define _GNU_SOURCE
#include <dlfcn.h>

void *malloc(size_t size) {
    void *(*mallocp)(size_t size);
    char *error;
    
    mallocp = dlsym(RTLD_NEXT, "malloc"); // 获取libc的malloc
    // ... 打桩代码 ...
    return (*mallocp)(size);
}
```

这一章看下来真的太难受了（（（	

