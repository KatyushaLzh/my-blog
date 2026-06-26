---
title: "CS106L Standard C++ Programming"
published: 2026-06-22
updated: 2026-02-16
category: "Modern C++"
tags: ["Modern C++"]
series: "Modern C++"
description: "CS106L Standard C++ Programming"
draft: false
sourceLink: ""
---
# CS106L Standard C++ Programming

## philosophies of C++ design

1. 程序员拥有完全的控制权，并需要对此负责
2. 在代码中直接表达思想和意图
3. 尽可能在编译时强制执行安全性
4. 不浪费空间和时间
5. 将杂乱的特性模块化 
6. 向下兼容

## stream

`std::ostringstream` 定义一个写缓冲区，采用 `<<` 从缓存区指针处写入字符串覆盖

`std::istringstream` 定义一个读缓存区，采用 `>>` 依据右变量的类型，从缓冲区指针开始读入并进行类型转换。更具体地说，指针会一直读取并向后移动直到遇到空白或制表符，然后指针重新指向空白或制表符的前一个位置。下一次进行缓存区读时，指针会跳过所有空白和制表符，直到下一个字符

事实上，`std::istringstream`是一种 `std::istream`，而 `std::cin` 是一个 `std::istream`类型的对象，`std::cout`同理

使用缓冲区而不是立即输出，避免了系统调用读写的昂贵开销，但 `std::cerr`是不使用缓存区直接输出



缓冲区的状态：Good/Fail/EOF/Bad bit，可通过一个缓冲区的成员函数进行访问  如`.good()`

当尝试读入的类型于缓存区中识别的类型不一致时，`fail`位会被设置为1，并且此后对该缓冲区的读入都会被冻结 

## modern C++ data type

类型别名 eg: `using  iter = std::vector <int>::iterator`

`auto` 编译器从初值赋值自动推断类型 注意：用 `const`为 `auto`变量赋初值的时候不会有常量性

`std::tuple`类似 `std::pair`，用来表示多元组，通过 `get<i>(x)`访问多元组 `x`的第 `i`个元素，类似语法通过 `set`来设置元素的值

统一初始化：按照结构体中变量定义的顺序使用花括号进行初始化

## STL

ez

## template

`C++` 使用 `template` 实现了类似泛型编程的功能 

对于模板函数，可以使用 `template <class T>` 声明使用了类型为 `T`的参数

在编译的时候，编译器会对应不同的类型进行实例化，替换生成对应类型的函数；你也可以手动进行实例化 `mymax<int>(114,514)`加快编译速度

同样的，自定义的函数也可以作为模板函数的参数。注意在C++标准库中，部分模板函数只接受谓词函数，即返回布尔值的函数



`lambda` 函数：创建的是一个对象，但是表现得像一个轻量级函数，其声明如下

`auto fun = [capture-clause](parameters)->return-value{//body};`

编译器实际上会把它转化成一个类，由于这个类的名称未知，需要使用 `auto`

其中的 `capture-clause` 规定了该`lambda` 函数能够捕获的外部变量

## class

使用构造函数和析构函数，可以定义一个类被创建和回收时的行为



操作符重载分为成员函数和非成员函数两种，前者在类中被定义，后者在类外被定义

部分操作符只能以其中一种形式进行重载，如我们重载`std::cout`的 `<<`，使得其能够输出我们自己定义的一个分数类，就只能采用非成员函数进行定义。在成员函数中，可以使用`*this`得到一个指向当前类的指针

操作符重载的基本原则是和基本类型规则保持一致，如定义分数类的`+=`时，为了和普通`int a` 的 `(a += 1) += 2;`规则相匹配，运算符的返回值应该是一个对当前变量的引用，而非一个拷贝值

采用`friend`定义友元函数，使得一个位于类外部的函数能够访问类的私有变量



对于一个类，编译器会自动为其生成四种函数

1. 构造函数(`default constructor`)：在该对象被创建时调用
2. 拷贝构造函数(`copy constructor`)：在创建一个新的对象，用旧有的对象对其进行初始化赋值时被调用
3. 拷贝赋值函数(`copy assignment`)：在对于一个已经存在的对象，用旧有的对象对其进行覆盖赋值时被调用
4. 析构函数(`destructor`)：在一个对象超出其作用域时被调用

编译器自动生成的函数可能与我们预期的行为不一样，如对于一个自己实现的变长数组的类，会采用指针指向一个地址，当进行拷贝的时候，另外的一个对象指针也会指向该地址，而不是我们期望的深拷贝，即创建该地址表示的数组的副本



