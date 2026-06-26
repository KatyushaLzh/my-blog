---
title: "assignment2"
published: 2026-06-22
updated: 2026-06-16
category: "CS149"
tags: ["CS149","Lab"]
series: "CS149"
description: "assignment2"
draft: false
sourceLink: ""
---
环境

OS:Windows11 wsl2 6.6.87.2-microsoft-standard-WSL2 Ubuntu 24.04.3 LTS

CPU: Intel Core i7 13620H 8 cores, 10 logic processors, AVX2  

GPU:NVIDIA GeForce RTX 4060 Laptop

## assignment2

这一部分要求你补全一个类似于`ISPC`的任务系统，其余部分已经完成，你需要完成负载分配部分

你需要完成无依赖和有依赖的任务系统，并且要用每次创建线程，使用线程池且线程自旋，使用线程池且线程休眠三种方式实现

### 无依赖的任务系统

#### 每次创建线程

这是`trivial`的，每次创建线程执行任务即可，为了平均负载，每当有空闲进程时就取出下一个任务来给该线程执行

注意当前执行到了哪一个进程这个变量会被多个线程使用，需要声明为原子变量

```cpp
//tasksys.h
class TaskSystemParallelSpawn: public ITaskSystem {
    public:
        TaskSystemParallelSpawn(int num_threads);
        ~TaskSystemParallelSpawn() override;
        const char* name();
        void run(IRunnable* runnable, int num_total_tasks);
        TaskID runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                const std::vector<TaskID>& deps);
        void sync();
    private:
        int Num_Threads;
        std::atomic <int> task_ptr;
        std::thread *thread_ptr;
};

//tasksys.cpp
const char* TaskSystemParallelSpawn::name() {
    return "Parallel + Always Spawn";
}

TaskSystemParallelSpawn::TaskSystemParallelSpawn(int num_threads) 
    : ITaskSystem(num_threads), 
      Num_Threads(num_threads), 
      thread_ptr(new std::thread[num_threads]),
      task_ptr(0) {

    //
    // TODO: CS149 student implementations may decide to perform setup
    // operations (such as thread pool construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //
}

TaskSystemParallelSpawn::~TaskSystemParallelSpawn() {
    delete[] thread_ptr;
}

void TaskSystemParallelSpawn::run(IRunnable* runnable, int num_total_tasks){

    //
    // TODO: CS149 students will modify the implementation of this
    // method in Part A.  The implementation provided below runs all
    // tasks sequentially on the calling thread.
    //
    task_ptr = 0;
    auto work = [&]() {
        while(1) {
            int task_id = task_ptr.fetch_add(1);
            if (task_id >= num_total_tasks) break;
            runnable->runTask(task_id, num_total_tasks);
        }
    };

    for (int i = 0; i < Num_Threads; i++) {
        thread_ptr[i] = std::thread(work);
    }
    for (int i = 0; i < Num_Threads; i++) {
        thread_ptr[i].join();
    }
}

TaskID TaskSystemParallelSpawn::runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                                 const std::vector<TaskID>& deps) {
    // You do not need to implement this method.
    return 0;
}

void TaskSystemParallelSpawn::sync() {
    // You do not need to implement this method.
    return;
}
```



#### 自旋线程池

每次都创建线程会产生额外的开销，为了减少开销，可以在任务系统被创建的时候就创建线程，在需要的时候执行任务，否则自旋，当任务系统调用析构函数的时候，结束所有线程

