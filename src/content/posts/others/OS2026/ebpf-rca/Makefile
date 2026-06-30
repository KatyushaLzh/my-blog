APP      := ebpf-rca
BPF_SRC  := bpf/cpu.bpf.c
VMLINUX  := bpf/vmlinux.h

.PHONY: all build generate vmlinux deps bench clean

all: build

## 生成 vmlinux.h（CO-RE 前提，需 bpftool 与内核 BTF）
vmlinux:
	bpftool btf dump file /sys/kernel/btf/vmlinux format c > $(VMLINUX)

## 由 .bpf.c 生成 CO-RE 字节码与 Go 加载器（需 clang/llvm）
generate:
	go generate ./...

## 编译用户态二进制
build: generate
	mkdir -p bin
	CGO_ENABLED=0 go build -o bin/$(APP) ./cmd/$(APP)

## 安装构建依赖（openKylin / Debian 系）
deps:
	sudo apt-get update
	sudo apt-get install -y clang llvm libbpf-dev linux-tools-common bpftool make golang stress-ng fio

## 性能开销基准（全部场景），结果写入 bench.md
bench: build
	bash scripts/benchmark.sh all bench.md

clean:
	rm -f bin/$(APP) internal/collector/cpu_bpfel.go internal/collector/cpu_bpfeb.go \
	      internal/collector/cpu_bpfel.o internal/collector/cpu_bpfeb.o