通过`std::dynamic_cast`，可以判断一个对象是否是某个指定类的实例



### move semantics

将一个对象插入$vector$的末尾，$push\_back$方法会先创建该对象的副本，再将该对象的一个副本插入$vector$末尾，这样就需要创建对象的两个副本；而使用$emplace\_back$，会在$vector$内直接创建该对象的副本，更为高效



左值与右值：左值出现在等号左侧，右值在右侧。左值有名称和标识，可以使用取地址符找到该值的地址；右值没有名称或标识，是临时值。

左值引用：`&` 

右值引用：`&&` 可以延长临时值的生命周期，如 `auto&& prt = a +b;`



类中还有着以下两个特殊成员函数：

1. 移动构造函数(`move constructor`)：在创建一个新的对象，用右值对其进行初始化赋值时被调用
2. 移动赋值函数(`move assignment`)：在对于一个已经存在的对象，用右值对其进行覆盖赋值时被调用

以上两个函数均以右值引用作为其参数，对右值引用进行拷贝，由于右值是临时的，保证了该类不会被通过右值的指针修改。在这两个移动函数中，传入的右值引用有地址，是左值，如果直接使用`=`会调用拷贝函数，造成额外的开销，可以使用`std::move(rhs)`将其转化为右值，将其视为临时值进行移动。



使用`std::move`实现高效的`swap`

```cpp
template <class T>
void swap(T &a, T &b) {
    T tmp = std::move(a);
    a = std::move(b);
    b = std::move(tmp);
}
```

时间复杂度取决于类型`T`的移动构造函数和移动赋值函数的时间复杂度。如`std::vector<T>`二者都为`O(1)`，总复杂度也为`O(1)`

### inheritance

继承：将一个类（派生类）基于另一个类（基类）来构建

```cpp
class Derived : public Base {
    public:
    	//something
    private:
    	//something
};
```

这被称为`public继承`，基类的所有成员在派生类中访问权限不变。而`protected/private继承`会将基类的`public`和`protected`访问权限变为`protected`/`private`



在基类中，通过在成员函数前加入关键字`virtual`得到虚函数，使得该函数可以在派生类中被重写，一旦被声明为virtual，在整个继承链中都是虚函数

通过使用`=0`可以构建纯虚函数，必须在派生类中进行重写。至少包含一个纯虚函数的类称为“抽象类”，无法被实例化

派生类通过关键字`override`对基类的虚函数进行重写

基类的虚函数通过关键字`final`，禁止派生类对该函数重写

注意：当派生类定义了与基类成员中名称相同的变量时，基类的变量会被隐藏，即访问该变量时只能得到派生类的值

当派生类超出其生命周期时，会先调用派生类的析构函数，再调用基类的析构函数，注意基类析构函数应该为虚函数，否则对派生类指向的空间进行释放时，只会调用基类的析构函数，进而可能造成内存泄漏

```cpp
class Animal {
    public:
        std::string name;
        int age;
        Animal(std::string n, int ag) {
            name = n; age = ag;
        }
        virtual ~Animal() = 0;
};

class Dog: public Animal {
    std::string type;
    public:
        Dog(std::string name, int ag, std::string tp) : Animal(name, ag),type(tp){} 
        virtual void daily() = 0;
        virtual void eat() = 0;
        virtual void sleep() = 0;
    	virtual ~Dog(){}
};

class My_Dog: public Dog {
    public:
        My_Dog(std::string name, int ag, std::string tp) : Dog(name, ag, tp) {}
        void eat() override final {
            std::cout << "eat meat" << '\n';
        }
        void sleep() override final {
            std::cout << "sleep 10 hours per day" << '\n';
        }
        void daily() override final {
            eat();
            sleep();
        }
    	~My_Dog() override final {
            
        }
};
```

模板被称为静态多态性，在编译时确定具体调用哪个函数；而继承被称为动态多态性，在运行时根据对象的实际类型确定调用哪个函数

## namespace

ez

## RAII & samrt pointers

考虑以下代码

```cpp
void fun() {
	int *ptr = new int;
	dosomething...
	delete ptr;
	return;
}
```

`new`的作用是在堆上动态分配空间，在`fun`函数结束后，这些空间不会被释放，除非调用了`delete`。但是函数主体部分可能有提前`return`，抛出异常等情况导致`delete`为被执行。这样就会导致堆上的一块空间一直被占用，这被称为`内存泄露`

