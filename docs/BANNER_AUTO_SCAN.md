# Banner 自动扫描文件夹

## 概述

传统方式需要手动在 `siteConfig.ts` 的 `banner.src.desktop` / `banner.src.mobile` 中逐一列举图片路径。`autoScan` 功能允许你直接将图片放入 `public` 目录下的文件夹，构建时自动扫描并生成路径列表，省去手动维护配置。

## 目录

- [概述](#概述)
- [快速上手](#快速上手)
- [配置项](#配置项)
- [运行时架构](#运行时架构)
- [优先级链](#优先级链)
- [图片规格建议](#图片规格建议)
- [容错与安全性](#容错与安全性)

---

## 快速上手

### 1. 将图片放入对应文件夹

```
public/
  assets/
    desktop-banner/    ← 桌面端横幅图片（横版）
      1.webp
      2.webp
      3.webp
    mobile-banner/     ← 移动端横幅图片（竖版）
      1.webp
      2.webp
      ...
```

### 2. 在 `siteConfig.ts` 启用自动扫描

```ts
// src/config/siteConfig.ts
banner: {
  src: { /* ... 保留但不生效，自动扫描优先 */ },

  autoScan: {
    enable: true,
  },

  // ...
}
```

不需要再维护 `src.desktop` / `src.mobile` 数组。构建时 `getBannerImages()` 会自动扫描 `public/assets/desktop-banner/` 和 `public/assets/mobile-banner/`。

---

## 配置项

类型定义位于 `src/types/config.ts:143-148`：

```ts
autoScan?: {
  enable: boolean;           // 总开关，默认 false
  desktopDir?: string;       // 桌面端图片目录（相对项目根目录）
  mobileDir?: string;        // 移动端图片目录
  extensions?: string[];     // 扫描的图片扩展名
};
```

默认值（定义在 `src/utils/grid-layout-utils.ts:275-279`）：

| 配置项 | 默认值 |
|---|---|
| `enable` | `false` |
| `desktopDir` | `"public/assets/desktop-banner"` |
| `mobileDir` | `"public/assets/mobile-banner"` |
| `extensions` | `[".webp", ".jpg", ".jpeg", ".png", ".avif"]` |

### 自定义示例

```ts
autoScan: {
  enable: true,
  desktopDir: "public/my-banners/desktop",
  mobileDir: "public/my-banners/mobile",
  extensions: [".webp", ".avif"],
}
```

---

## 运行时架构

核心实现在 `src/utils/grid-layout-utils.ts`，涉及 2 个函数：

### `scanBannerDirectory(dirRelative, extensions)` → `string[]`

服务端构建时执行，使用 `node:fs` + `node:path`：

1. **路径解析**：`dirRelative`（如 `"public/assets/desktop-banner"`）→ `path.resolve(cwd, dirRelative)` 得到绝对路径
2. **存在性检查**：目录不存在时输出 `[autoScan]` 警告，返回空数组
3. **扩展名过滤**：只保留匹配 `extensions` 中任一扩展名的文件
4. **自然排序**：使用 `localeCompare({ numeric: true })` 确保 `2.webp` < `10.webp`
5. **URL 转换**：文件系统路径 → public URL（`"public/assets/desktop-banner/1.webp"` → `"/assets/desktop-banner/1.webp"`）

排序后的路径数组直接传递给 `Banner.astro`，逻辑完全复用现有轮播管道。

### `getBannerImages(siteConfig)` → `Promise<BannerImages>`

调用链路：`MainGridLayout.astro:46` → `getBannerImages()` → `Banner.astro:36`

```
MainGridLayout.astro (SSR)
  │
  └─ getBannerImages(siteConfig)
       │
       ├─ [1] imageApi 远程获取（最高优先）
       │
       ├─ [2] autoScan 本地扫描
       │      └─ scanBannerDirectory(desktopDir, exts)
       │      └─ scanBannerDirectory(mobileDir, exts)
       │      └─ 互备：desktop 为空→用 mobile，反之亦然
       │
       └─ [3] src 手动配置（回退）
```

扫描到图片后，`getBannerImages()` 返回 `{ desktop: string[], mobile: string[] }`，后续 `Banner.astro` 检测 `length > 1` 即自动启用 Ken Burns + Crossfade 轮播。

---

## 优先级链

`getBannerImages()` 内部三级优先级：

| 优先级 | 来源 | 说明 |
|---|---|---|
| 1 | `imageApi` | 远程 PicFlow API，返回每行一个图片 URL |
| 2 | `autoScan` | 本地目录自动扫描（本次新增） |
| 3 | `banner.src` | 手动配置（传统方式） |

**互斥行为**：`autoScan` 扫描到至少 1 张图片后直接返回，不继续走手动配置。若扫描结果为空（目录不存在或无匹配文件），则回退到手动配置。

---

## 图片规格建议

Banner 使用 `object-fit: cover` + `sizes="100vw"`（`src/components/layout/Banner.astro:102-103`）。Ken Burns 动画有 `scale(1.03)` → `scale(1.13)` 的缩放。

| 端 | 推荐宽度 | 推荐比例 | 格式 | 建议文件大小 |
|---|---|---|---|---|
| **Desktop** | ≥ 2560px（2x Retina） | 16:9 或更宽 | `.webp` | ≤ 500KB |
| **Mobile** | ≥ 1536px（2x Retina） | 9:16 竖屏 | `.webp` | ≤ 300KB |

命名建议使用自然数字编号（`1.webp`, `2.webp`, …, `10.webp`），排序预期正确。

---

## 容错与安全性

- **目录不存在**：`console.warn` + 返回空数组，不影响构建
- **权限错误**：`try/catch` 包裹 `fs.readdirSync`，警告后回退
- **空目录**：返回空数组，回退到手动 `src` 配置
- **非图片文件**：扩展名过滤，不会误读 `.DS_Store` 等元文件
- **只读**：`getBannerImages` 不写文件，纯读取扫描
