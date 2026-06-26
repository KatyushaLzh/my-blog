---
title: "assignment3"
published: 2026-06-22
updated: 2026-03-09
category: "CS149"
tags: ["CS149","Lab"]
series: "CS149"
description: "assignment3"
draft: false
sourceLink: ""
---
环境

OS:Windows11 wsl2 6.6.87.2-microsoft-standard-WSL2 Ubuntu 24.04.3 LTS

CPU: Intel Core i7 13620H 8 cores, 10 logic processors, AVX2  

GPU:NVIDIA GeForce RTX 4060 Laptop

## assignment3

### cuda环境配置

NVIDIA官方为WSL2环境提供了专门的CUDA Toolkit安装包，该版本不包含Linux驱动程序，从而避免了与Windows驱动的冲突

在NVIDIA官网https://developer.nvidia.com/cuda-downloads选择对应的安装选项，按照生成的安装命令执行即可

例如本机WSL2配置命令如下

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-wsl-ubuntu.pin
sudo mv cuda-wsl-ubuntu.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/13.1.1/local_installers/cuda-repo-wsl-ubuntu-13-1-local_13.1.1-1_amd64.deb
sudo dpkg -i cuda-repo-wsl-ubuntu-13-1-local_13.1.1-1_amd64.deb
sudo cp /var/cuda-repo-wsl-ubuntu-13-1-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt-get update
sudo apt-get -y install cuda-toolkit-13-1
```

此后我们再打开`~/.bashrc`配置环境变量，在最后加上以下内容

```bash
export CUDA_HOME=/usr/local/cuda-13.1
export PATH=$CUDA_HOME/bin:$PATH
export LD_LIBRARY_PATH=/usr/local/cuda/lib64:$LD_LIBRARY_PATH
```

`source ~/.bashrc`后，使用`nvcc --version`验证结果如下

### saxpy

要求我们补全`saxpy.cu`的代码，并且统计运行的总时间和`kernel`内计算的时间

需要注意的是，`cudaMalloc`，`cudaFree`，`cudaMemcpy`都是与主线程同步执行，而`kernel`内的计算是与主线程异步的，统计计算时间之前需要使用`cudaDeviceSynchronize()`

```cpp
void saxpyCuda(int N, float alpha, float* xarray, float* yarray, float* resultarray) {

    // must read both input arrays (xarray and yarray) and write to
    // output array (resultarray)
    int totalBytes = sizeof(float) * 3 * N;

    // compute number of blocks and threads per block.  In this
    // application we've hardcoded thread blocks to contain 512 CUDA
    // threads.
    const int threadsPerBlock = 512;

    // Notice the round up here.  The code needs to compute the number
    // of threads blocks needed such that there is one thread per
    // element of the arrays.  This code is written to work for values
    // of N that are not multiples of threadPerBlock.
    const int blocks = (N + threadsPerBlock - 1) / threadsPerBlock;

    // These are pointers that will be pointers to memory allocated
    // *one the GPU*.  You should allocate these pointers via
    // cudaMalloc.  You can access the resulting buffers from CUDA
    // device kernel code (see the kernel function saxpy_kernel()
    // above) but you cannot access the contents these buffers from
    // this thread. CPU threads cannot issue loads and stores from GPU
    // memory!
    float* device_x = nullptr;
    float* device_y = nullptr;
    float* device_result = nullptr;
    
    //
    // CS149 TODO: allocate device memory buffers on the GPU using cudaMalloc.
    //
    // We highly recommend taking a look at NVIDIA's
    // tutorial, which clearly walks you through the few lines of code
    // you need to write for this part of the assignment:
    //
    // https://devblogs.nvidia.com/easy-introduction-cuda-c-and-c/
    //
    cudaMalloc(&device_x, totalBytes / 3);
    cudaMalloc(&device_y, totalBytes / 3);
    cudaMalloc(&device_result, totalBytes / 3);
    // start timing after allocation of device memory
    double startTime = CycleTimer::currentSeconds();

    //
    // CS149 TODO: copy input arrays to the GPU using cudaMemcpy
    //

    cudaMemcpy(device_x, xarray, totalBytes / 3, cudaMemcpyHostToDevice);
    cudaMemcpy(device_y, yarray, totalBytes / 3, cudaMemcpyHostToDevice);
   
    // run CUDA kernel. (notice the <<< >>> brackets indicating a CUDA
    // kernel launch) Execution on the GPU occurs here.
    double kernel_time = CycleTimer::currentSeconds();
    saxpy_kernel<<<blocks, threadsPerBlock>>>(N, alpha, device_x, device_y, device_result);
    cudaDeviceSynchronize();
    kernel_time = CycleTimer::currentSeconds() - kernel_time;
    //
    // CS149 TODO: copy result from GPU back to CPU using cudaMemcpy
    //

    cudaMemcpy(resultarray, device_result, totalBytes / 3, cudaMemcpyDeviceToHost);
    
    // end timing after result has been copied back into host memory
    double endTime = CycleTimer::currentSeconds();

    cudaError_t errCode = cudaPeekAtLastError();
    if (errCode != cudaSuccess) {
        fprintf(stderr, "WARNING: A CUDA error occured: code=%d, %s\n",
		errCode, cudaGetErrorString(errCode));
    }

    double overallDuration = endTime - startTime;
    printf("Effective BW of kernel: %.3f ms\t\t[%.3f GB/s]\n", 1000.f * kernel_time, GBPerSec(totalBytes, kernel_time));
    printf("Effective BW by CUDA saxpy: %.3f ms\t\t[%.3f GB/s]\n", 1000.f * overallDuration, GBPerSec(totalBytes, overallDuration));

    //
    // CS149 TODO: free memory buffers on the GPU using cudaFree
    //
    cudaFree(device_x); cudaFree(device_y); cudaFree(device_result);
}
```

运行结果如下

```
Found 1 CUDA devices
Device 0: NVIDIA GeForce RTX 4060 Laptop GPU
   SMs:        24
   Global mem: 8188 MB
   CUDA Cap:   8.9