```cpp
//tasksys.h
class TaskSystemParallelThreadPoolSpinning: public ITaskSystem {
    public:
        TaskSystemParallelThreadPoolSpinning(int num_threads);
        ~TaskSystemParallelThreadPoolSpinning();
        const char* name();
        void run(IRunnable* runnable, int num_total_tasks);
        TaskID runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                const std::vector<TaskID>& deps);
        void sync();
    private:
        int Num_Threads;
        std::thread *thread_ptr;
        IRunnable *task;
        int task_num;
        std::atomic <bool> end;
        std::atomic<int> task_ptr, task_done;
        std::mutex mtx;
};

//tasksys.cpp
const char* TaskSystemParallelThreadPoolSpinning::name() {
    return "Parallel + Thread Pool + Spin";
}

TaskSystemParallelThreadPoolSpinning::TaskSystemParallelThreadPoolSpinning(int num_threads)
    : ITaskSystem(num_threads),
      Num_Threads(num_threads),
      thread_ptr(new std::thread[num_threads]),
      task(nullptr), 
      task_num(0), 
      task_ptr(0),
      end(false) {

    //
    // TODO: CS149 student implementations may decide to perform setup
    // operations (such as thread pool construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //

    auto work = [&]() {
        while (1) {
            if (end) break;
            int task_id = -1; {
                std::unique_lock <std::mutex> lock(mtx);
                if (task_ptr < task_num) {
                    task_id = task_ptr;
                    task_ptr++;
                }
            }

            if (task_id != -1) {
                task->runTask(task_id, task_num);
                task_done.fetch_add(1);
            }
        }
    };

    for (int i = 0; i < num_threads; i++) {
        thread_ptr[i] = std::thread(work);
    }
}

TaskSystemParallelThreadPoolSpinning::~TaskSystemParallelThreadPoolSpinning() {
    end = true;
    for (int i = 0; i < Num_Threads; i++) {
        thread_ptr[i].join();
    }
    delete[] thread_ptr;
}

void TaskSystemParallelThreadPoolSpinning::run(IRunnable* runnable, int num_total_tasks) {


    //
    // TODO: CS149 students will modify the implementation of this
    // method in Part A.  The implementation provided below runs all
    // tasks sequentially on the calling thread.
    //
    mtx.lock();
    task = runnable;
    task_num = num_total_tasks;
    task_ptr = 0;
    task_done = 0;
    mtx.unlock();
    while (task_done < task_num) {}
}

TaskID TaskSystemParallelThreadPoolSpinning::runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                                              const std::vector<TaskID>& deps) {
    // You do not need to implement this method.
    return 0;
}

void TaskSystemParallelThreadPoolSpinning::sync() {
    // You do not need to implement this method.
    return;
}
```

#### 休眠线程池

当一个线程在没有任务自旋的时候，仍然会占用CPU，考虑在没有剩余任务的时候让线程自旋

`C++`提供了条件变量`condition_variable`来进行控制

对于一个条件变量，可以通过其成员函数`wait(std::unique_lock, pred)` 使得拥有指定的互斥锁的线程休眠，直到接到通知并且`pred`为`true`(如果不设置`pred`，可能出现丢失唤醒和虚假唤醒)；通过成员函数`notify_all/one` 来通知该条件变量的所有/随机一个线程

