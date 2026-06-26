# Katyusha's Blog

<img align="right" src="logo.png" width="180" alt="Katyusha blog logo">

一个基于  的静态博客项目，模板采用[Mizuki]([Mizuki Next Theme](https://docs.mizuki.mysqil.com/))，同时由agent加入了目录树，`zsh shell`等改进

用来承载我的技术笔记、课程总结、实验记录和长期内容工程实践。

这个仓库不是通用模板展示页，而是我自己的博客源码仓库。内容方向以系统、并发、性能、C++、等技术主题为主

![Preview](./README.png)

## 项目定位

- 博客本体：用于发布长期维护的技术文章、课程笔记和实验复盘。
- 内容风格：偏机制解释、实现分析、边界条件、复杂度和性能推理。
- 工程目标：在保持静态站点部署简单性的前提下，提供足够强的内容组织、搜索、展示和可扩展能力。

## 技术栈

- 框架：`Astro 6.4.6`
- 语言：`TypeScript` / `JavaScript`
- 组件：`Svelte 5`
- 样式：`Tailwind CSS 4` + `Stylus`
- 搜索：`Pagefind`
- Markdown 增强：`remark` / `rehype` / `KaTeX` / `Expressive Code`
- 动画与切页：`Swup`
- 图片与弹窗：`sharp` / `PhotoSwipe` / `@fancyapps/ui`
- 代码质量：`Biome`

## 这个仓库里有什么

- 技术文章与课程笔记
  - `src/content/posts/CSAPP/`
  - `src/content/posts/NJU OS/`
  - `src/content/posts/CS149/`
  - `src/content/posts/modern C++/`
- 站点页面
  - `src/pages/`
- 全局配置
  - `src/config/`
- 组件系统
  - `src/components/`
- 内容渲染与工具逻辑
  - `src/plugins/`
  - `src/utils/`
- 静态资源
  - `public/`
  - `src/assets/`

## 核心能力

- 静态生成博客，部署简单，运行时负担小。
- 文章、标签、分类、归档、RSS 等标准博客能力完整。
- 基于 `Pagefind` 的本地全文搜索。
- 基于 `Expressive Code` 的代码块增强，包括更强的展示与阅读体验。
- 支持数学公式、Mermaid、GitHub 风格提示块等 Markdown 扩展。
- 提供相册、番剧、友链、设备、日记等扩展页面。
- 支持评论、分享图、Live2D、动态背景、侧边栏组件化配置等个性化功能。
- 构建阶段自动执行部分内容更新与索引生成流程。

## 目录结构

```text
.
├─ src/
│  ├─ components/      # 页面与功能组件
│  ├─ config/          # 站点配置、侧边栏配置、评论配置等
│  ├─ content/         # 博客正文与专题内容
│  ├─ pages/           # Astro 路由页面
│  ├─ plugins/         # Markdown / rehype / remark 扩展
│  ├─ scripts/         # 前端运行期脚本
│  └─ utils/           # 数据处理、路由、渲染辅助逻辑
├─ public/             # 直接输出到静态站点的资源
├─ scripts/            # 构建前后与内容同步脚本
├─ docs/               # 项目规则、迁移说明、部署说明
└─ tests/              # 部分工具函数测试
```

## 本地开发

### 依赖要求

- `Node.js >= 22`
- `pnpm >= 9`

### 安装

```bash
pnpm install
```

### 启动开发环境

```bash
pnpm dev
```

默认地址：

```text
http://localhost:4321
```

### 常用命令

```bash
pnpm dev          # 启动本地开发服务器
pnpm build        # 生产构建 + Pagefind 索引 + 字体压缩
pnpm preview      # 本地预览构建产物
pnpm check        # Astro 检查
pnpm type-check   # TypeScript 类型检查
pnpm lint         # 使用 Biome 检查并修复
pnpm format       # 使用 Biome 格式化
pnpm new-post xxx # 创建新文章
```

## 构建链路

`pnpm build` 不只是把页面编译出来，它还串联了几步内容工程动作：

1. 运行 `scripts/update-anime.mjs`
2. 执行 `astro build`
3. 对 `dist/` 生成 `Pagefind` 搜索索引
4. 运行 `scripts/compress-fonts/index.js` 压缩字体资源

如果你要改构建行为，优先看：

- [package.json](/C:/Users/Lenovo/Desktop/katyusha-blog/Mizuki/package.json)
- `scripts/`
- `src/plugins/`

## 主要配置入口

- 站点基础信息：`src/config/siteConfig.ts`
- 导航栏：`src/config/navBarConfig.ts`
- 侧边栏：`src/config/sidebarConfig.ts`
- 个人资料：`src/config/profileConfig.ts`
- 评论系统：`src/config/commentConfig.ts`
- 音乐播放器：`src/config/musicConfig.ts`
- Live2D：`src/config/pioConfig.ts`

如果只是改“博客长什么样”，通常不需要碰页面组件，先看 `src/config/` 即可。

## 内容组织约定

- 常规文章放在 `src/content/posts/`
- 专题内容按主题分目录，而不是堆在一个平面目录下
- 独立页面内容放在 `src/content/spec/`
- 资源优先跟随内容或按公共资源归档，避免无结构堆放

这套组织方式的目标很直接：让“内容规模增长”不会迅速拖垮维护成本。

## 部署

这是标准静态站点，可以部署到任意静态托管平台：

- Vercel
- Netlify
- Cloudflare Pages
- GitHub Pages

部署前至少确认两件事：

1. 站点 URL 配置正确
2. 需要的环境变量在平台侧配置完成，而不是直接把 `.env` 提交进仓库

## 适合谁参考

如果你只是想找一个开箱即用的 Astro 模板，这个仓库未必是最轻的起点；它已经带了不少我自己的内容结构和功能偏好。

但如果你也在做下面这类事情，这个仓库会更有参考价值：

- 想把博客当作长期知识库维护，而不是一次性展示页
- 想同时写技术文章、课程笔记、实验代码和生活页面
- 想保留静态站点的简单部署模型，但又需要更强的内容组织能力
- 想研究 Astro 博客里搜索、Markdown 扩展、组件化页面和构建脚本如何协同

## 致谢与来源

本项目基于开源博客生态继续演化，历史上参考过这些项目的设计与实现思路：

- [Fuwari](https://github.com/saicaca/fuwari)
- [Yukina](https://github.com/WhitePaper233/yukina)
- [Firefly](https://github.com/CuteLeaf/Firefly)
- [Twilight](https://github.com/spr-aachen/Twilight)
- [Pio](https://github.com/Dreamer-Paul/Pio)

同时保留了上游项目所要求的许可证与版权说明，详见：

- `LICENSE`
- `LICENSE.MIT`

## License

本仓库遵循 `Apache-2.0`，并保留上游依赖与衍生来源要求的相关许可证文件。