---------------------------------------------------------
Running 3 timing tests:
Effective BW of kernel: 13.045 ms               [85.673 GB/s]
Effective BW by CUDA saxpy: 153.652 ms          [7.273 GB/s]
Effective BW of kernel: 5.262 ms                [212.398 GB/s]
Effective BW by CUDA saxpy: 135.543 ms          [8.245 GB/s]
Effective BW of kernel: 5.248 ms                [212.972 GB/s]
Effective BW by CUDA saxpy: 136.620 ms          [8.180 GB/s]
```

对比同样数据规模的ISPC优化

```
[saxpy serial]:         [52.145] ms     [28.577] GB/s   [3.835] GFLOPS
[saxpy ispc]:           [51.940] ms     [28.689] GB/s   [3.851] GFLOPS
[saxpy task ispc]:      [31.122] ms     [47.879] GB/s   [6.426] GFLOPS
```

发现在计算方面，`cuda`加速比CPU快得多，但是`cudaMemcpy`内存通信开销极大，甚至慢于串行执行；而在GPU内部带宽接近于`RTX4060`的理论带宽 `256.0 GB/s`。这表明device和host的通信才是性能的瓶颈

### scan

注意此题测试参考程序依赖于`cuda 12`的运行时库，而我本地是`cuda 13`，需要通过以下命令安装`cuda 12`，并且修改`.bashrc`

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-wsl-ubuntu.pin
sudo mv cuda-wsl-ubuntu.pin /etc/apt/preferences.d/cuda-repository-pin-600
wget https://developer.download.nvidia.com/compute/cuda/12.8.1/local_installers/cuda-repo-wsl-ubuntu-12-8-local_12.8.1-1_amd64.deb
sudo dpkg -i cuda-repo-wsl-ubuntu-12-8-local_12.8.1-1_amd64.deb
sudo cp /var/cuda-repo-wsl-ubuntu-12-8-local/cuda-*-keyring.gpg /usr/share/keyrings/
sudo apt update
```