```cpp
//tasksys.h
class TaskSystemParallelThreadPoolSleeping: public ITaskSystem {
    public:
        TaskSystemParallelThreadPoolSleeping(int num_threads);
        ~TaskSystemParallelThreadPoolSleeping();
        const char* name();
        void run(IRunnable* runnable, int num_total_tasks);
        TaskID runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                const std::vector<TaskID>& deps);
        void sync();
    private:
        int Num_Threads;
        std::thread *thread_ptr;
        IRunnable *task;
        int task_num;
        std::atomic <bool> end;
        std::atomic<int> task_ptr, task_done;
        std::mutex mtx;
        std::condition_variable cond;
};

//tasksys.cpp
const char* TaskSystemParallelThreadPoolSleeping::name() {
    return "Parallel + Thread Pool + Sleep";
}

TaskSystemParallelThreadPoolSleeping::TaskSystemParallelThreadPoolSleeping(int num_threads)
    : ITaskSystem(num_threads),
      Num_Threads(num_threads),
      thread_ptr(new std::thread[num_threads]),
      task(nullptr),
      end(false), 
      task_num(0),
      task_done(0),
      task_ptr(0) {
    //
    // TODO: CS149 student implementations may decide to perform setup
    // operations (such as thread pool construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //

    auto work = [&]() {
        while (1) {
            int task_id = -1; {
                std::unique_lock <std::mutex> lock(mtx);
                cond.wait(lock, [&]() {
                    return (task_ptr < task_num) || end;
                });
                if (end) break;
                task_id = task_ptr;
                task_ptr++;             
            }

            if (task_id != -1) {
                task->runTask(task_id, task_num);
                task_done.fetch_add(1);
            }
        }
    };
    for (int i = 0; i < Num_Threads; i++) {
        thread_ptr[i] = std::thread(work);
    }
}

TaskSystemParallelThreadPoolSleeping::~TaskSystemParallelThreadPoolSleeping() {
    //
    // TODO: CS149 student implementations may decide to perform cleanup
    // operations (such as thread pool shutdown construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //
    end = 1;
    cond.notify_all();
    for (int i = 0; i < Num_Threads; i++) {
        thread_ptr[i].join();
    }
}

void TaskSystemParallelThreadPoolSleeping::run(IRunnable* runnable, int num_total_tasks) {


    //
    // TODO: CS149 students will modify the implementation of this
    // method in Parts A and B.  The implementation provided below runs all
    // tasks sequentially on the calling thread.
    //
    mtx.lock();
    task = runnable;
    task_num = num_total_tasks;
    task_done = 0;
    task_ptr = 0;
    mtx.unlock();
    cond.notify_all();
    while (task_done < task_num) {}

}

TaskID TaskSystemParallelThreadPoolSleeping::runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                                    const std::vector<TaskID>& deps) {


    //
    // TODO: CS149 students will implement this method in Part B.
    //

    return 0;
}

void TaskSystemParallelThreadPoolSleeping::sync() {

    //
    // TODO: CS149 students will modify the implementation of this method in Part B.
    //

    return;
}
```

测试结果如下

