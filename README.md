# MathAll 

MathAll 是一个结合了 AI 大模型分析与 GeoGebra 动态几何渲染的智能数学辅助工具。用户可通过文本或图片输入数学题目，利用 AI 自动进行推理分析，并直接生成并执行 GeoGebra 代码以实现 2D/3D 几何图形的可视化。此外，系统还内置了强大的“代数暴力测算工具”，支持一键提取几何参数、分析动点轨迹与计算极值。

## 主要特性

* **AI 智能推理与解析**
    * 支持文本输入与图片上传（支持 Ctrl+V 快捷粘贴）。
    * 流式输出 AI 分析过程，并使用 KaTeX + Markdown 完美渲染数学公式。
    * 支持多模型切换与本地化 API 密钥管理。
* **无缝集成 GeoGebra 画板**
    * 内置 GeoGebra （HTML5 V5），支持经典 2D、几何（Geometry）与 3D 视图。
    * AI 可直接输出 GeoGebra 脚本并自动在画板中渲染出对应图形。
    * 支持画板背景自定义、全屏显示及调试面板。
* **代数暴力测算工具**
    * **长度/面积提取**：自动提取画板中所有线段长度、多边形/圆的周长与面积，甚至支持将小数自动转化为精确的根号表达式。
    * **动点轨迹分析**：实时追踪并获取动点的坐标信息与定义。
    * **最值计算**：自动解析函数极值并计算表达式的最大/最小值。
* **强大的导入/导出功能**
    * 支持导出和导入 `.ggb`（GeoGebra 原始工程）和 `.json`（整个解题分析状态）。
    * 支持将当前分析页面、代码与交互画板打包导出为独立的单文件 `HTML`，便于分享与脱机演示。
* **现代化 UI 与个性化体验**
    * 适配亮色（Light）与暗色（Dark）双主题无缝切换。
    * 流畅的响应式布局，毛玻璃（Glassmorphism）面板设计。
    * 自动缓存用户输入、界面布局与历史模型选择，刷新不丢失进度。

## 技术栈

* **前端框架**: React 19 + TypeScript + Vite
* **路由**: React Router 7
* **数学引擎**: GeoGebra API 
* **Markdown & 公式渲染**: `react-markdown`, `remark-math`, `rehype-katex`, `katex`
* **UI 图标**: `lucide-react`
* **代码规范**: ESLint + TypeScript ESLint

## 快速开始

### 1. 环境准备
确保您的本地环境已安装 [Node.js](https://nodejs.org/) 。

### 2. 安装依赖
克隆此项目后，在根目录下运行以下命令安装所需依赖：
```bash
npm install
# 或者使用 pnpm
pnpm install
# 或者使用 yarn
yarn install
```

### 3. 运行开发服务器
```bash
npm run dev
```
项目将在本地启动，默认访问地址通常为 `http://localhost:5173`。

### 4. 生产环境构建
```bash
npm run build
```
构建后的静态文件将生成在 `dist` 目录中。

## 使用说明

1. **配置 AI 模型**：
   首次使用时，点击顶部导航栏的 **[设置]** 按钮，添加您的 AI 提供商（如 OpenAI、Anthropic 等）的 API Base URL 与 API Key。
2. **输入题目**：
   在底部输入框键入数学题目描述。您也可以点击左侧的图片按钮上传图片，或直接在页面中按下 `Ctrl+V` 粘贴剪贴板中的题目截图。
3. **开始分析**：
   点击 **[分析与生成]** 按钮。AI 将开始流式输出解题思路。
   如果 AI 识别到需要绘制图形，会在输出末尾生成包裹在 `【RESULT】...【/RESULT】` 中的 GeoGebra 代码。系统将自动捕获这些代码并在右侧/全屏的 GeoGebra 画板中执行绘图。
4. **测算与验证**：
   打开右侧边栏底部的 **[打开测算工具]**，即可对当前画板中的线段、多边形、函数等进行“长度提取”、“轨迹记录”或“极值分析”，为解题提供数值验证。

## 核心目录结构

```text
mathall/
├── public/                 # 静态资源 (favicon, icons等)
├── src/
│   ├── assets/             # 图片与SVG资源
│   ├── components/         # 核心 React 组件库
│   │   ├── GeoGebraApplet.tsx    # GeoGebra 画板集成组件
│   │   ├── AlgebraCalculator.tsx # 代数暴力测算工具
│   │   ├── DebugPanel.tsx        # GGB 调试面板
│   │   └── ...
│   ├── pages/              # 页面级组件 (如 SettingsPage)
│   ├── services/           # 业务逻辑与接口调用
│   │   ├── aiStreamService.ts    # AI 流式请求封装
│   │   └── exportManager.ts      # 文件导出处理 (HTML, GGB, JSON)
│   ├── utils/              # 工具函数
│   │   └── distanceCalculator.ts # 根号计算与格式化工具
│   ├── App.tsx             # 应用主入口与状态管理
│   ├── index.css           # 全局样式主题变量
│   └── main.tsx            # React 挂载点
├── package.json            # 项目依赖配置
└── vite.config.ts          # Vite 构建配置
```

## 许可证

本项目采用 Apache 2.0 开源许可证。