可以使用以下命令进行版本切换：`sudo update-alternatives --config cuda`

要求我们使用`Blelloch`算法实现并行前缀和，并调用该函数无锁地实现`find_repeats`用来并行找出所有满足`input[i]==input[i+1]`的`i`构成的序列

首先是并行前缀和，代码如下

```cpp
__global__ void Kernel_up_sweep(int *arrary, int threads, int stride) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < threads) {
        int id1 = idx * stride + (stride >> 1), id2 = (idx + 1) * stride;
        id1--; id2--;  
        arrary[id2] = arrary[id1] + arrary[id2];
    }
}

__global__ void Kernel_down_sweep(int *arrary, int threads, int stride) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < threads) {
        int id1 = idx * stride + (stride >> 1), id2 = (idx + 1) * stride;
        id1--; id2--;
        int x = arrary[id1], y = arrary[id2];
        arrary[id1] = y; arrary[id2] = x + y;
    }
}

void exclusive_scan(int* input, int N, int* result)
{

    // CS149 TODO:
    //
    // Implement your exclusive scan implementation here.  Keep in
    // mind that although the arguments to this function are device
    // allocated arrays, this is a function that is running in a thread
    // on the CPU.  Your implementation will need to make multiple calls
    // to CUDA kernel functions (that you must write) to implement the
    // scan.

    int n = nextPow2(N);
    for (int stride = 2; stride <= n / 2; stride <<= 1) {
        int threads = n / stride, blocks = (threads - 1 + THREADS_PER_BLOCK) / THREADS_PER_BLOCK;
        Kernel_up_sweep<<<blocks, THREADS_PER_BLOCK>>>(result, threads, stride);
        cudaDeviceSynchronize();
    }
    cudaMemset(result + (n - 1), 0, sizeof(int));
    for (int stride = n; stride >= 2; stride >>= 1) {
        int threads = n / stride, blocks = (threads - 1 + THREADS_PER_BLOCK) / THREADS_PER_BLOCK;
        Kernel_down_sweep<<<blocks, THREADS_PER_BLOCK>>>(result, threads, stride);
        cudaDeviceSynchronize();
    }
}
```

测试结果如下

```-------------------------
Scan Score Table:
-------------------------
-------------------------------------------------------------------------
| Element Count   | Ref Time        | Student Time    | Score           |
-------------------------------------------------------------------------
| 1000000         | 0.968           | 0.999           | 1.25            |
| 10000000        | 10.075          | 8.529           | 1.25            |
| 20000000        | 20.351          | 13.911          | 1.25            |
| 40000000        | 38.031          | 26.655          | 1.25            |
-------------------------------------------------------------------------
|                                   | Total score:    | 5.0/5.0         |
-------------------------------------------------------------------------
```

对于`find_repeats`的实现，我们可以先并行执行得到对于每个`i`是否满足`input[i]==input[i+1]`，这构成了一个布尔序列，对于这个布尔序列做一次并行前缀和，得到此前重复的数的数量，也就是当前数如果重复应该被放入结果序列的位置，按照这个做一次`scatter`即可