```
katyusha@Katyusha-PC:~/lesson/CS149/asst2/part_a$ python3 ../tests/run_test_harness.py
runtasks_ref
Linux x86_64
================================================================================
Running task system grading harness... (11 total tests)
  - Detected CPU with 16 execution contexts
  - Task system configured to use at most 16 threads
================================================================================
================================================================================
Executing test: super_super_light...
Reference binary: ./runtasks_ref_linux
Results for: super_super_light
                                        STUDENT   REFERENCE   PERF?
[Serial]                                3.047     3.205       0.95  (OK)
[Parallel + Always Spawn]               187.19    185.967     1.01  (OK)
[Parallel + Thread Pool + Spin]         17.331    24.842      0.70  (OK)
[Parallel + Thread Pool + Sleep]        49.395    50.039      0.99  (OK)
================================================================================
Executing test: super_light...
Reference binary: ./runtasks_ref_linux
Results for: super_light
                                        STUDENT   REFERENCE   PERF?
[Serial]                                40.591    39.736      1.02  (OK)
[Parallel + Always Spawn]               192.036   192.494     1.00  (OK)
[Parallel + Thread Pool + Spin]         16.801    28.911      0.58  (OK)
[Parallel + Thread Pool + Sleep]        50.339    49.974      1.01  (OK)
================================================================================
Executing test: ping_pong_equal...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_equal
                                        STUDENT   REFERENCE   PERF?
[Serial]                                647.781   650.243     1.00  (OK)
[Parallel + Always Spawn]               226.69    232.931     0.97  (OK)
[Parallel + Thread Pool + Spin]         127.354   151.776     0.84  (OK)
[Parallel + Thread Pool + Sleep]        141.546   151.333     0.94  (OK)
================================================================================
Executing test: ping_pong_unequal...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_unequal
                                        STUDENT   REFERENCE   PERF?
[Serial]                                1190.3    1201.024    0.99  (OK)
[Parallel + Always Spawn]               296.642   301.453     0.98  (OK)
[Parallel + Thread Pool + Spin]         191.766   201.452     0.95  (OK)
[Parallel + Thread Pool + Sleep]        205.871   201.991     1.02  (OK)
================================================================================
Executing test: recursive_fibonacci...
Reference binary: ./runtasks_ref_linux
Results for: recursive_fibonacci
                                        STUDENT   REFERENCE   PERF?
[Serial]                                563.32    1044.844    0.54  (OK)
[Parallel + Always Spawn]               96.153    147.336     0.65  (OK)
[Parallel + Thread Pool + Spin]         95.011    161.128     0.59  (OK)
[Parallel + Thread Pool + Sleep]        95.246    136.351     0.70  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop
                                        STUDENT   REFERENCE   PERF?
[Serial]                                321.704   364.809     0.88  (OK)
[Parallel + Always Spawn]               902.166   959.155     0.94  (OK)
[Parallel + Thread Pool + Spin]         109.294   148.513     0.74  (OK)
[Parallel + Thread Pool + Sleep]        233.708   260.56      0.90  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fewer_tasks...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fewer_tasks
                                        STUDENT   REFERENCE   PERF?
[Serial]                                355.836   368.551     0.97  (OK)
[Parallel + Always Spawn]               956.475   954.91      1.00  (OK)
[Parallel + Thread Pool + Spin]         152.932   179.352     0.85  (OK)
[Parallel + Thread Pool + Sleep]        258.914   261.421     0.99  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fan_in...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fan_in
                                        STUDENT   REFERENCE   PERF?
[Serial]                                184.691   187.97      0.98  (OK)
[Parallel + Always Spawn]               129.168   125.984     1.03  (OK)
[Parallel + Thread Pool + Spin]         39.776    45.638      0.87  (OK)
[Parallel + Thread Pool + Sleep]        51.235    53.255      0.96  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_reduction_tree...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_reduction_tree
                                        STUDENT   REFERENCE   PERF?
[Serial]                                185.884   190.249     0.98  (OK)
[Parallel + Always Spawn]               57.856    58.765      0.98  (OK)
[Parallel + Thread Pool + Spin]         38.416    38.12       1.01  (OK)
[Parallel + Thread Pool + Sleep]        41.4      38.552      1.07  (OK)
================================================================================
Executing test: spin_between_run_calls...
Reference binary: ./runtasks_ref_linux
Results for: spin_between_run_calls
                                        STUDENT   REFERENCE   PERF?
[Serial]                                219.686   373.554     0.59  (OK)
[Parallel + Always Spawn]               112.957   191.493     0.59  (OK)
[Parallel + Thread Pool + Spin]         192.487   238.134     0.81  (OK)
[Parallel + Thread Pool + Sleep]        122.142   191.913     0.64  (OK)
================================================================================
Executing test: mandelbrot_chunked...
Reference binary: ./runtasks_ref_linux
Results for: mandelbrot_chunked
                                        STUDENT   REFERENCE   PERF?
[Serial]                                273.413   274.303     1.00  (OK)
[Parallel + Always Spawn]               30.291    28.085      1.08  (OK)
[Parallel + Thread Pool + Spin]         25.06     26.769      0.94  (OK)
[Parallel + Thread Pool + Sleep]        26.543    25.636      1.04  (OK)
================================================================================
Overall performance results
[Serial]                                : All passed Perf
[Parallel + Always Spawn]               : All passed Perf
[Parallel + Thread Pool + Spin]         : All passed Perf
[Parallel + Thread Pool + Sleep]        : All passed Perf
```

### 有依赖的任务系统

要求你在休眠线程池功能基础上，实现`runAsyncWithDeps`函数，该函数相较于`run`还传入了一个`std::vector<TaskID>`参数，用来表示前置需要完成的任务集合，返回值为该任务的`TaskID`。该任务与`run`中的任务异步执行，直到调用`sync()`函数，阻塞主线程直到所有的依赖任务都已经完成

可以将`run`看做一个特殊的无依赖的任务，在对其调用`runAsyncWithDeps`后立即`sync()`同步

我们使用了队列来维护可执行的任务(即所有前置任务都已经完成的任务)，每次一个线程都尝试在队列中取出任务进行执行。

为了维护任务间的依赖关系，我们对每个任务都维护了一个`suf`集合，用来表示依赖于该任务的后继。当一个任务子任务全部完成时，就更新其所有后继的状态，若一个后继的前置任务全部完成，就将该后继加入队列；当申请一个新的任务时，对于其未完成的前置任务，尝试更新其`suf`集合