`RAII`(Resource Acquisition Is Initialization)：若要获得资源，应该始终在构造函数中进行；若要释放资源，应该始终在析构函数中进行。
如 `std::ifstream`就符合`RAII`思想：采用文件名对其缓冲区进行初始化，在超出作用域调用析构函数是会关闭文件，而无需显式地关闭文件。

基于`RAII`思想，现代C++提供了智能指针，如`std::unique_ptr` `std::shared_ptr`
`std::unique_ptr`会在调用析构函数时自动释放其所指向的堆上空间，需要注意的是，如果对`std::unique_ptr`执行拷贝操作，可能导致堆上的空间被多次释放而出错，因此`std::unique_ptr`没有实现赋值拷贝和构造拷贝
而堆上的空间会在指向其的所有`std::shared_ptr`都调用析构函数后才会释放，注意`std::shared_ptr`效率上不如`std::unique_ptr`

# A Tour of C++ by Bjarne Stroustrup

太好了是C++之父我们有救辣

## const & constexpr (C++11)

`const`修饰的值不会被修改，这个值可以在运行时被计算

`constexpr`修饰的是在编译时计算的常量，可以提高运行时性能

函数必须使用`constexpr`或`consteval`(C++20)修饰，才能用于初始化一个`constexpr`常量；

二者区别在于前者修饰的函数也允许运行时计算，后者只能在编译时计算。同时都必须是纯函数，不能修改全局变量



## NULL & nullptr(C++11)

`NULL`的本质是一个被定义为0的宏，当作为参数传入函数中时，会被编译器当做一个整数而非指针

而`nullptr`有自己的类型`std::nullptr_t`，可以隐式转换为任意指针类型，或者采用`static_cast`进行显式转换

## enum class

`enum`(枚举)是一种简单的用户自定义类型，通过使用助记符代替整数，用于表示少量值的集合

`C`风格的枚举为`enum`，`C++`则为`enum class`，后者有独立作用域，避免了命名污染，以下介绍都以`enum class`为例

`enum class`可以指定枚举的类型与值，默认为`int`和`0-index`的整数，语法如下

```cpp
enum class Days : int {
    Monday = 1,		//default = 0
    Tuesday = 2,	// 1
    Wednesday = 3,	// 2
    Thursday = 4,	// 3
    Friday = 5,		// 4
    Saturday = 6,	// 5
    Sunday = 7		// 6
};
```

类似命名空间，通过`::`访问成员，如`Days today = Days::Friday;`

枚举类不支持隐式类型转换，只能进行显式类型转换，如`int today = static_cast<int> (Days::Friday);`

枚举类成员只默认定义了赋值，初始化和比较，可以为其自定义其他操作符。占用的空间和一个枚举类型的大小相同



## union & std::variant(\<variant\> C++17 )

`union`(联合)通过将不会被同时使用的成员放在同一个地址，避免了使用两段地址造成空间浪费。可以采用`enum class`+`union`来实现

例如当一棵树只有叶子节点需要保存值的时候，可以这么写

```cpp
enum class Node_type : bool {
    node_ptr,
    val
};

struct Node {
    Node_type t;
    union value {
        Node *p;
        long long val;
    }v;
    void fun() {
        if (t == Node_type::node_ptr) {
            //do something
        }else {
            std::cout << v.val << '\n';
        }
    }
};
```



可以使用`std::variant`简化以上代码

```cpp
struct Node {
    std::variant <Node*, long long> v; 
    void fun() {
        if (std::holds_alternative<Node *>(v)) {
            //do something
        }else {
            std::cout << std::get <long long> (v) << '\n';
        }
    }
};
```



## std::initializer_list (\<initializer_list\> C++11)

使用花括号，将类型相同的变量组合起来，浅拷贝得到一个只读的临时数组，用于进行类的初始化

`initializer_list`可以使用迭代器进行访问，为了强调只读性不支持`[]`访问

##  throw-try-catch

`throw-try-catch`提供了应对异常的机制

当控制流执行到某个地方，接下来会发生异常时，可以通过`throw`退出当前作用域，将控制流转移到该作用域的调用者，同时传递异常，异常可以是任何类型的变量，但为了可维护性一般建议抛出`<stdexcept>`中的异常类

将可能发生异常的语句放置于`try`中，这些语句用`throw`传出的异常可以被`catch`进行捕获并处理