```cpp
__global__ void Kernel_if_repeat(int *arrary, int n, int *output) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx + 1 < n) {
        output[idx] = (arrary[idx] == arrary[idx + 1]);
    }
}

__global__ void Kernel_find_repeats(int *flag, int *index, int n, int *output) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx + 1 < n && flag[idx]) {
        output[index[idx]] = idx;
    }
}

int find_repeats(int* device_input, int length, int* device_output) {

    // CS149 TODO:
    //
    // Implement this function. You will probably want to
    // make use of one or more calls to exclusive_scan(), as well as
    // additional CUDA kernel launches.
    //    
    // Note: As in the scan code, the calling code ensures that
    // allocated arrays are a power of 2 in size, so you can use your
    // exclusive_scan function with them. However, your implementation
    // must ensure that the results of find_repeats are correct given
    // the actual array length.
    int n = nextPow2(length);
    int *flag = nullptr, *sum = nullptr;
    cudaMalloc(&flag, sizeof(int) * n);
    cudaMalloc(&sum, sizeof(int) * n);
    int blocks = (n + THREADS_PER_BLOCK - 1) / THREADS_PER_BLOCK;
    Kernel_if_repeat <<<blocks, THREADS_PER_BLOCK>>> (device_input, n, flag);
    cudaDeviceSynchronize();
    cudaMemcpy(sum, flag, sizeof(int) * n, cudaMemcpyDeviceToDevice);
    exclusive_scan(sum, n, sum);
    Kernel_find_repeats <<<blocks, THREADS_PER_BLOCK>>> (flag, sum, n, device_output);
    cudaDeviceSynchronize();
    int cnt;
    cudaMemcpy(&cnt, sum + length - 1, sizeof(int), cudaMemcpyDeviceToHost);
    cudaFree(flag); cudaFree(sum);
    return cnt; 
}
```

测试结果如下

```-------------------------
Find_repeats Score Table:
-------------------------
-------------------------------------------------------------------------
| Element Count   | Ref Time        | Student Time    | Score           |
-------------------------------------------------------------------------
| 1000000         | 1.887           | 2.02            | 1.25            |
| 10000000        | 16.067          | 14.997          | 1.25            |
| 20000000        | 28.853          | 26.017          | 1.25            |
| 40000000        | 56.414          | 50.418          | 1.25            |
-------------------------------------------------------------------------
|                                   | Total score:    | 5.0/5.0         |
-------------------------------------------------------------------------
```

### render

`make`之前需要配置相关的环境

```bash
sudo apt update
sudo apt install freeglut3-dev
```

提供了一个简单渲染器的顺序实现和`cuda`实现，其中`cuda`实现存在错误

在安装`feh`之后，可以通过以下命令运行顺序实现查看渲染结果`./render -r cpuref snow -i`

其中渲染算法维护了多个圆的信息，每个圆有其圆心位置，半径，速度，颜色，透明度(一个$[0,1]$之间的实数)，算法流程如下

```
对于每一帧：
	清空图像
	对于每一个圆：
		更新其位置和速度
	对于每一个圆：
		计算出能包含该圆的正方形
		对于这个正方形内的每一个坐标：
			计算这个坐标的中心
			如果这个中心在圆内：
				计算这个圆在此处的颜色
				使用这个颜色的贡献更新坐标像素上
```

对于像素的贡献算法如下：

```
   result_r = C_alpha * C_r + (1.0 - C_alpha) * P_r
   result_g = C_alpha * C_g + (1.0 - C_alpha) * P_g
   result_b = C_alpha * C_b + (1.0 - C_alpha) * P_b
```

其中`result_r/g/b`表示计算贡献后的像素`rgb`值，`C_alpha`表示圆的透明度，`P_r/g/b`表示此前像素的`rgb`值

注意该贡献算法不满足结合律，即计算出像素的`rgb`值与圆贡献的顺序相关，此渲染器要求贡献顺序为圆输入顺序

提示告诉我们，`cuda`版本的`render`没有满足贡献计算的原子性以及贡献的顺序，需要我们对其进行修改

初始代码贡献计算部分如下

