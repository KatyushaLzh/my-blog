# 当前接口速查

本文档记录本仓库相对上游 Mizuki 的当前接口。实现变更后应优先同步本文档，再同步 `docs/rule/` 下的开发规范。

## 目录树 / TOC

当前 TOC 不是单一组件，而是 4 个入口共用标题提取与深度规则：

| 入口 | 文件 | 用途 |
| --- | --- | --- |
| `SidebarTOC` | `src/components/features/toc/SidebarTOC.astro` | 右侧栏或传统 `toc` widget |
| `CardTOC` | `src/components/widgets/card-toc/CardTOC.astro` | 卡片式侧栏目录，当前默认放在左侧栏 |
| `MobileTOC` | `src/components/features/toc/MobileTOC.svelte` | 移动端顶部按钮和面板 |
| `FloatingTOC` | `src/components/features/toc/FloatingTOC.astro` | 悬浮目录按钮和面板 |

统一配置位于 `src/config/siteConfig.ts`：

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

类型定义在 `src/types/config.ts` 的 `SiteConfig.toc` 中。当前 `depth` 类型为 `1 | 2 | 3`；如果要支持 4-6 级目录，必须先扩展类型，再检查 `generateTOCItems`、移动端缩进和卡片式目录样式。

标题来源：

- 页面路由通过 Astro `render(entry)` 得到 `headings`，并传给布局和侧栏。
- 客户端 TOC 运行时从 `#post-container` 或正文容器提取 `h1[id]` 到 `h6[id]`。
- `rehypeSlug` 和 `rehypeAutolinkHeadings` 在 `astro.config.mjs` 中负责标题 id 与锚点。
- `ConfigCarrier.astro` 把 `siteConfig.toc` 写入 `window.siteConfig.toc`，客户端工具函数从这里读配置。

过滤规则由 `src/components/features/toc/utils/toc-utils.ts` 的 `generateTOCItems` 实现：

```ts
const minLevel = getMinLevel(headings);
return headings.filter((h) => h.level < minLevel + config.depth);
```

也就是说 `depth=3` 表示从文章中最浅标题开始，显示连续 3 层标题，而不是固定只显示 `h1-h3`。

`CardTOC` 额外使用 `src/utils/tocManager.ts`。它支持多个实例，通过 `WeakMap` 记录每个 `[data-card-toc-root]` 对应的 manager，避免隐藏断点实例污染可见实例。

## 侧栏组件接口

侧栏组件的真实渲染入口是 `src/components/layout/SidebarColumn.astro`。新增 widget 时按这条链路接入：

1. 在 `src/types/config.ts` 的 `WidgetComponentType` 增加类型。
2. 在 `src/config/sidebarConfig.ts` 的 `properties` 增加组件属性。
3. 在 `sidebarLayoutConfig.components.left/right/drawer` 中放入组件类型，决定位置和顺序。
4. 在 `src/components/layout/SidebarColumn.astro` 的 `componentMap` 注册组件实现。
5. 如组件需要特殊 props，在 `src/utils/widget-renderer.ts` 的 `buildComponentProps` 中补齐。

`toc` 和 `card-toc` 是特殊类型：`buildComponentProps` 会把页面传入的 `headings` 继续传给组件。

当前内置侧栏类型：

```ts
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
```

## Shiki / 代码高亮

生产文章代码高亮使用 `astro-expressive-code`，底层高亮由 Expressive Code / Shiki 完成，不使用编辑器里的 `highlight.js`。

相关文件：

| 文件 | 作用 |
| --- | --- |
| `astro.config.mjs` | 注册 `expressiveCode()` 集成 |
| `ec.config.mjs` | 配置 Shiki 主题、行号、折叠区块、样式覆盖 |
| `src/plugins/expressive-code/language-badge.js` | 给代码块增加 `data-language` 语言角标 |
| `src/plugins/expressive-code/custom-copy-button.js` | 注入自定义复制按钮 |
| `src/config/expressiveCodeConfig.ts` | 站点级代码块行为配置 |
| `src/components/misc/ConfigCarrier.astro` | 向客户端暴露代码块主题切换相关配置 |

当前 `ec.config.mjs` 的核心约束：

- 主题：`github-light` 和 `github-dark`。
- 默认开启自动换行：`defaultProps.wrap = true`。
- `shellsession` 默认关闭行号。
- `bash` / `shell` / `sh` / `zsh` 使用 `frame: "code"`。
- 内置复制按钮关闭，复制按钮由 `pluginCustomCopyButton()` 提供。

`docs/editor/` 是独立的文档编辑器预览工具，仍使用 `highlight.js` 做浏览器端预览；它不代表站点文章构建接口。

## Markdown 处理链

`astro.config.mjs` 中当前 Markdown 处理链：

- remark：`remarkMath`、`remarkContent`、GitHub admonition 修正、directive、sectionize、Mermaid 预处理。
- rehype：KaTeX、外链属性、slug、表格包裹、Mermaid、`rehype-components`、标题自动锚点、图片宽度处理。

