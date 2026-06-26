# 侧栏组件开发指南

> 本文档记录当前仓库的侧栏 widget 接口。当前实现已经合并为统一渲染入口，不再需要分别维护左侧栏、右侧栏和抽屉的多个 `componentMap`。

## 适用范围

- 新增或重构侧栏组件。
- 调整 `src/config/sidebarConfig.ts` 中的组件布局。
- 接入 `toc`、`card-toc` 这类需要文章标题数据的组件。
- 排查“配置了组件但页面不显示”的问题。

## 当前渲染模型

核心链路：

```text
src/config/sidebarConfig.ts
  -> widgetManager.getComponentsByPosition(...)
  -> src/components/layout/SidebarColumn.astro
  -> src/utils/widget-renderer.ts buildComponentProps(...)
  -> 实际 widget 组件
```

`SidebarColumn.astro` 同时服务左侧栏、右侧栏和抽屉侧栏。组件注册只需要在这个文件的 `componentMap` 中完成。

## 接入步骤

### 1. 声明组件类型

文件：`src/types/config.ts`

在 `WidgetComponentType` 中加入新类型：

```ts
export type WidgetComponentType =
  | "profile"
  | "announcement"
  | "categories"
  | "tags"
  | "toc"
  | "card-toc"
  | "music-player"
  | "music-sidebar"
  | "pio"
  | "site-stats"
  | "calendar"
  | "custom"
  | "my-widget";
```

缺少这一步时，`sidebarConfig.ts` 中的配置无法通过 TypeScript 类型检查。

### 2. 配置组件属性和布局

文件：`src/config/sidebarConfig.ts`

`properties` 描述组件属性，`components` 描述每个区域展示哪些组件以及顺序：

```ts
export const sidebarLayoutConfig: SidebarLayoutConfig = {
  properties: [
    {
      type: "my-widget",
      position: "sticky",
      class: "onload-animation",
      animationDelay: 200,
    },
  ],
  components: {
    left: ["profile", "announcement", "tags", "card-toc", "my-widget"],
    right: ["site-stats", "calendar", "categories", "music-sidebar"],
    drawer: ["profile", "announcement", "music-sidebar", "categories", "tags"],
  },
  // ...
};
```

规则：

- `position: "top"` 进入普通纵向区域。
- `position: "sticky"` 进入粘性区域。
- `components.left/right/drawer` 决定组件是否显示和显示顺序。
- `responsive.hidden`、`collapseThreshold`、`customProps` 等属性由 `widgetManager` 和 `buildComponentProps` 继续处理。

### 3. 注册组件实现

文件：`src/components/layout/SidebarColumn.astro`

新增 import，并在 `componentMap` 中注册：

```astro
---
import MyWidget from "../widgets/my-widget/MyWidget.astro";

const componentMap: Record<string, unknown> = {
  profile: Profile,
  announcement: Announcement,
  categories: Categories,
  tags: Tags,
  toc: SidebarTOC,
  "card-toc": CardTOC,
  "music-player": MusicPlayer,
  "music-sidebar": MusicSidebarWidget,
  "site-stats": SiteStats,
  calendar: Calendar,
  "my-widget": MyWidget,
};
---
```

`componentMap` 没有注册时，该类型会被忽略。

### 4. 处理特殊 props

文件：`src/utils/widget-renderer.ts`

默认 props 包含：

```ts
{
  class: componentClass,
  style: componentStyle,
  ...component.customProps,
}
```

当前特殊逻辑：

```ts
if ((component.type === "toc" || component.type === "card-toc") && headings) {
  props.headings = headings;
}
```

如果新 widget 需要文章数据、运行时配置或不同设备下的派生 props，应在这里集中处理，避免把同一套 props 组装逻辑散落到多个布局组件。

## TOC / 目录组件接口

当前有两种侧栏目录类型：

| 类型 | 组件 | 说明 |
| --- | --- | --- |
| `toc` | `SidebarTOC` | Web Component 版传统侧栏目录 |
| `card-toc` | `CardTOC` | 使用 `WidgetLayout` 包装的卡片式目录，当前默认放在左侧栏 |

TOC 总配置在 `src/config/siteConfig.ts`：

```ts
toc: {
  enable: true,
  mobileTop: true,
  desktopSidebar: true,
  floating: true,
  depth: 3,
  useJapaneseBadge: false,
}
```

约束：

- `depth` 当前类型为 `1 | 2 | 3`。
- 实际过滤规则是“从文章最浅标题开始显示连续 `depth` 层”，不是固定 `h1-h3`。
- 标题 id 依赖 `astro.config.mjs` 中的 `rehypeSlug`。
- `ConfigCarrier.astro` 会把配置写入 `window.siteConfig.toc`，客户端 TOC 从这里读运行时配置。
- `CardTOC` 使用 `src/utils/tocManager.ts`，通过 `WeakMap` 支持多个目录实例。

## 常见问题排查

### 配置了组件但页面不显示

按顺序检查：

1. `src/types/config.ts` 的 `WidgetComponentType` 是否包含该类型。
2. `src/config/sidebarConfig.ts` 的 `properties` 是否有该组件。
3. `sidebarLayoutConfig.components.left/right/drawer` 是否包含该类型。
4. `src/components/layout/SidebarColumn.astro` 的 `componentMap` 是否注册组件。
5. 当前断点下是否被 `responsive.hidden` 或布局条件隐藏。
6. 组件自身是否有 `enable`、空数据、客户端初始化失败等条件。

### TOC 不显示标题

优先检查：

1. 页面是否有 `#post-container` 或 `.custom-md` / `.prose` / `.markdown-content` 正文容器。
2. 标题是否带有 id，通常由 `rehypeSlug` 生成。
3. `siteConfig.toc.enable` 是否为 `true`。
4. `depth` 是否过滤掉了较深标题。
5. 加密文章解密后是否触发了 `password:decrypted` 事件，`CardTOC` 会监听该事件重新初始化。

### Svelte widget 访问 `window` 报错

Svelte 组件在 SSR 阶段不能直接访问浏览器对象。需要浏览器环境的组件应使用 `onMount` 包裹访问，或在 Astro 使用合适的 `client:*` 指令。

## 代码审查检查清单

- [ ] `WidgetComponentType` 已声明新类型。
- [ ] `sidebarConfig.ts` 的 `properties` 和目标区域数组都已配置。
- [ ] `SidebarColumn.astro` 的 `componentMap` 已注册组件。
- [ ] 特殊 props 已集中放在 `buildComponentProps` 中。
- [ ] Svelte 组件没有在 SSR 顶层访问 `window` / `document`。
- [ ] TOC 相关改动同步检查 `siteConfig.toc`、`ConfigCarrier.astro`、`toc-utils.ts` 和 `tocManager.ts`。

## 文件速查

| 文件 | 作用 |
| --- | --- |
| `src/types/config.ts` | `WidgetComponentType`、`SidebarLayoutConfig`、`SiteConfig.toc` 类型 |
| `src/config/sidebarConfig.ts` | 侧栏组件属性、区域和顺序 |
| `src/components/layout/SidebarColumn.astro` | 统一侧栏渲染入口和 `componentMap` |
| `src/utils/widget-renderer.ts` | class/style/customProps/headings 的 props 组装 |
| `src/components/features/toc/` | Sidebar、Floating、Mobile TOC 实现 |
| `src/components/widgets/card-toc/` | 卡片式目录 widget |
| `src/utils/tocManager.ts` | CardTOC 客户端目录管理逻辑 |