```cpp
__global__ void kernelRenderCircles() {

    int index = blockIdx.x * blockDim.x + threadIdx.x;

    if (index >= cuConstRendererParams.numCircles)
        return;

    int index3 = 3 * index;

    // read position and radius
    float3 p = *(float3*)(&cuConstRendererParams.position[index3]);
    float  rad = cuConstRendererParams.radius[index];

    // compute the bounding box of the circle. The bound is in integer
    // screen coordinates, so it's clamped to the edges of the screen.
    short imageWidth = cuConstRendererParams.imageWidth;
    short imageHeight = cuConstRendererParams.imageHeight;
    short minX = static_cast<short>(imageWidth * (p.x - rad));
    short maxX = static_cast<short>(imageWidth * (p.x + rad)) + 1;
    short minY = static_cast<short>(imageHeight * (p.y - rad));
    short maxY = static_cast<short>(imageHeight * (p.y + rad)) + 1;

    // a bunch of clamps.  Is there a CUDA built-in for this?
    short screenMinX = (minX > 0) ? ((minX < imageWidth) ? minX : imageWidth) : 0;
    short screenMaxX = (maxX > 0) ? ((maxX < imageWidth) ? maxX : imageWidth) : 0;
    short screenMinY = (minY > 0) ? ((minY < imageHeight) ? minY : imageHeight) : 0;
    short screenMaxY = (maxY > 0) ? ((maxY < imageHeight) ? maxY : imageHeight) : 0;

    float invWidth = 1.f / imageWidth;
    float invHeight = 1.f / imageHeight;

    // for all pixels in the bonding box
    for (int pixelY=screenMinY; pixelY<screenMaxY; pixelY++) {
        float4* imgPtr = (float4*)(&cuConstRendererParams.imageData[4 * (pixelY * imageWidth + screenMinX)]);
        for (int pixelX=screenMinX; pixelX<screenMaxX; pixelX++) {
            float2 pixelCenterNorm = make_float2(invWidth * (static_cast<float>(pixelX) + 0.5f),
                                                 invHeight * (static_cast<float>(pixelY) + 0.5f));
            shadePixel(index, pixelCenterNorm, p, imgPtr);
            imgPtr++;
        }
    }
}
```

这是对于每一个圆并行计算对其中像素的贡献，但是由于乱序，会导致结果出错

在串行执行算法中，对每个圆计算和对每个像素计算都具有并行性，但是由于不满足结合律，我们只能考虑后者

一个`trivial`的做法是对于每一个像素运行一个`cuda`线程，依次遍历每一个圆尝试计算贡献

```cpp
__global__ void kernelRenderPixels() {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    int width = cuConstRendererParams.imageWidth, height = cuConstRendererParams.imageHeight;
    if (x >= width || y >= height) return;
    float invwidth = 1.f / width, invheight = 1.f / height; 
    float2 pixelCenterNorm = make_float2(invwidth * (static_cast<float>(x) + 0.5f), invheight * (static_cast<float>(y) + 0.5f));
    float4 *imgPtr = (float4*)(&cuConstRendererParams.imageData[4 * (y * width + x)]);
    for (int i = 0; i < cuConstRendererParams.numCircles; i++) {
        float3 p = *(float3*)(&cuConstRendererParams.position[3 * i]);
        shadePixel(i, pixelCenterNorm, p, imgPtr);
    }
}
```

测试结果如下

```------------
Score table:
------------
--------------------------------------------------------------------------
| Scene Name      | Ref Time (T_ref) | Your Time (T)   | Score           |
--------------------------------------------------------------------------
| rgb             | 0.3232           | 0.2669          | 9               |
| rand10k         | 2.8221           | 39.2085         | 2               |
| rand100k        | 23.3191          | 382.3064        | 2               |
| pattern         | 0.6382           | 5.5301          | 3               |
| snowsingle      | 15.0153          | 343.2084        | 2               |
| biglittle       | 13.4723          | 43.2001         | 5               |
| rand1M          | 154.3743         | 3913.552        | 2               |
| micro2M         | 294.7338         | 7892.6395       | 2               |
--------------------------------------------------------------------------
|                                    | Total score:    | 27/72           |
--------------------------------------------------------------------------
```

实际运行效率比`CPU`串行执行还低（），这是因为更新一个像素需要扫描所有的圆，而实际上许多像素根本不会处在大多数圆内