例如，可以对`Vector`越界访问抛出`<stdexcept>`中的`std::out_of_range`

```cpp
template <class T>
class Vector {
    public:
        Vector(int S): ptr(new T[S]), siz(S) {}
        T& operator[](int index) {
            if (index < 0 || index > siz - 1) throw std::out_of_range{"Vector::operator[]"};
            return *(ptr + index);
        } 
    private:
        T *ptr;
        int siz;
};

Vector <int> vec(114);

auto main() -> int {
    try {
        std::cout << vec[115] << '\n';
    }
    catch (const std::out_of_range &err) {
        std::cerr << err.what() << '\n';
    }
}
```

同时，也可以在`catch`中使用`throw`重新抛出异常，向上一级调用传播

通过将函数标明为`noexcept`，会将任何抛出异常的函数行为都变成`std::terminate()`



## assert (\<cassert\>) & static_assert (C++11)

`assert(cond)`(断言)会在运行时检查`cond`的值，若非真，则会立即终止程序

`static_assert(cond, s)`可以在编译时检查常量表达式`cond`的值，若非真，则编译错误，并输出`s`作为编译错误信息



## default functions

类的基本函数通过以下形式进行定义，可以使用`default`表示采用编译器生成的默认函数，`delete`声明不生成该操作函数

```cpp
class My_Class {
    public:
        My_Class();//defualt constructor
        My_Class(sometype);//customized constructor
        My_Class(const My_Class &);//copy constructor
        My_Class & operator = (const My_Class &);//copy assignment
        My_Class(My_Class &&);//move constructor
        My_Class & operator = (My_Class &&);//move assignment
        ~My_Class();//destructor
};
```



定义构造函数的同时，也定义了参数到类的类型转换

考虑以下代码

```cpp
template <class T>
class Vector {
    public:
        Vector(int S): ptr(new T[S]), siz(S) {}
        T& operator[](int index) {
            if (index < 0 || index > siz - 1) throw std::out_of_range{"Vector::operator[]"};
            return *(ptr + index);
        } 
    private:
        T *ptr;
        int siz;
};

int main() {
    Vector <int> v(10);
    v = 11;
}
```

 这段代码能够编译成功，是因为最后一行调用了接受`int`类型的构造函数，完成了`int`到`Vector<int>`的隐式类型转换

为了避免这种情况，我们只允许显式类型转换，即按以下方式定义构造函数

`explicit Vector(int S): ptr(new T[S]), siz(S){}`



拷贝时注意是深拷贝还是浅拷贝，被`std::move`的左值最好不要在重新赋值前使用



## relational operators

当关系操作符的两个操作数地位平等时，一般在类的定义外实现，否则在定义内实现



`<=>` (C++20) 被称为"宇宙飞船符号"，作用是比较两个相同类的操作数，若相等返回0，小于返回负数，大于返回正数(类似`strcmp`函数)

当`<=>`被声明为`default`的时候，会检查每个元素并按字典序进行比较

当未被声明为`default`的时候，`==`操作符不会被隐式定义

## user-defined literals

内置类型拥有字面量，用来表明常量的类型，如`0x0d000721u`表明了这是一个`unsigned int`
对于用户自定义类，我们也可以实现类似的字面量，使用`operator""`表示正在定义字面量操作符
例如定义虚数后缀`i`实现如下

```cpp
constexpr complex <T> operator ""i(const T &imag) {
    return {0, imag};
}
```
标准库的一些命名空间也提供了一些字面量
```cpp
using namespace std::literals::string_literals;
using namespace std::literals::string_view_literals;

auto main -> int {
    std::string_view s = "Ciallo"sv;
    std::cout <<　"Ciallo"s << '\n';
}
```

## template argument deduction (C++17)

在初始化的时候，可以让模板类构造函数自行推导模板类型，无需显式声明

如`std::pair p = {114.514, 114};`

对于容器类，也可以用`std::initializer_list`达到以上效果，需要注意的是初始化列表所有参数类型必须相同，否则会产生二义性错误

## functor

仿函数又被称为函数对象(function object)，是一种特殊的类，通过重载`()`应用操作符，使得其可以像函数一样被调用

```cpp
template <typename T>
class Less {
    private:
        T val;
    public:
        Less(const T &x) : val(x) {}
        bool operator ()(const T &x) const {return x < val;}
};
    
auto main() -> int {
    Less <std::string> l {"Ciallo"};
    std::cout << l(static_cast <std::string> ("QWQ")) << '\n';
}
```

