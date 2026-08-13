# MathALL 

MathALL是一个现代化的、交互式的数学与几何学习和探索工具。通过结合强大的大语言模型（LLM）与 GeoGebra 的绘图能力，它能够将自然语言的数学问题转化为动态的几何图形与代码实现。

## 核心特性

- **智能多模态 AI 驱动**
  - 支持多模型切换（内置支持 DeepSeek、GPT-4o、Claude-3.5-Sonnet，支持自定义 OpenAI 兼容 API）。
  - 支持文字与图片双重输入（可直接粘贴截图或拖拽图片），AI 自动分析并生成构建代码。
  - 智能流式输出与 Markdown / LaTeX 公式渲染，解析步骤清晰可见。

- **深度集成的 GeoGebra 引擎**
  - 无缝嵌入 GeoGebra（支持 Classic 2D 与 3D 模式无缝切换）。
  - 支持直接执行 GGB 指令代码。
  - 支持随时通过拖拽导入 `.ggb` 文件恢复现场。

- **动态参数与控制系统**
  - 提取代码中的关键变量，自动生成滑块（Sliders）进行交互式控制。
  - 支持实时拖动、自动播放动画（正向/往复运动），以直观方式观察轨迹与极值变化。
  - 允许导出/导入参数 `.json` 配置文件。

- **极致的现代化 UI 与移动端体验**
  - 全局采用 Apple / Google Maps 风格的 **Glassmorphism（毛玻璃）** 视效设计与动态微交互。
  - **移动端专属优化 (Overlay UI)**：画板全屏沉浸式铺满，面板与聊天框采用底部滑动抽屉（Bottom Sheet）和悬浮栏设计，大幅提升移动端操作体验。
  - 支持浅色/深色（Dark Mode）模式自由切换。

## 快速开始

本项目基于 [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/) 构建。

### 1. 环境准备
请确保您的环境中已安装了 [Node.js](https://nodejs.org/) 和 [pnpm](https://pnpm.io/)。

### 2. 安装依赖
```bash
pnpm install
```

### 3. 本地开发运行
```bash
pnpm run dev
```
运行后，打开终端中提示的本地地址（如 `http://localhost:5173`）即可访问。

### 4. 生产环境构建
```bash
pnpm run build
```
打包输出将保存在 `dist/` 目录中。

## 部署到 Vercel

1. 在 [Vercel](https://vercel.com) 导入本 GitHub 仓库。
2. 框架预设选 Vite；Build Command 为 pnpm build，Output Directory 为 dist（一般会自动检测）。
3. 无需配置环境变量。用户在「设置」中自行添加模型与 API Key，凭据只存在浏览器 localStorage。
4. 部署后内置代理（builtin）可用，与本地开发相同路径；刷新或深链到 /settings 不会 404。

## 使用指南

1. **设置 API Key**：首次进入系统，点击左下角的设置齿轮，配置您的 API 接口地址、模型名称与 API Key（所有数据仅在本地 localStorage 留存）。
2. **输入题目**：在顶部或底部的输入框中输入您的几何题目，或者直接将题目截图粘贴（Ctrl+V）/ 拖入窗口。
3. **分析与生成**：点击“分析与生成”按钮，AI 会流式输出解题思路并自动调用 GeoGebra 构建图形。
4. **参数交互**：在“控制测算”面板中，您可以看到代码中提取出的变量。拖动滑块即可实时控制图形变化，也可以点击播放按钮开启自动动画。

## 技术栈

- **框架**: React 18
- **语言**: TypeScript
- **构建工具**: Vite
- **样式**: Vanilla CSS (CSS Variables, Flexbox, CSS Grid)
- **核心组件**: GeoGebra JS
- **图标**: Lucide React
- **Markdown / Math**: react-markdown, remark-math, rehype-katex

## 许可证
[Apache 2.0 License](./LICENSE)