为了减少冗余计算，可以考虑将整个坐标系分割成多个矩形，若这个矩形和一个圆不相交，那么该矩形中所有像素一定都不在这个圆内

已经为我们提供了`circleInBox`的接口，直接调用即可

```cpp
#define BLOCKX 16
#define BLOCKY 16
#define THREADX 16
#define THREADY 16

__global__ void kernelRenderPixels() {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    int idy = blockIdx.y * blockDim.y + threadIdx.y;
    int width = cuConstRendererParams.imageWidth, height = cuConstRendererParams.imageHeight;
    float invwidth = 1.f / width, invheight = 1.f / height;
    int X0 = idx * THREADX, X1 = X0 + THREADX;
    int Y0 = idy * THREADY, Y1 = Y0 + THREADY; 
    if (X0 >= width || Y0 >= height) return;
    float normX0 = X0 * invwidth, normX1 = X1 * invwidth;
    float normY0 = Y0 * invheight, normY1 = Y1 * invheight;
    int num = cuConstRendererParams.numCircles;
    for (int i = 0; i < num; i++) {
        float cirx = cuConstRendererParams.position[3 * i], ciry = cuConstRendererParams.position[3 * i + 1];
        float cirr = cuConstRendererParams.radius[i];
        if (circleInBox(cirx, ciry, cirr, normX0, normX1, normY1, normY0)) {
            float3 p = *(float3*)(&cuConstRendererParams.position[3 * i]);
            for (int j = Y0; j < Y1; j++) {
                float _y = static_cast <float> (j) + 0.5f; 
                float4* imgPtr = (float4*)(&cuConstRendererParams.imageData[4 * (j * width + X0)]);
                for (int k = X0; k < X1; k++) {
                    float _x = static_cast <float> (k) + 0.5f;
                    shadePixel(i, make_float2(invwidth * _x, invheight * _y), p, imgPtr);
                    ++imgPtr;
                }
            }
        }
    }
}

void
CudaRenderer::render() {

    // 256 threads per block is a healthy number
    dim3 blockDim(THREADX, THREADY);
    dim3 gridDim((image->width + blockDim.x - 1) / blockDim.x, (image->height + blockDim.y - 1) / blockDim.y);

    kernelRenderPixels<<<gridDim, blockDim>>>();
    cudaDeviceSynchronize();
}
```

运行结果如下，效率有了较大提升

```------------
Score table:
------------
--------------------------------------------------------------------------
| Scene Name      | Ref Time (T_ref) | Your Time (T)   | Score           |
--------------------------------------------------------------------------
| rgb             | 0.2807           | 0.8516          | 5               |
| rand10k         | 2.729            | 29.2422         | 2               |
| rand100k        | 23.1492          | 234.5919        | 2               |
| pattern         | 0.6532           | 1.1787          | 6               |
| snowsingle      | 14.8701          | 30.8657         | 6               |
| biglittle       | 13.9142          | 416.6634        | 2               |
| rand1M          | 154.5485         | 523.2159        | 5               |
| micro2M         | 296.6468         | 496.183         | 7               |
--------------------------------------------------------------------------
|                                    | Total score:    | 35/72           |
--------------------------------------------------------------------------
```

但是我们发现这段代码是对于每个`16 * 16`的像素块，都串行地与所有圆判断是否相交，这一部分仍然可以并行化

于是，我们考虑仍然使用一个线程处理每一个像素，但是同时，一个线程块内的线程需要并行地计算这个线程块构成的像素矩阵与每个圆的相交情况，然后计算相交的圆对自己这个线程对应的像素的贡献

在实现上来说，我们采用`__shared__`共享内存来进行线程块内通信，线程块内`16*16=256`个线程每个每次判断像素矩阵是否与一个圆相交，这样得到了一个布尔数组，采用类似第二部分的实现就可以得到相交的圆的数组，然后每个线程再并行的对自己负责的像素依次尝试用这些圆更新即可。注意我们在计算相交的布尔数组处采用了屏障同步，这就使得后256个圆不会先于前256个圆进行计算，进而保证了正确性