在实现上存在诸多细节，比如使用`vector`的话，原本有效的迭代器可能因为其他线程操作扩容而导致失效造成悬空引用，可以使用`deque`，`unordered_map`数据结构进行替代，或者采用下标索引；在效率方面尽量少使用互斥锁，多使用原子变量并且在必须使用互斥锁的时候只进行简单的标记，记录等操作

```cpp
//tasksys.h
class TaskSystemParallelThreadPoolSleeping: public ITaskSystem {
    public:
        TaskSystemParallelThreadPoolSleeping(int num_threads);
        ~TaskSystemParallelThreadPoolSleeping();
        const char* name();
        void run(IRunnable* runnable, int num_total_tasks);
        TaskID runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                const std::vector<TaskID>& deps);
        void sync();
    private:
        std::thread *thread_ptr;
        IRunnable *task;
        int Num_threads;
        int task_done = 0;
        std::queue<TaskID> task_que;
        struct Task {
            std::vector <int> suf;
            IRunnable *task;
            std::atomic<int> task_ptr{0}, task_done{0}, pre_done{0};
            int task_num, pre_cnt;
            Task() {}
            Task(IRunnable *T, int Task_num, int Pre_cnt) 
                : task(T), 
                  task_num(Task_num),
                  pre_cnt(Pre_cnt) {

            }
        };
        std::vector <Task*> task_vec;
        std::mutex mtx;
        std::condition_variable work_cv, sync_cv;
        bool end = false;
};

//tasksys.cpp

/*
 * ================================================================
 * Parallel Thread Pool Sleeping Task System Implementation
 * ================================================================
 */

const char* TaskSystemParallelThreadPoolSleeping::name() {
    return "Parallel + Thread Pool + Sleep";
}

TaskSystemParallelThreadPoolSleeping::TaskSystemParallelThreadPoolSleeping(int num_threads)
    : ITaskSystem(num_threads),
      Num_threads(num_threads),
      thread_ptr(new std::thread[num_threads]),
      end(false),
      task_done(0) {
    //
    // TODO: CS149 student implementations may decide to perform setup
    // operations (such as thread pool construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //
    auto work = [&]() {
        while (1) {
            int task_id = -1, subtask_id = -1;
            Task *ptr = nullptr; {
                std::unique_lock <std::mutex> lock(mtx);
                work_cv.wait(lock, [&]() {
                    return (!task_que.empty()) || end;
                });
                if (end && task_que.empty()) break;
                task_id = task_que.front();
                ptr = task_vec[task_id];
                if (ptr->task_ptr >= ptr->task_num) {
                    task_que.pop();
                    continue;
                }
            }

            if (ptr != nullptr) {
                while (1) {
                    subtask_id = ptr->task_ptr.fetch_add(1);
                    if (subtask_id >= ptr->task_num) break; 
                    ptr->task->runTask(subtask_id, ptr->task_num); 
                    int done = ptr->task_done.fetch_add(1) + 1; 
                    if (done == ptr->task_num){
                        std::unique_lock <std::mutex> lock(mtx);
                        ++task_done;
                        for (const auto &idx : ptr->suf) {
                            Task *_ptr = task_vec[idx];
                            if (++_ptr->pre_done == _ptr->pre_cnt) {
                                task_que.push(idx);
                                work_cv.notify_all();
                            }    
                        }
                        sync_cv.notify_all();
                    }                    
                }
            }
        }
    };
    for (int i = 0; i < Num_threads; i++) {
        thread_ptr[i] = std::thread(work);
    }
}

TaskSystemParallelThreadPoolSleeping::~TaskSystemParallelThreadPoolSleeping() {
    //
    // TODO: CS149 student implementations may decide to perform cleanup
    // operations (such as thread pool shutdown construction) here.
    // Implementations are free to add new class member variables
    // (requiring changes to tasksys.h).
    //
    std::unique_lock <std::mutex> lock(mtx);
    end = 1;
    lock.unlock();
    work_cv.notify_all();
    for (int i = 0; i < Num_threads; i++) {
        thread_ptr[i].join();
    }
    delete[] thread_ptr;
    for (auto ptr : task_vec) {
        delete ptr;
    }
}

void TaskSystemParallelThreadPoolSleeping::run(IRunnable* runnable, int num_total_tasks) {


    //
    // TODO: CS149 students will modify the implementation of this
    // method in Parts A and B.  The implementation provided below runs all
    // tasks sequentially on the calling thread.
    //
    runAsyncWithDeps(runnable, num_total_tasks, std::vector<TaskID>{}); 
    sync();
}

TaskID TaskSystemParallelThreadPoolSleeping::runAsyncWithDeps(IRunnable* runnable, int num_total_tasks,
                                                    const std::vector<TaskID>& deps) {


    //
    // TODO: CS149 students will implement this method in Part B.
    //
    std::unique_lock <std::mutex> lock(mtx);
    int id = static_cast <int> (task_vec.size());
    int pre = 0;
    for (const auto &idx : deps) {
        Task *ptr = task_vec[idx];
        if (ptr->task_done < ptr->task_num) {
            pre++;
            ptr->suf.push_back(id);
        }
    }
    Task *ptr = new Task(runnable, num_total_tasks, pre);
    task_vec.push_back(ptr);

    if (pre == 0) {
        task_que.push(id);
        work_cv.notify_all();
    }

    return id;
}

void TaskSystemParallelThreadPoolSleeping::sync() {

    //
    // TODO: CS149 students will modify the implementation of this method in Part B.
    //
    std::unique_lock <std::mutex> lock(mtx);
    sync_cv.wait(lock, [&]() {
        return task_done == static_cast<int>(task_vec.size());
    });
}

```