仿函数可以被用作函数的参数

```cpp
template <typename Iter, typename f>
int Count_If(Iter bg, Iter ed, f pred) {
    int ans = 0;
    for (auto it = bg; it != ed; it++) {
        if (pred(*it)) ans++;
    }   
    return ans;
}

auto main() -> int {
    Less l {998244353};
    std::vector <int> vec;
    std::mt19937 Rand(1919810);
    for (int i = 1; i <= 100; i++) {
        vec.emplace_back(Rand());
    }
    std::cout << Count_If(vec.begin(), vec.end(), l) << '\n';
}
```

事实上，`lambada`函数也是编译器自动生成的一个仿函数

## finally

为了实现`RAII`，相较于使用智能指针，还可以使用作用域终结函数，这种方法对C代码有更好的兼容性

```cpp
template <typename F>
class Finally {
    private:
        F act;
    public:
        Finally(F &x): act(x) {}
        ~Finally() {
            act();
        }
};

template <typename F>
[[nodiscard]] auto finally(F f) {
    return Finally{f};
} 

void fun(int n) {
    auto *p = malloc(sizeof(int) * n);
    auto fin = finally([&]{free(p);});
    //do something
}
```

其中，`[[nodiscard]]`修饰函数返回值需要用左值接受，否则编译时会警告

当`fun`生命周期结束的时候，`fin`调用析构函数释放`p`指向的空间，相较在每个可能退出的位置释放堆上的空间更简便

## aliases

在所有的`STL container`的实现中，都有着这样的代码

```cpp
template <typename T>
class vector {
    public:
    using value_type = T;
    //something
    private:
    //something
}
```

所以，我们可以在模板函数中通过访问实例化类的`value_type`成员，得知其参数类型，进而构建该类型的模板类

## if constexpr (C++17)

通过`if constexpr(cond)`，得以实现编译时`if`，其中要求`cond`为常量表达式

通过在编译时计算分支跳转，避免了分支预测错误，提高了运行时效率

## concepts (\<concepts\> C++20)

泛型编程中，参数类型需要满足某些需求，模板才能被实例化。满足需求的类就被称为概念

考虑以下模板函数

```cpp
template <typename Seq, typename Value>
Value Sum(const Seq &s,Value v) {
    for (const auto &x : s) {
        v += x;
    }
    return v;
}
```

而这个函数需要保证`Seq`类支持`.begin()`  `.end()`以及迭代器移动；同时`Value`类支持`+=`，以及`Seq`存放的变量类型与`Value`类有可加性

类型名称指示符`typename`也是一个概念，它只限制了该参数是一个类

`STL`内置了迭代器概念，如`std::random_access_iterator`，`std::forward_iterator`等


我们可以使用`requires`检查一组表达式是否有效
`requires`子句接在模板参数列表后，右接一个约束表达式用来限制模板参数
`requires`表达式产生一个布尔量，描述对类型的要求

```cpp
template <typename Iter>
requires requires(Iter it, int i) {it[i]; it + i;}
void f(Iter it, int i) {
    //do something
}
```
第一个`requires`为子句，第二个
这样就限制了`iter`支持下标操作和加法操作

同时，我们也可以形式化地定义概念

```cpp
template <typename T>
concept Equality_comparable = requires (const T &a, const T &b) {
    {a == b} -> std::convertible_to <bool>;
    {a != b} -> std::convertible_to <bool>;
};
```
此处，我们定义的概念需要满足重载了等于和不等于，并且返回值可以被转换为`bool`类型

所以，上文的`Seq`类就可以通过定义一个概念来约束
```cpp
template <class T>
concept Sequence = requires (T seq) {
    typename std::ranges::range_value_t <T>;//参数类型可以被推断
    typename std::ranges::iterator_t <T>;//T提供了迭代器类型
    {seq.begin()} -> std::same_as <std::ranges::iterator_t <T> >;
    {seq.end()} ->  std::same_as <std::ranges::iterator_t <T> >;//有.begin() .end()函数，且返回类型只能是T的迭代器
    requires std::input_iterator <std::ranges::iterator_t<T> >;//迭代器至少是输入迭代器
    requires std::same_as <std::ranges::range_value_t<T>, std::iter_value_t<T> > ;//看不懂喵，ds告诉我是避免代理迭代器
};
```

标准库中也提供了一些概念，以上代码可以简写为
```cpp
template <class T>
concept Sequence = std::ranges::input_range <T>;
```