```cpp
#define BLOCKX 16
#define BLOCKY 16
#define BLOCKSIZE 256
#define SCAN_BLOCK_DIM   BLOCKSIZE  
#include "exclusiveScan.cu_inl"

__global__ void kernelRenderPixels() {
    __shared__ uint isinside[BLOCKSIZE], insidesum[BLOCKSIZE], tmp[BLOCKSIZE << 1], cir[BLOCKSIZE];
    int width = cuConstRendererParams.imageWidth, height = cuConstRendererParams.imageHeight;
    float invwidth = 1.0f / width, invheight = 1.0f / height;
    int X0 = blockIdx.x * BLOCKX, X1 = min(X0 + BLOCKX, width);
    int Y0 = blockIdx.y * BLOCKY, Y1 = min(Y0 + BLOCKY, height);
    float normX0 = X0 * invwidth, normX1 = X1 * invwidth;
    float normY0 = Y0 * invheight, normY1 = Y1 * invheight;
    int threadid = threadIdx.y * BLOCKX + threadIdx.x;
    int num = cuConstRendererParams.numCircles; 
    int pixelx = X0 + threadIdx.x;
    int pixely = Y0 + threadIdx.y;
    float2 pixel = make_float2(invwidth * (static_cast<float>(pixelx) + 0.5f), invheight * (static_cast <float>(pixely) + 0.5f));
    float4 *imgPtr = (float4*)(&cuConstRendererParams.imageData[4 * (pixely * width + pixelx)]);
    for (int _i = 0; _i < num; _i += BLOCKSIZE) {
        int i = _i + threadid;
        if (i < num) {
            float cirx = cuConstRendererParams.position[3 * i], ciry = cuConstRendererParams.position[3 * i + 1];
            float cirr = cuConstRendererParams.radius[i];
            isinside[threadid] = circleInBox(cirx, ciry, cirr, normX0, normX1, normY1, normY0);            
        }
        else isinside[threadid] = 0;

        __syncthreads();
        sharedMemExclusiveScan(threadid, isinside, insidesum, tmp, BLOCKSIZE); 
        if (isinside[threadid]) {
            cir[insidesum[threadid]] = i;
        }
        __syncthreads();
        if (pixelx < width && pixely < height) {
            int cirnum = insidesum[BLOCKSIZE - 1] + isinside[BLOCKSIZE - 1];
            for (int j = 0; j < cirnum; j++) {
                int ciridx = cir[j];
                float3 p = *(float3*)(&cuConstRendererParams.position[ciridx * 3]);
                shadePixel(ciridx, pixel, p, imgPtr);
            }               
        }
    }
}

void
CudaRenderer::render() {

    // 256 threads per block is a healthy number
    dim3 blockDim(BLOCKX, BLOCKY);
    dim3 gridDim((image->width + blockDim.x - 1) / blockDim.x, (image->height + blockDim.y - 1) / blockDim.y);

    kernelRenderPixels<<<gridDim, blockDim>>>();
    cudaDeviceSynchronize();
}

```

测试结果如下

```------------
Score table:
------------
--------------------------------------------------------------------------
| Scene Name      | Ref Time (T_ref) | Your Time (T)   | Score           |
--------------------------------------------------------------------------
| rgb             | 0.4447           | 0.4018          | 9               |
| rand10k         | 3.3763           | 3.7078          | 9               |
| rand100k        | 28.7109          | 32.373          | 9               |
| pattern         | 0.5684           | 0.5763          | 9               |
| snowsingle      | 20.157           | 18.984          | 9               |
| biglittle       | 13.8375          | 32.426          | 5               |
| rand1M          | 153.9384         | 153.1018        | 9               |
| micro2M         | 295.5285         | 288.3962        | 9               |
--------------------------------------------------------------------------
|                                    | Total score:    | 68/72           |
```