评测结果如下

```
katyusha@Katyusha-PC:~/lesson/CS149/asst2/part_b$ python3 ../tests/run_test_harness.py -a
runtasks_ref
Linux x86_64
================================================================================
Running task system grading harness... (22 total tests)
  - Detected CPU with 16 execution contexts
  - Task system configured to use at most 16 threads
================================================================================
================================================================================
Executing test: super_super_light...
Reference binary: ./runtasks_ref_linux
Results for: super_super_light
                                        STUDENT   REFERENCE   PERF?
[Serial]                                3.374     3.232       1.04  (OK)
[Parallel + Always Spawn]               3.294     143.047     0.02  (OK)
[Parallel + Thread Pool + Spin]         3.297     32.456      0.10  (OK)
[Parallel + Thread Pool + Sleep]        34.289    49.513      0.69  (OK)
================================================================================
Executing test: super_super_light_async...
Reference binary: ./runtasks_ref_linux
Results for: super_super_light_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                3.304     3.167       1.04  (OK)
[Parallel + Always Spawn]               3.28      141.914     0.02  (OK)
[Parallel + Thread Pool + Spin]         3.294     25.471      0.13  (OK)
[Parallel + Thread Pool + Sleep]        9.923     49.523      0.20  (OK)
================================================================================
Executing test: super_light...
Reference binary: ./runtasks_ref_linux
Results for: super_light
                                        STUDENT   REFERENCE   PERF?
[Serial]                                43.447    40.952      1.06  (OK)
[Parallel + Always Spawn]               43.668    151.303     0.29  (OK)
[Parallel + Thread Pool + Spin]         43.431    35.089      1.24  (OK)
[Parallel + Thread Pool + Sleep]        60.807    49.644      1.22  (OK)
================================================================================
Executing test: super_light_async...
Reference binary: ./runtasks_ref_linux
Results for: super_light_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                43.896    40.416      1.09  (OK)
[Parallel + Always Spawn]               43.025    149.93      0.29  (OK)
[Parallel + Thread Pool + Spin]         43.679    29.589      1.48  (OK)
[Parallel + Thread Pool + Sleep]        28.933    24.183      1.20  (OK)
================================================================================
Executing test: ping_pong_equal...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_equal
                                        STUDENT   REFERENCE   PERF?
[Serial]                                704.422   648.376     1.09  (OK)
[Parallel + Always Spawn]               702.252   204.452     3.43  (NOT OK)
[Parallel + Thread Pool + Spin]         699.26    156.193     4.48  (NOT OK)
[Parallel + Thread Pool + Sleep]        191.514   151.617     1.26  (OK)
================================================================================
Executing test: ping_pong_equal_async...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_equal_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                700.791   647.809     1.08  (OK)
[Parallel + Always Spawn]               703.253   208.985     3.37  (NOT OK)
[Parallel + Thread Pool + Spin]         702.64    156.071     4.50  (NOT OK)
[Parallel + Thread Pool + Sleep]        183.948   139.78      1.32  (OK)
================================================================================
Executing test: ping_pong_unequal...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_unequal
                                        STUDENT   REFERENCE   PERF?
[Serial]                                1291.155  1214.399    1.06  (OK)
[Parallel + Always Spawn]               1297.076  265.625     4.88  (NOT OK)
[Parallel + Thread Pool + Spin]         1284.404  207.297     6.20  (NOT OK)
[Parallel + Thread Pool + Sleep]        262.049   201.473     1.30  (OK)
================================================================================
Executing test: ping_pong_unequal_async...
Reference binary: ./runtasks_ref_linux
Results for: ping_pong_unequal_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                1292.723  1214.691    1.06  (OK)
[Parallel + Always Spawn]               1293.555  263.932     4.90  (NOT OK)
[Parallel + Thread Pool + Spin]         1295.538  206.042     6.29  (NOT OK)
[Parallel + Thread Pool + Sleep]        258.012   197.771     1.30  (OK)
================================================================================
Executing test: recursive_fibonacci...
Reference binary: ./runtasks_ref_linux
Results for: recursive_fibonacci
                                        STUDENT   REFERENCE   PERF?
[Serial]                                672.702   1059.673    0.63  (OK)
[Parallel + Always Spawn]               676.334   144.753     4.67  (NOT OK)
[Parallel + Thread Pool + Spin]         671.824   160.962     4.17  (NOT OK)
[Parallel + Thread Pool + Sleep]        108.368   139.518     0.78  (OK)
================================================================================
Executing test: recursive_fibonacci_async...
Reference binary: ./runtasks_ref_linux
Results for: recursive_fibonacci_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                677.219   1065.529    0.64  (OK)
[Parallel + Always Spawn]               671.694   141.044     4.76  (NOT OK)
[Parallel + Thread Pool + Spin]         672.491   137.377     4.90  (NOT OK)
[Parallel + Thread Pool + Sleep]        101.067   134.396     0.75  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop
                                        STUDENT   REFERENCE   PERF?
[Serial]                                386.117   367.139     1.05  (OK)
[Parallel + Always Spawn]               390.633   763.636     0.51  (OK)
[Parallel + Thread Pool + Spin]         387.205   155.567     2.49  (NOT OK)
[Parallel + Thread Pool + Sleep]        335.568   260.16      1.29  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_async...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                379.027   357.445     1.06  (OK)
[Parallel + Always Spawn]               379.425   748.564     0.51  (OK)
[Parallel + Thread Pool + Spin]         381.661   129.059     2.96  (NOT OK)
[Parallel + Thread Pool + Sleep]        251.303   167.617     1.50  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fewer_tasks...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fewer_tasks
                                        STUDENT   REFERENCE   PERF?
[Serial]                                386.693   359.973     1.07  (OK)
[Parallel + Always Spawn]               385.614   767.266     0.50  (OK)
[Parallel + Thread Pool + Spin]         382.28    195.048     1.96  (NOT OK)
[Parallel + Thread Pool + Sleep]        361.556   261.403     1.38  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fewer_tasks_async...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fewer_tasks_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                383.238   362.11      1.06  (OK)
[Parallel + Always Spawn]               383.221   748.586     0.51  (OK)
[Parallel + Thread Pool + Spin]         383.377   60.354      6.35  (NOT OK)
[Parallel + Thread Pool + Sleep]        64.755    95.945      0.67  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fan_in...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fan_in
                                        STUDENT   REFERENCE   PERF?
[Serial]                                199.654   185.18      1.08  (OK)
[Parallel + Always Spawn]               199.644   111.129     1.80  (NOT OK)
[Parallel + Thread Pool + Spin]         200.94    46.147      4.35  (NOT OK)
[Parallel + Thread Pool + Sleep]        77.969    56.712      1.37  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_fan_in_async...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_fan_in_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                200.266   186.405     1.07  (OK)
[Parallel + Always Spawn]               196.858   107.224     1.84  (NOT OK)
[Parallel + Thread Pool + Spin]         196.916   34.597      5.69  (NOT OK)
[Parallel + Thread Pool + Sleep]        32.059    32.355      0.99  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_reduction_tree...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_reduction_tree
                                        STUDENT   REFERENCE   PERF?
[Serial]                                200.065   189.841     1.05  (OK)
[Parallel + Always Spawn]               198.557   55.519      3.58  (NOT OK)
[Parallel + Thread Pool + Spin]         195.579   36.797      5.32  (NOT OK)
[Parallel + Thread Pool + Sleep]        41.008    39.417      1.04  (OK)
================================================================================
Executing test: math_operations_in_tight_for_loop_reduction_tree_async...
Reference binary: ./runtasks_ref_linux
Results for: math_operations_in_tight_for_loop_reduction_tree_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                196.123   183.502     1.07  (OK)
[Parallel + Always Spawn]               195.809   51.347      3.81  (NOT OK)
[Parallel + Thread Pool + Spin]         195.512   29.132      6.71  (NOT OK)
[Parallel + Thread Pool + Sleep]        34.974    29.707      1.18  (OK)
================================================================================
Executing test: spin_between_run_calls...
Reference binary: ./runtasks_ref_linux
Results for: spin_between_run_calls
                                        STUDENT   REFERENCE   PERF?
[Serial]                                238.154   376.977     0.63  (OK)
[Parallel + Always Spawn]               234.787   192.36      1.22  (OK)
[Parallel + Thread Pool + Spin]         235.452   236.406     1.00  (OK)
[Parallel + Thread Pool + Sleep]        121.11    192.589     0.63  (OK)
================================================================================
Executing test: spin_between_run_calls_async...
Reference binary: ./runtasks_ref_linux
Results for: spin_between_run_calls_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                242.261   376.192     0.64  (OK)
[Parallel + Always Spawn]               235.36    193.519     1.22  (OK)
[Parallel + Thread Pool + Spin]         235.4     229.247     1.03  (OK)
[Parallel + Thread Pool + Sleep]        121.462   194.465     0.62  (OK)
================================================================================
Executing test: mandelbrot_chunked...
Reference binary: ./runtasks_ref_linux
Results for: mandelbrot_chunked
                                        STUDENT   REFERENCE   PERF?
[Serial]                                296.609   275.69      1.08  (OK)
[Parallel + Always Spawn]               295.098   29.164      10.12  (NOT OK)
[Parallel + Thread Pool + Spin]         297.117   25.831      11.50  (NOT OK)
[Parallel + Thread Pool + Sleep]        25.4      24.446      1.04  (OK)
================================================================================
Executing test: mandelbrot_chunked_async...
Reference binary: ./runtasks_ref_linux
Results for: mandelbrot_chunked_async
                                        STUDENT   REFERENCE   PERF?
[Serial]                                297.946   274.831     1.08  (OK)
[Parallel + Always Spawn]               297.743   29.353      10.14  (NOT OK)
[Parallel + Thread Pool + Spin]         295.95    24.352      12.15  (NOT OK)
[Parallel + Thread Pool + Sleep]        27.117    25.444      1.07  (OK)
================================================================================
Overall performance results
[Serial]                                : All passed Perf
[Parallel + Always Spawn]               : Perf did not pass all tests
[Parallel + Thread Pool + Spin]         : Perf did not pass all tests
[Parallel + Thread Pool + Sleep]        : All passed Perf
```