同时，概念放在`auto`前，用来约束用`auto`修饰的变量和参数，当不符合概念时，编译会出错，这避免了对`auto`的滥用

## variadic templates(C++11)
可变参数模板允许我们接受任意数量，任意类型的参数，具体实现上采用递归

```cpp
template <typename T>
concept Comparable = requires (T a, T b) {
    {a > b} -> std::convertible_to <bool>;
};

template <Comparable T, Comparable... Tail>
requires (std::same_as <T, Tail> && ...)
T Max(T head, Tail... tail) {
    T ret1 = std::move(head);
    if constexpr(sizeof...(tail) > 0) {
        T ret2 = Max(tail...);
        if (ret2 > ret1) return ret2;
    }
    return ret1;
}
```

使用编译时if而不是运行时if，避免了生成边界情况下参数只有一个的`Max`函数

但是问题在于可变参数模板由递归实现，开销较大，可以使用数组版本代替
```cpp
template <Comparable T, Comparable... Tail>
requires (std::same_as<T, Tail> &&...)
T Max(T v, Tail... tail) {
    T values[] = {std::move(v), std::move(tail)...};
    return *std::max_element(std::begin(values), std::end(values));
}
```

## perfect forwarding(C++11)
没看懂，以后来填坑

## const & class

通过在类方法后加上`const`限制，使得该类的成员不能被方法修改(`mutable`修饰的成员除外)，但成员管理的资源可以被修改

对于`const`对象，其调用的方法必须有`const`修饰，用来保证其只读的属性

在一个方法被调用时，编译器会根据对象的`const`属性选择匹配的版本：`const`对象调用`const`修饰的方法，`non-const`对象调用未使用`const`修饰的方法(如果存在)

所以为了保证类的`const`正确性，推荐对所有不修改成员的方法使用`const`修饰，同时为一些方法提供`const`和`non-const`两个版本

## std::string & std::string_view (C++17)

std::string 实现上采用了SSO(短字符串优化)技术，短字符串(一般20个字符以下)会被保存在std::string对象内部，长字符串才会在堆上分配空间
因此对于短字符串的操作速度比长字符串快很多

使用`std::string_view`，我们可以很方便地实现子串提取等功能
`std::string_view`本质是一个(指针，长度)的二元组，不拥有其指向的对象，只读

```cpp
std::string append1(const std::string &s1, const std::string &s2) {
    return s1 + s2;
}

std::string append2(std::string_view s1, std::string_view s2) {
    std::string s {s1};
    return s += s2;
}

auto main() -> int {
    std::string s = "Ciallo0d0007211145141919810"s;
    std::cout << append1({&s[0], 20}, s) << '\n';
    std::cout << append2({&s[0], 20}, s) << '\n';
}
```
`append1`函数参数为一个子串的时候，需要构建一个临时字符串，该字符串需要分配内存
`append2`函数则只拷贝了指针和长度，拷贝开销极小
需要注意的是，std::string_view不延长生命周期，指向的对象必须存活

## file stream
在算法竞赛中有这样一种文件输入输出方式
```cpp
int main() {
    std::ios::sync_with_stdio(0);
    std::cin.tie(0);
    std::cout.tie(0);
    freopen("problem.in", "r", stdin);
    freopen("problem.out", "w", stdout);

    int n;
    std::cin >> n;
    //dosomething
}
```
但事实上，这是一种未定义行为，`freopen`属于C标准库函数，只修改了C标准流的流指针，而`std::ios::sync_with_stdio(0)`将C++流与C流独立开来
如果我们先`freopen`再`std::ios::sync_with_stdio(0)`，则是先修改C流指针再将C++流和C流独立，这样是正确的
更稳妥的写法是使用`std::ifstream`和`std::ofstream`(\<fstream\>)
```cpp
auto main() -> int {
    std::ifstream fin("problem.in");
    std::ofstream fout("problem.out");

    int n;
    fin >> n;
    //dosomething
}
```
## parallel algorithms(\<execution\> C++17)
标准库提供了对于并行执行和向量化执行的支持
`std::execution`中有以下参数：
`seq`顺序执行 `par`并行执行 `unseq`向量化执行 `par_unseq`并行且向量化执行
例如`std::sort`可以写成如下形式
`std::sort(std::execution::par_unseq, vec.begin(), vec.end());`
注意执行策略指标仅仅是一个提示，使用何种程度的并发取决于编译器