自定义 Markdown 能力包括：

- GitHub 风格 admonition 修正。
- `::::note` / `::::tip` / `::::important` / `::::warning` / `::::caution`。
- `:::github{repo="owner/repo"}`。
- Mermaid 代码块转图表容器。
- `<!--more-->` 摘要分隔。

## PostCard / FolderCard

文章列表当前分成两类卡片：

| 卡片 | 文件 | 用途 |
| --- | --- | --- |
| `PostCard` | `src/components/features/posts/PostCard.astro` | 普通文章卡片，封面来自文章 frontmatter 的 `image` |
| `FolderCard` | `src/components/features/posts/FolderCard.astro` | 目录卡片，用于首页和目录页里的子目录入口 |

目录卡片的封面解析规则在 `src/utils/category-tree.ts` 的 `getCategoryCardMeta()` 中：

- 只对 `posts/` 根目录以外的目录卡片生效。
- 只检查当前目录下是否存在 `cover.jpg`、`cover.png`、`cover.webp`。
- 命中后返回相对目录的本地图片路径，由 `FolderCard` 交给 `Image.astro` 渲染。
- 如果当前目录没有这些文件，目录卡片保持无封面样式。
- 不会从子文章 frontmatter 的 `image` 字段回推目录封面，也不会递归查找子目录图片。

当前首页和目录页都通过 `getCategoryCardMeta()` 生成目录卡片数据：

- 首页入口：`src/pages/index.astro`
- 目录页入口：`src/pages/posts/[...slug].astro`

## Blog Terminal / Shell

首页和目录页在路径提示下方、文件夹/文章/代码文件列表上方渲染模拟 zsh 终端。

相关文件：

| 文件 | 作用 |
| --- | --- |
| `src/components/features/posts/BlogTerminal.astro` | 终端 UI，包含 powerline prompt、输入框和嵌入的虚拟文件系统 JSON |
| `src/scripts/blog-terminal.ts` | 客户端 shell 状态机，处理命令、历史、Tab 补全、Swup 重挂载 |
| `src/utils/terminal-fs.ts` | 构建虚拟文件系统，把目录树、文章和代码文件映射成目录/文件节点 |
| `src/pages/index.astro` | 首页终端入口，当前目录为 `/` |
| `src/pages/posts/[...slug].astro` | 目录页终端入口，当前目录为对应 `/path` |
| `src/layouts/MainGridLayout.astro` | 全站加载 `blog-terminal.ts`，保证 Swup 切页后可重新初始化 |

路径规则：

- 虚拟路径统一使用 POSIX 风格，以 `/` 为根目录。
- prompt 直接显示 `/`、`/csapp` 这类路径；不把根目录显示成 `~`。
- `~` 仅作为用户输入别名，`cd ~` 等价于 `cd /`，`~/foo` 等价于 `/foo`。
- 路径匹配大小写不敏感，显示名保留构建出的节点名。

命令行为：

- 支持 `ls`、`pwd`、`cat`、`cd`、`clear`，不支持管道、重定向和选项。
- `ls [path]` 横向输出当前目录的直接子项；目录以蓝色 `name/` 显示，空间不足自动换行。
- `cd [path]` 只接受目录；成功后更新终端 cwd，并用 Swup 优先导航到对应目录页。
- `cat <file>` 只接受文件；输出文章/代码文件元信息，然后导航到对应页面。
- 首次没有 terminal session 时输出英文帮助：支持命令、Tab 补全和上下键历史。

状态和交互：

- 状态保存在 `sessionStorage` 的 `mizuki:blog-terminal:v1`，包含 `cwd`、`output`、`history`。
- 首次帮助输出由 `localStorage` 的 `mizuki:blog-terminal:intro-seen` 控制；同一浏览器看过后不重复显示。
- `clear` 只清空输出，保留 cwd 和历史；清空状态会持久到当前 session。
- 首页/目录页终端初始化后会自动聚焦输入框；Swup 切入目录页后也会重新初始化并聚焦。
- 直接打开目录页时，cwd 会同步为该目录路径，但历史和已有输出保留。
- 终端命令触发的 `cd` / `cat` 导航会在跳转前记录 `window.scrollY` 到 `sessionStorage` 的 `mizuki:blog-terminal:preserved-scroll-y`，新页面显示后恢复相同的顶部距离；普通页面链接不走这条逻辑。

## 文档同步规则

当实现改动涉及接口时，同步顺序：

1. 类型或配置：更新 `src/types/config.ts`、`src/config/*` 对应说明。
2. 组件接入：更新 `docs/CURRENT_INTERFACES.md` 和 `docs/rule/06-sidebar-widget-dev.md`。
3. 目录结构变化：更新 `docs/rule/03-file-organization-architecture.md` 的当前结构说明。
4. Markdown / 代码块行为变化：更新本文档的 Shiki 与 Markdown 处理链章节。
