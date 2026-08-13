import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Settings, Moon, Sun, Download, Upload, ImagePlus, RefreshCw, X, ChevronDown, ChevronUp, Bot, Check, Maximize, Minimize, Copy, Bug, Edit3, Terminal as TerminalIcon, Play, Pause, Sliders, Square } from 'lucide-react';
import GeoGebraApplet, { type GeoGebraAPI } from './components/GeoGebraApplet';
import AlgebraHtmlRenderer from './components/AlgebraHtmlRenderer';
import Toast from './components/Toast';
import ImageViewer from './components/ImageViewer';
// 这几个面板都是按需打开的弹层，其中 ConsolePanel 还会拖进整个 xterm（约 300KB）。
// 放进主 chunk 会让每个用户都为没打开过的功能付出首屏加载代价，这里改成按需加载。
const DebugPanel = lazy(() => import('./components/DebugPanel'));
const ConsolePanel = lazy(() => import('./components/ConsolePanel'));
const AlgebraCalculator = lazy(() => import('./components/AlgebraCalculator'));
const MinimumCalculator = lazy(() => import('./components/MinimumCalculator'));
import { fetchAIAnalysisStream } from './services/aiStreamService';
import { downloadGGB, downloadProjectJSON, exportToHTML } from './services/exportManager';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import {
  readStorage, writeStorage, removeStorage, readJSON, writeJSON, readBool, readInt,
  onStorageQuotaExceeded,
} from './utils/storage';
import { CURRICULUM_STAGES, DEFAULT_STAGE, getStage, type StageId } from './data/curriculum';
import './index.css';

/** 设置页里保存的模型配置（与 SettingsPage 的 AIModel 对应）。 */
interface AIModelConfig {
  id: string;
  name: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
}

export interface GgbParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  isSlider: boolean;
  isAnimating: boolean;
}

/** 把值防抖写入 localStorage（默认 400ms），组件卸载时立即冲刷。 */
function useDebouncedPersist(key: string, value: string, delay = 400) {
  const valueRef = useRef(value);

  useEffect(() => {
    valueRef.current = value;
    const timer = window.setTimeout(() => writeStorage(key, value), delay);
    return () => window.clearTimeout(timer);
  }, [key, value, delay]);

  // 卸载时把最后一次（可能还在防抖窗口里的）值补写回去
  useEffect(() => {
    return () => {
      writeStorage(key, valueRef.current);
    };
  }, [key]);
}

/** 读取图片文件为 dataURL，失败的文件返回 null 而不是永远挂起。 */
function readImageFile(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve((e.target?.result as string) || null);
    reader.onerror = () => resolve(null);
    reader.onabort = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/** 读取任意文件为裸 base64（去掉 dataURL 前缀）。 */
function readFileAsBase64(file: File): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const url = (e.target?.result as string) || '';
      const comma = url.indexOf(',');
      resolve(comma >= 0 ? url.slice(comma + 1) : null);
    };
    reader.onerror = () => resolve(null);
    reader.onabort = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (readStorage('mathall-theme') || 'light') as 'light' | 'dark');
  const [streamingTag, setStreamingTag] = useState('');
  const [problemText, setProblemText] = useState(() => readStorage('mathall-problem-text') || '');
  const [aiCode, setAiCode] = useState(() => readStorage('mathall-ai-code') || '');
  const [htmlContent, setHtmlContent] = useState(() => readStorage('mathall-html-content') || '');
  const [rendererMode, setRendererMode] = useState<'GEOGEBRA' | 'HTML_CANVAS' | null>(() => {
    const saved = readStorage('mathall-renderer-mode');
    return saved === 'HTML_CANVAS' ? 'HTML_CANVAS' : 'GEOGEBRA';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [imagesBase64, setImagesBase64] = useState<string[]>(() => {
    const saved = readJSON<string[]>('mathall-images', []);
    return Array.isArray(saved) ? saved : [];
  });
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isUploadBtnHovered, setIsUploadBtnHovered] = useState(false);
  const [ggbAppName, setGgbAppName] = useState<'classic' | '3d' | 'geometry'>(() => {
    const saved = readStorage('mathall-ggb-app-name');
    return saved === '3d' || saved === 'geometry' ? saved : 'classic';
  });
  const [pendingGgbCode, setPendingGgbCode] = useState('');
  const ggbApiRef = useRef<GeoGebraAPI | null>(null);
  // ggbApiRef 的变化不会触发渲染，只把 ref.current 传给子面板会让它们长期拿到 null
  // （画板就绪后没有任何 state 变化去驱动重渲染）。这里额外用 state 广播一次。
  const [ggbApi, setGgbApi] = useState<GeoGebraAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [isAiCodeExpanded, setIsAiCodeExpanded] = useState(() => readBool('mathall-ai-code-expanded'));
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  // Default to collapsed if not 'true'
  const [isGgbCodeExpanded, setIsGgbCodeExpanded] = useState(() => readBool('mathall-ggb-code-expanded'));
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isAlgebraCalculatorOpen, setIsAlgebraCalculatorOpen] = useState(false);
  const [isMinimumCalculatorOpen, setIsMinimumCalculatorOpen] = useState(false);
  const [dynamicParams, setDynamicParams] = useState<GgbParam[]>([]);
  const [isDynamicParamsExpanded, setIsDynamicParamsExpanded] = useState(true);
  const [editingParamName, setEditingParamName] = useState<string | null>(null);

  // 连点计数只用于触发彩蛋，用 ref 保存可以避免每次点击都重渲染整个页面
  const logoClickCountRef = useRef(0);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const logoClickTimerRef = useRef<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const [activeMobileTab, setActiveMobileTab] = useState<'canvas' | 'analysis' | 'params'>('canvas');
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 学段（通用 / 高中 / 大学）：决定追加给模型的专属指令，以及可用的题型模板
  const [stageId, setStageId] = useState<StageId>(() => {
    const saved = readStorage('mathall-stage');
    return (CURRICULUM_STAGES.some(s => s.id === saved) ? saved : DEFAULT_STAGE) as StageId;
  });
  const stage = getStage(stageId);

  useEffect(() => {
    writeStorage('mathall-stage', stageId);
  }, [stageId]);

  // 高度自适应统一交给下面这个 effect（onChange 里再算一次是重复工作）
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProblemText(e.target.value);
  };

  useEffect(() => {
    if (isInputExpanded && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      if (!problemText) {
        textareaRef.current.style.height = '36px';
      } else {
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
      }
    }
  }, [problemText, isInputExpanded]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  /** 插入题型骨架：已有内容则追加，并把光标停在第一个填空处。 */
  const applyTemplate = useCallback((text: string) => {
    setProblemText(prev => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    setIsInputExpanded(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const blank = el.value.indexOf('____');
      if (blank >= 0) el.setSelectionRange(blank, blank + 4);
      else el.setSelectionRange(el.value.length, el.value.length);
      el.scrollTop = el.scrollHeight;
    });
  }, []);

  // localStorage 写满（图片 base64 很容易撑爆 5MB）时给用户一个明确提示，
  // 而不是让 setItem 直接抛异常把整个应用打崩
  useEffect(() => {
    onStorageQuotaExceeded(() => {
      showToast('浏览器本地存储空间已满，本次内容未能自动保存（可减少图片数量或重置配置）', 'error');
    });
    return () => onStorageQuotaExceeded(null);
  }, [showToast]);

  const handleLogoClick = useCallback(() => {
    logoClickCountRef.current += 1;
    if (logoClickCountRef.current >= 7) {
      logoClickCountRef.current = 0;
      setIsResetModalOpen(true);
    }

    if (logoClickTimerRef.current !== null) {
      clearTimeout(logoClickTimerRef.current);
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      logoClickCountRef.current = 0;
    }, 1000);
  }, []);

  // 卸载时清掉连点计时器
  useEffect(() => () => {
    if (logoClickTimerRef.current !== null) clearTimeout(logoClickTimerRef.current);
  }, []);

  const handleForceResetGGB = useCallback(() => {
    // Clear GGB and UI related localStorage
    const keysToRemove = [
      'mathall-ggb-state-classic',
      'mathall-ggb-state-3d',
      'mathall-ggb-state-geometry',
      'mathall-ggb-bgcolor',
      'mathall-ggb-language',
      'mathall-ggb-app-name',
      'mathall-renderer-mode',
      'mathall-problem-text',
      'mathall-ai-code',
      'mathall-html-content',
      'mathall-images'
    ];
    keysToRemove.forEach(removeStorage);

    showToast('GeoGebra 环境与设置已强制重置，正在重新加载...', 'success');

    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, [showToast]);

  // AI Models
  const [aiModels, setAiModels] = useState<AIModelConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [lastGeneratedModelId, setLastGeneratedModelId] = useState('');

  /**
   * 切换当前模型。aiStreamService 读的是 mathall-api-* 这几个「legacy」键，
   * 所以这里必须把选中模型的配置同步过去，否则界面切了模型但请求还是打到旧端点。
   */
  const selectModel = useCallback((modelId: string) => {
    setSelectedModelId(modelId);
    writeStorage('mathall-selected-model-id', modelId);
    const models = readJSON<AIModelConfig[]>('mathall-ai-models', []);
    const selected = Array.isArray(models) ? models.find(m => m.id === modelId) : undefined;
    if (selected) {
      writeStorage('mathall-api-provider', selected.provider ?? 'openai');
      writeStorage('mathall-api-base-url', selected.baseUrl ?? '');
      writeStorage('mathall-api-key', selected.apiKey ?? '');
      writeStorage('mathall-model-name', selected.modelName ?? '');
    }
  }, []);

  const [maxImages, setMaxImages] = useState(() => readInt('mathall-max-images', 4, 1, 20));
  const [imageModalThreshold, setImageModalThreshold] = useState(() => readInt('mathall-image-modal-threshold', 5, 1, 20));
  const [enableCanvasFullscreen, setEnableCanvasFullscreen] = useState(() => readBool('mathall-enable-canvas-fullscreen'));
  const [enableGgbCodeEdit, setEnableGgbCodeEdit] = useState(() => readBool('mathall-enable-ggb-code-edit'));
  const [enableDebugPanel, setEnableDebugPanel] = useState(() => readBool('mathall-enable-debug-panel'));
  const [enableConsole, setEnableConsole] = useState(() => readBool('mathall-enable-console'));
  const [editableGgbCode, setEditableGgbCode] = useState('');
  const [isGgbCodeEditModalOpen, setIsGgbCodeEditModalOpen] = useState(false);

  // 设置页与主界面之间通过 mathall-settings-updated 事件同步，统一在这里重新读取
  useEffect(() => {
    const loadSettings = () => {
      const models = readJSON<AIModelConfig[]>('mathall-ai-models', []);
      if (Array.isArray(models)) {
        setAiModels(models);
        const selected = readStorage('mathall-selected-model-id');
        setSelectedModelId(prev => {
          if (selected && models.some(m => m.id === selected)) return selected;
          if (prev && models.some(m => m.id === prev)) return prev;
          return models[0]?.id ?? '';
        });
      }

      setMaxImages(readInt('mathall-max-images', 4, 1, 20));
      setImageModalThreshold(readInt('mathall-image-modal-threshold', 5, 1, 20));
      setEnableCanvasFullscreen(readBool('mathall-enable-canvas-fullscreen'));
      setEnableGgbCodeEdit(readBool('mathall-enable-ggb-code-edit'));
      setEnableDebugPanel(readBool('mathall-enable-debug-panel'));
      setEnableConsole(readBool('mathall-enable-console'));

      const savedTheme = readStorage('mathall-theme');
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

      const savedColor = readStorage('mathall-primary-color');
      if (savedColor) document.documentElement.style.setProperty('--primary-color', savedColor);
    };
    loadSettings();
    window.addEventListener('mathall-settings-updated', loadSettings);
    return () => window.removeEventListener('mathall-settings-updated', loadSettings);
  }, []);

  // Persist state changes
  // 流式输出期间 aiCode / htmlContent 每秒变化几十次，逐次写 localStorage
  // （序列化 + 同步落盘）会明显拖慢渲染，这里统一防抖。
  useDebouncedPersist('mathall-problem-text', problemText);
  useDebouncedPersist('mathall-ai-code', aiCode);
  useDebouncedPersist('mathall-html-content', htmlContent);

  useEffect(() => {
    if (rendererMode) {
      writeStorage('mathall-renderer-mode', rendererMode);
    }
  }, [rendererMode]);

  useEffect(() => {
    writeJSON('mathall-images', imagesBase64);
  }, [imagesBase64]);

  useEffect(() => {
    writeStorage('mathall-ggb-app-name', ggbAppName);
  }, [ggbAppName]);

  useEffect(() => {
    writeStorage('mathall-ai-code-expanded', String(isAiCodeExpanded));
  }, [isAiCodeExpanded]);

  useEffect(() => {
    writeStorage('mathall-ggb-code-expanded', String(isGgbCodeExpanded));
  }, [isGgbCodeExpanded]);

  /** 把当前画板内容存进对应模式的槽位（切换 2D/3D、离开页面时都要用）。 */
  const saveGgbState = useCallback((mode: 'classic' | '3d' | 'geometry') => {
    const api = ggbApiRef.current;
    if (!api) return;
    try {
      writeStorage(`mathall-ggb-state-${mode}`, api.getBase64());
    } catch (e) {
      console.warn('Failed to save GeoGebra state:', e);
    }
  }, []);

  /**
   * applet 被销毁前存档（切换 2D/3D、跳到设置页都会触发）。
   * 依赖数组里带上 ggbAppName，保证切换模式时这里拿到的仍是「旧模式」的槽位——
   * 被卸载的那个子组件持有的是上一轮渲染传下去的回调。
   */
  const handleGgbBeforeDestroy = useCallback((api: GeoGebraAPI) => {
    try {
      writeStorage(`mathall-ggb-state-${ggbAppName}`, api.getBase64());
    } catch (e) {
      console.warn('Failed to save GeoGebra state before destroy:', e);
    }
    ggbApiRef.current = null;
    setGgbApi(null);
  }, [ggbAppName]);

  // 直接关标签页 / 刷新时 React 不会走卸载清理，这里补一次
  useEffect(() => {
    const onPageHide = () => saveGgbState(ggbAppName);
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [ggbAppName, saveGgbState]);

  // 切到纯代数视图时 applet 会卸载，必须清掉引用，否则子面板会拿着已销毁的 api
  useEffect(() => {
    if (rendererMode === 'HTML_CANVAS') {
      ggbApiRef.current = null;
      setGgbApi(null);
    }
  }, [rendererMode]);

  /**
   * 统一的图片导入入口。
   * 旧实现用「计数器 + push」等所有 FileReader 回调完成：任意一个文件读取失败
   * (onerror) 计数就永远到不了目标值，已读好的图片会被整批丢弃；而且 push 的顺序
   * 取决于回调先后，多图粘贴时顺序是乱的。
   */
  const importImageFiles = useCallback(async (files: File[], openModal = true) => {
    if (files.length === 0) return;
    const results = await Promise.all(files.map(readImageFile));
    const loaded = results.filter((r): r is string => !!r);
    if (loaded.length === 0) {
      showToast('图片读取失败，请重试', 'error');
      return;
    }

    // 计数放在 updater 外面：updater 必须是纯函数（StrictMode 下会被调用两次）
    const overflow = Math.max(0, imagesBase64.length + loaded.length - maxImages);
    const dropped = (files.length - loaded.length) + overflow;

    setImagesBase64(prev => [...prev, ...loaded].slice(0, maxImages));
    if (openModal) setIsImageModalOpen(true);
    if (dropped > 0) {
      showToast(`已导入 ${loaded.length - overflow} 张图片，${dropped} 张被忽略（读取失败或超过 ${maxImages} 张上限）`, 'info');
    }
  }, [imagesBase64.length, maxImages, showToast]);

  // 画板还没就绪时导入的存档，等 onReady 时再落地
  const pendingGgbBase64Ref = useRef<string | null>(null);

  /** 把 base64 存档写进画板；画板未就绪则挂起等待。返回是否已立即生效。 */
  const restoreGgbBase64 = useCallback((base64: string): boolean => {
    const api = ggbApiRef.current;
    if (api) {
      try {
        api.setBase64(base64);
        return true;
      } catch (e) {
        console.warn('setBase64 失败:', e);
      }
    }
    pendingGgbBase64Ref.current = base64;
    return false;
  }, []);

  const applyProjectJSON = useCallback((text: string) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      showToast('无效的 JSON 文件或解析失败', 'error');
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      showToast('该 JSON 不是有效的 MathALL 项目文件', 'error');
      return;
    }
    const data = parsed as Record<string, unknown>;

    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const mode = data.rendererMode === 'HTML_CANVAS' ? 'HTML_CANVAS' : 'GEOGEBRA';

    setProblemText(str(data.problemText));
    setStreamingTag(str(data.tag));
    setAiCode(str(data.aiCode));
    setHtmlContent(str(data.htmlContent));
    setRendererMode(mode);

    // 旧实现用 setTimeout(500) 赌画板已经加载好，慢一点就静默失败；
    // 改成就绪即写、未就绪则挂起。
    const ggbBase64 = str(data.ggbBase64);
    if (mode !== 'HTML_CANVAS' && ggbBase64) {
      restoreGgbBase64(ggbBase64);
    }
    showToast('JSON 项目配置已成功导入', 'success');
  }, [restoreGgbBase64, showToast]);

  const loadGgbFile = useCallback(async (file: File) => {
    const base64 = await readFileAsBase64(file);
    if (!base64) {
      showToast('GGB 文件读取失败', 'error');
      return;
    }
    if (restoreGgbBase64(base64)) {
      showToast('GGB 画板文件已成功导入', 'success');
    } else {
      showToast('画板尚未就绪，加载完成后将自动导入', 'info');
    }
  }, [restoreGgbBase64, showToast]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = Array.from(items)
        .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
        .map(item => item.getAsFile())
        .filter((f): f is File => !!f);
      if (files.length === 0) return;
      void importImageFiles(files);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [importImageFiles]);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsDraggingFile(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      // 个别浏览器的 dragleave/dragenter 不是严格配对，计数器可能变负导致遮罩卡住
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) {
        setIsDraggingFile(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      dragCounterRef.current = 0;

      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length === 0) return;

      const importedImages: File[] = [];
      let ggbFile: File | null = null;
      let jsonFile: File | null = null;

      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (file.type.startsWith('image/')) {
          importedImages.push(file);
        } else if (lower.endsWith('.ggb')) {
          ggbFile = file;
        } else if (lower.endsWith('.json')) {
          jsonFile = file;
        }
      }

      if (!jsonFile && !ggbFile && importedImages.length === 0) {
        showToast('不支持的文件类型，仅支持 .ggb / .json / 图片', 'info');
        return;
      }

      if (jsonFile) {
        void jsonFile.text()
          .then(text => applyProjectJSON(text))
          .catch(() => showToast('无效的 JSON 文件或解析失败', 'error'));
      }

      if (ggbFile) {
        if (rendererMode === 'HTML_CANVAS') {
          showToast('当前不是画板模式，请先切换再导入 GGB 文件', 'info');
        } else {
          void loadGgbFile(ggbFile);
        }
      }

      if (importedImages.length > 0) {
        void importImageFiles(importedImages);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [rendererMode, importImageFiles, applyProjectJSON, loadGgbFile, showToast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    writeStorage('mathall-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const handleParamChange = useCallback((name: string, value: number) => {
    const api = ggbApiRef.current;
    if (!api) return;
    try {
      api.setValue(name, value);
      setDynamicParams(prev => prev.map(p => {
        if (p.name === name) {
          if (p.isAnimating) {
            try {
              api.setAnimating(name, false);
              const otherAnimating = prev.some(o => o.name !== name && o.isAnimating);
              if (!otherAnimating) {
                api.stopAnimation();
              }
            } catch (err) {
              console.warn('Failed to stop animation on manual drag:', err);
            }
            return { ...p, value, isAnimating: false };
          }
          return { ...p, value };
        }
        return p;
      }));
    } catch (e) {
      console.warn('Failed to set value for', name, e);
    }
  }, []);

  const handleToggleAnimation = useCallback((name: string) => {
    const api = ggbApiRef.current;
    if (!api) return;
    try {
      setDynamicParams(prev => prev.map(p => {
        if (p.name === name) {
          const nextAnim = !p.isAnimating;
          api.setAnimating(name, nextAnim);
          if (nextAnim) {
            api.startAnimation();
          } else {
            const otherAnimating = prev.some(o => o.name !== name && o.isAnimating);
            if (!otherAnimating) {
              api.stopAnimation();
            }
          }
          return { ...p, isAnimating: nextAnim };
        }
        return p;
      }));
    } catch (e) {
      console.warn('Failed to toggle animation for', name, e);
    }
  }, []);

  // 对象定义几乎不变，但 getCommandString 是跨 iframe 调用且相对昂贵，
  // 逐轮为每个数值对象重新取一次会白白吃掉大量 CPU，这里按名字缓存。
  const commandStringCacheRef = useRef(new Map<string, string>());

  const handleUpdateLimits = useCallback((name: string, newMin: number, newMax: number, newStep: number) => {
    const api = ggbApiRef.current;
    if (!api) return;
    if (!(newMin < newMax)) {
      setToast({ message: '最小值必须小于最大值', type: 'error' });
      return;
    }
    if (!(newStep > 0)) {
      setToast({ message: '步长必须大于 0', type: 'error' });
      return;
    }
    try {
      api.evalCommand(`SetRange[${name}, ${newMin}, ${newMax}]`);
      api.evalCommand(`SetIncrement[${name}, ${newStep}]`);
      // 定义已变，缓存的命令串失效
      commandStringCacheRef.current.delete(name);
      setDynamicParams(prev => prev.map(p =>
        p.name === name
          // 范围收窄后当前值可能落在区间外，夹回去避免滑块显示异常
          ? { ...p, min: newMin, max: newMax, step: newStep, value: Math.min(newMax, Math.max(newMin, p.value)) }
          : p
      ));
      setToast({ message: `已更新参数 ${name} 的范围与步长`, type: 'success' });
    } catch (e) {
      console.warn('Failed to set range/increment for', name, e);
    }
  }, []);

  // Poll GGB for dynamic parameters to keep the panel UI fully synchronized in real-time
  useEffect(() => {
    if (rendererMode === 'HTML_CANVAS') {
      setDynamicParams([]);
      return;
    }

    const cache = commandStringCacheRef.current;
    const getCmd = (api: GeoGebraAPI, name: string) => {
      const cached = cache.get(name);
      if (cached !== undefined) return cached;
      let cmd = '';
      try {
        cmd = api.getCommandString(name, false) || '';
      } catch {
        cmd = '';
      }
      cache.set(name, cmd);
      return cmd;
    };

    const tick = () => {
      const api = ggbApiRef.current;
      if (!api) return;

      try {
        const numerics = api.getAllObjectNames('numeric');
        // 名字集合变了才清理缓存，避免缓存无限增长
        if (cache.size > numerics.length * 2 + 16) cache.clear();

        const validNames = numerics.filter(name => {
          if (name.startsWith('perimeter_') || name.startsWith('area_') || name.startsWith('extremum_')) return false;
          if (name.startsWith('__mathall_tmp_')) return false; // 测算工具的临时对象
          const cmd = getCmd(api, name);
          return cmd === '' || cmd.startsWith('Slider');
        });

        const isAnimRunning = api.isAnimationRunning ? api.isAnimationRunning() : false;

        setDynamicParams(prev => {
          // Check if names or count changed to warrant rebuild
          let changed = prev.length !== validNames.length;
          if (!changed) {
            for (let i = 0; i < prev.length; i++) {
              if (prev[i].name !== validNames[i]) {
                changed = true;
                break;
              }
            }
          }

          if (changed) {
            const prevByName = new Map(prev.map(p => [p.name, p]));
            return validNames.map(name => {
              const value = api.getValue(name);
              const prevParam = prevByName.get(name);
              if (prevParam) {
                return {
                  ...prevParam,
                  value,
                  isAnimating: isAnimRunning ? prevParam.isAnimating : false
                };
              }

              const cmd = getCmd(api, name);
              const isSlider = cmd.startsWith('Slider');
              let min = -5;
              let max = 5;
              let step = 0.1;

              if (isSlider) {
                const match = cmd.match(/Slider[[(]\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,)\]]+)/);
                if (match) {
                  min = parseFloat(match[1]);
                  if (isNaN(min)) min = -5;
                  max = parseFloat(match[2]);
                  if (isNaN(max)) max = 5;
                  step = parseFloat(match[3]);
                  if (isNaN(step) || step <= 0) step = 0.1;
                  if (min >= max) { min = -5; max = 5; }
                }
              }

              return { name, value, min, max, step, isSlider, isAnimating: false };
            });
          }

          // Update values and animation states
          let valueChanged = false;
          const nextParams = prev.map(p => {
            const val = api.getValue(p.name);
            const expectedAnim = isAnimRunning ? p.isAnimating : false;
            if (val !== p.value || expectedAnim !== p.isAnimating) {
              valueChanged = true;
              return { ...p, value: val, isAnimating: expectedAnim };
            }
            return p;
          });
          return valueChanged ? nextParams : prev;
        });
      } catch (e) {
        console.warn('Error syncing GGB dynamic parameters:', e);
      }
    };

    // 面板收起时没人看得到这些数值，降低轮询频率即可（仍需维持右上角计数）
    const timer = setInterval(tick, isDynamicParamsExpanded ? 500 : 2000);
    tick();
    return () => clearInterval(timer);
  }, [rendererMode, isDynamicParamsExpanded]);

  // Helper function to detect MODE from code
  const detectModeFromCode = useCallback((code: string): 'classic' | '3d' | 'geometry' | null => {
    const cleanCode = code.toUpperCase().replace(/\s+/g, '');
    if (cleanCode.includes('MODE:3D')) {
      return '3d';
    } else if (cleanCode.includes('MODE:2D')) {
      return 'classic';
    }
    return null;
  }, []);

  // Helper function to extract GGB code from AI output
  const extractGgbCode = useCallback((content: string): string => {
    if (!content) return '';

    // Pattern 1: 【RESULT】...【/RESULT】 (Chinese brackets)
    let match = content.match(/【RESULT】([\s\S]*?)【\/RESULT】/i);
    if (match) return match[1].trim();

    // Pattern 2: ```RESULT\n...\n```
    match = content.match(/```RESULT\s*\n([\s\S]*?)```/i);
    if (match) return match[1].trim();

    // Pattern 3: ```ggb\n...\n``` or ```geogebra\n...\n```
    match = content.match(/```(?:ggb|geogebra)\s*\n([\s\S]*?)```/i);
    if (match) return match[1].trim();

    // Pattern 4: **RESULT**\n...\n (without code fence)
    match = content.match(/^\s*\*\*RESULT\*\*\s*\n([\s\S]*?)(?=\n\n|\n\*\*|$)/im);
    if (match) return match[1].trim();

    // Pattern 5: RESULT:\n...\n
    // 必须独占一行，否则正文里随便一句 "the result:" 都会被误判成代码起点
    match = content.match(/^\s*RESULT:?\s*\n([\s\S]*?)(?=\n\n|\n#|$)/im);
    if (match) return match[1].trim();

    return content;
  }, []);

  const executeGgbCode = useCallback((api: GeoGebraAPI, code: string, shouldCheckMode = false) => {
    // Check MODE before execution if requested
    if (shouldCheckMode) {
      const detectedMode = detectModeFromCode(code);
      if (detectedMode && detectedMode !== ggbAppName) {
        // 代码里声明的维度和当前画板不一致：先切模式，等重新挂载后再执行
        setGgbAppName(detectedMode);
        setPendingGgbCode(code);
        return; // Will be executed after remount
      }
    }

    // Clear all objects before importing
    api.reset();
    // 画板重建后旧的命令缓存全部失效
    commandStringCacheRef.current.clear();

    const lines = code.split('\n');
    let errorCount = 0;
    let executedCount = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过空行、MODE 声明、Markdown 残留的围栏与注释行
      if (trimmed && !trimmed.includes('MODE:') && !trimmed.startsWith('```') &&
          !trimmed.startsWith('#') && !trimmed.startsWith('//')) {
         executedCount++;
         try {
           // 使用 API 方法处理特殊命令
           if (trimmed.startsWith('SetColor(')) {
             const match = trimmed.match(/SetColor\((\w+),\s*"(\w+)"\)/);
             if (match) {
               const [, objName, colorName] = match;
               const colorMap: Record<string, { r: number; g: number; b: number }> = {
                 'Black': { r: 0, g: 0, b: 0 },
                 'Blue': { r: 0, g: 0, b: 255 },
                 'Red': { r: 255, g: 0, b: 0 },
                 'Orange': { r: 255, g: 165, b: 0 }
               };
               const color = colorMap[colorName];
               if (color) {
                 api.setColor(objName, color.r, color.g, color.b);
               }
               continue;
             }
           }

           if (trimmed.startsWith('ShowLabel(')) {
             const match = trimmed.match(/ShowLabel\((\w+),\s*true\)/);
             if (match) {
               const objName = match[1];
               api.setLabelVisible(objName, true);
               api.setLabelStyle(objName, 1); // 1 = name and value
               continue;
             }
           }

           const success = api.evalCommand(trimmed);
           if (!success) {
             errorCount++;
             if (errorCount <= 3) errors.push(trimmed);
           }
         } catch (e) {
           errorCount++;
           if (errorCount <= 3) errors.push(trimmed);
           console.error('GeoGebra command error:', trimmed, e);
         }
      }
    }

    if (errorCount > 0) {
      const msg = `GeoGebra 共执行 ${executedCount} 条命令，其中 ${errorCount} 条失败${errors.length > 0 ? '，前几个错误命令：' + errors.join('; ') : ''}`;
      setToast({ message: msg, type: 'error' });
    }

    // Save GeoGebra state after execution
    saveGgbState(ggbAppName);
  }, [ggbAppName, detectModeFromCode, saveGgbState]);

  const handleGeoGebraReady = useCallback((api: GeoGebraAPI) => {
    ggbApiRef.current = api;
    setGgbApi(api);
    commandStringCacheRef.current.clear();

    if (pendingGgbCode) {
      executeGgbCode(api, pendingGgbCode);
      setPendingGgbCode('');
      pendingGgbBase64Ref.current = null;
    } else if (pendingGgbBase64Ref.current) {
      // 画板就绪前导入的 .ggb / 项目存档
      try {
        api.setBase64(pendingGgbBase64Ref.current);
        showToast('画板文件已载入', 'success');
      } catch (e) {
        console.warn('Failed to apply pending GGB base64:', e);
      }
      pendingGgbBase64Ref.current = null;
    } else {
      // Try to restore mode-specific saved state
      const modeSpecificState = readStorage(`mathall-ggb-state-${ggbAppName}`);
      if (modeSpecificState) {
        try {
          api.setBase64(modeSpecificState);
        } catch (e) {
          console.warn('Failed to restore GeoGebra state:', e);
        }
      }
    }
  }, [pendingGgbCode, executeGgbCode, ggbAppName, showToast]);

  const handleStopGenerating = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleStreamAI = async () => {
    if (isGenerating) return;
    if (!problemText.trim() && imagesBase64.length === 0) {
      showToast('请先输入题目内容或上传题目图片', 'info');
      return;
    }
    if (!selectedModelId && aiModels.length === 0) {
      showToast('尚未配置 AI 模型，请先到设置中添加', 'info');
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setIsGenerating(true);
    setStreamingTag('');
    setAiCode('');
    setHtmlContent('');
    setRendererMode(null);
    setHasGenerated(true);
    setLastGeneratedModelId(selectedModelId);

    let finalRendererMode: 'GEOGEBRA' | 'HTML_CANVAS' | null = rendererMode;

    // 流式 chunk 一秒能来几十个，每个都 setState 会让 Markdown + KaTeX 全量重排，
    // 这里累积起来按帧节流刷新（约 80ms 一次）。
    let pendingText = '';
    let lastFlush = 0;
    const flush = (force = false) => {
      if (!pendingText) return;
      const now = performance.now();
      if (!force && now - lastFlush < 80) return;
      lastFlush = now;
      const text = pendingText;
      pendingText = '';
      setAiCode(prev => prev + text);
      if (finalRendererMode === 'HTML_CANVAS') {
        setHtmlContent(prev => prev + text);
      }
    };

    try {
      const stream = fetchAIAnalysisStream(problemText, imagesBase64, { signal: controller.signal });
      let finalAiCode = '';
      let appNameChanged = false;
      let targetGgbApp = ggbAppName;

      for await (const chunk of stream) {
        if (chunk.tag && !chunk.done) setStreamingTag(chunk.tag);
        if (chunk.renderer) {
          setRendererMode(chunk.renderer);
          finalRendererMode = chunk.renderer;
        }

        if (chunk.contentChunk) {
           finalAiCode += chunk.contentChunk;
           pendingText += chunk.contentChunk;
           flush();

           if (!appNameChanged) {
               if (finalAiCode.includes('MODE: 3D')) {
                if (targetGgbApp !== '3d') {
                  setGgbAppName('3d');
                  targetGgbApp = '3d';
                  appNameChanged = true;
                }
             } else if (finalAiCode.includes('MODE: 2D')) {
                if (targetGgbApp !== 'classic') {
                  setGgbAppName('classic');
                  targetGgbApp = 'classic';
                  appNameChanged = true;
                }
             }
           }
        }
      }
      flush(true);

      // 使用统一的提取逻辑
      const extractedCode = extractGgbCode(finalAiCode);

      if (finalRendererMode !== 'HTML_CANVAS') {
        const detectedMode = detectModeFromCode(extractedCode);
        if (detectedMode && detectedMode !== targetGgbApp && !appNameChanged) {
          setGgbAppName(detectedMode);
          targetGgbApp = detectedMode;
          appNameChanged = true;
        }

        if (appNameChanged || ggbApiRef.current == null) {
           // Component is remounting, save code to be executed when ready
           setPendingGgbCode(extractedCode);
        } else {
           executeGgbCode(ggbApiRef.current, extractedCode);
        }
      }

    } catch (error) {
      flush(true); // 已经收到的内容不要因为报错/中止而丢掉
      if (error instanceof DOMException && error.name === 'AbortError') {
        showToast('已停止生成', 'info');
      } else {
        showToast(`生成失败: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  };

  // 组件卸载（例如跳到设置页）时中止仍在进行的请求
  useEffect(() => () => abortRef.current?.abort(), []);

  // 流式输出期间每帧都跑一遍多条正则太浪费，按 aiCode 缓存结果
  const ggbCode = useMemo(() => (aiCode ? extractGgbCode(aiCode) : ''), [aiCode, extractGgbCode]);

  // ── 画板全屏 ──
  // 全屏用的是另一个独立 applet，靠 localStorage 里的存档做桥梁。
  // 进入前必须先落盘一次，否则看到的是上次保存时的旧图；
  // 退出时也要把全屏里的改动带回主画板，不然用户在全屏里做的操作会白做。
  const fullscreenApiRef = useRef<GeoGebraAPI | null>(null);

  const enterCanvasFullscreen = useCallback(() => {
    saveGgbState(ggbAppName);
    setIsCanvasFullscreen(true);
  }, [ggbAppName, saveGgbState]);

  const exitCanvasFullscreen = useCallback(() => {
    const fsApi = fullscreenApiRef.current;
    if (fsApi) {
      try {
        const state = fsApi.getBase64();
        writeStorage(`mathall-ggb-state-${ggbAppName}`, state);
        ggbApiRef.current?.setBase64(state);
      } catch (e) {
        console.warn('Failed to sync fullscreen state back:', e);
      }
    }
    fullscreenApiRef.current = null;
    setIsCanvasFullscreen(false);
  }, [ggbAppName]);

  const handleFullscreenReady = useCallback((api: GeoGebraAPI) => {
    fullscreenApiRef.current = api;
    const modeSpecificState = readStorage(`mathall-ggb-state-${ggbAppName}`);
    if (modeSpecificState) {
      try {
        api.setBase64(modeSpecificState);
      } catch (e) {
        console.warn('Failed to load state in fullscreen:', e);
      }
    }
  }, [ggbAppName]);

  // 传给子面板的关闭回调必须稳定，否则子组件的 effect 会被反复重建
  const closeAlgebraCalculator = useCallback(() => setIsAlgebraCalculatorOpen(false), []);
  const closeMinimumCalculator = useCallback(() => setIsMinimumCalculatorOpen(false), []);
  const closeConsole = useCallback(() => setIsConsoleOpen(false), []);
  const closeDebugPanel = useCallback(() => setIsDebugPanelOpen(false), []);
  const closeToast = useCallback(() => setToast(null), []);
  const closeViewer = useCallback(() => setViewerImage(null), []);

  // Esc 统一关闭最上层的弹层
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (viewerImage) return;                       // ImageViewer 自己处理
      if (isGgbCodeEditModalOpen) setIsGgbCodeEditModalOpen(false);
      else if (isResetModalOpen) setIsResetModalOpen(false);
      else if (isImageModalOpen) setIsImageModalOpen(false);
      else if (isMobileUploadOpen) setIsMobileUploadOpen(false);
      else if (isCanvasFullscreen) exitCanvasFullscreen();
      else if (isUploadOpen || isDownloadOpen || isModelSelectorOpen) {
        setIsUploadOpen(false);
        setIsDownloadOpen(false);
        setIsModelSelectorOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerImage, isGgbCodeEditModalOpen, isResetModalOpen, isImageModalOpen,
      isMobileUploadOpen, isCanvasFullscreen, isUploadOpen, isDownloadOpen,
      isModelSelectorOpen, exitCanvasFullscreen]);

  const handleExportJSON = () => {
    let ggbBase64 = null;
    if (ggbApiRef.current && rendererMode !== 'HTML_CANVAS') {
       try { ggbBase64 = ggbApiRef.current.getBase64(); } catch { /* 画板未就绪，导出不含图形 */ }
    }
    downloadProjectJSON({ problemText, tag: streamingTag, aiCode, htmlContent, rendererMode, ggbBase64 }, 'mathall_state.json');
    setIsDownloadOpen(false);
  };

  const handleExportGGB = () => {
    if (ggbApiRef.current && rendererMode !== 'HTML_CANVAS') {
      try {
        downloadGGB(ggbApiRef.current, 'mathall_project.ggb');
        setToast({ message: 'GGB 文件已导出', type: 'success' });
      } catch (error) {
        setToast({ message: error instanceof Error ? error.message : 'GGB 导出失败', type: 'error' });
      }
    } else {
      setToast({ message: '当前是在纯代数视图，需要使用 GeoGebra 视图时才可导出 GGB 图形', type: 'info' });
    }
    setIsDownloadOpen(false);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsUploadOpen(false);
    setIsMobileUploadOpen(false);
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    file.text()
      .then(applyProjectJSON)
      .catch(() => showToast('无效的 JSON 文件或解析失败', 'error'));
  };

  const handleImportGGB = (e: React.ChangeEvent<HTMLInputElement>) => {
     setIsUploadOpen(false);
     setIsMobileUploadOpen(false);
     const file = e.target.files?.[0];
     e.target.value = '';
     if (!file) return;
     if (rendererMode === 'HTML_CANVAS') {
       showToast('当前不是画板模式，请先切换', 'info');
       return;
     }
     void loadGgbFile(file);
  };

  return (
    <>
      {isDraggingFile && (
        <div className="drag-drop-overlay">
          <div className="drag-drop-box">
            <Upload size={48} className="drag-drop-icon" />
            <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>松开鼠标导入文件</h3>
            <p style={{ margin: 0, fontSize: '0.95rem', opacity: 0.85 }}>支持拖入 GGB 画板文件、MathALL 项目 JSON 状态，或题目图片</p>
          </div>
        </div>
      )}
      <Suspense fallback={null}>
        {isAlgebraCalculatorOpen && (
          <AlgebraCalculator
            ggbApi={ggbApi}
            isOpen={isAlgebraCalculatorOpen}
            onClose={closeAlgebraCalculator}
          />
        )}
        {isMinimumCalculatorOpen && (
          <MinimumCalculator
            ggbApi={ggbApi}
            isOpen={isMinimumCalculatorOpen}
            onClose={closeMinimumCalculator}
          />
        )}
        {isConsoleOpen && (
          <ConsolePanel
            isOpen={isConsoleOpen}
            onClose={closeConsole}
            onResetGGB={handleForceResetGGB}
            ggbApi={ggbApi}
          />
        )}
      </Suspense>
      {viewerImage && (
        <ImageViewer
          key={viewerImage}
          imageUrl={viewerImage}
          onClose={closeViewer}
        />
      )}
      {isGgbCodeEditModalOpen && (
        <div className="image-modal-overlay" onClick={() => setIsGgbCodeEditModalOpen(false)}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', width: '90%' }}>
            <div className="image-modal-header">
              <h3>编辑 GGB 代码</h3>
              <button className="btn-outline" style={{ border: 'none', padding: 4 }} onClick={() => setIsGgbCodeEditModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="image-modal-body" style={{ maxHeight: '60vh' }}>
              <textarea
                value={editableGgbCode}
                onChange={(e) => setEditableGgbCode(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '400px',
                  background: 'var(--bg-color)',
                  padding: '12px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  lineHeight: '1.5',
                  border: '1px solid var(--border-color)',
                  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "Monaco", monospace',
                  fontWeight: 500,
                  letterSpacing: '0.02em',
                  color: 'var(--text-primary)',
                  resize: 'vertical'
                }}
              />
            </div>
            <div className="image-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setIsGgbCodeEditModalOpen(false)}
              >
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (editableGgbCode) {
                    if (ggbApiRef.current) {
                      executeGgbCode(ggbApiRef.current, editableGgbCode, true);
                      setToast({ message: '代码已应用到画板', type: 'success' });
                    } else {
                      // No API yet, check mode and set pending
                      const detectedMode = detectModeFromCode(editableGgbCode);
                      if (detectedMode && detectedMode !== ggbAppName) {
                        setGgbAppName(detectedMode);
                      }
                      setPendingGgbCode(editableGgbCode);
                      setToast({ message: '代码已保存，等待画板加载后执行', type: 'info' });
                    }
                    setIsGgbCodeEditModalOpen(false);
                  }
                }}
                disabled={!editableGgbCode}
              >
                应用到画板
              </button>
            </div>
          </div>
        </div>
      )}
      {isCanvasFullscreen && (
        <div className="canvas-fullscreen-overlay">
          <button
            className="btn btn-outline"
            onClick={exitCanvasFullscreen}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              zIndex: 10001,
              padding: '10px',
              minWidth: 'auto',
              background: 'var(--panel-bg)',
              backdropFilter: 'blur(8px)',
              boxShadow: 'var(--shadow-lg)'
            }}
            title="退出全屏"
          >
            <Minimize size={20} />
          </button>
          <div style={{ width: '100%', height: '100%' }}>
            {rendererMode === 'HTML_CANVAS' ? (
              <AlgebraHtmlRenderer content={htmlContent} />
            ) : (
              <GeoGebraApplet
                key={`ggb-fullscreen-${ggbAppName}`}
                id={`ggb-applet-fullscreen`}
                appName={ggbAppName}
                onReady={handleFullscreenReady}
              />
            )}
          </div>
        </div>
      )}
      {isResetModalOpen && (
        <div className="image-modal-overlay" onClick={() => setIsResetModalOpen(false)}>
          <div className="image-modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="image-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '8px' }}>
                危险操作
              </h3>
              <button className="btn-outline" style={{ border: 'none', padding: 4 }} onClick={() => setIsResetModalOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="image-modal-body" style={{ padding: '20px 0' }}>
              <p style={{ margin: 0, lineHeight: 1.6, fontSize: '0.95rem' }}>
                真的要重置全局配置数据吗？此操作将清除所有设置和本地缓存数据且无法恢复。
              </p>
            </div>
            <div className="image-modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <button 
                className="btn btn-outline" 
                onClick={() => setIsResetModalOpen(false)}
              >
                取消
              </button>
              <button
                className="btn"
                style={{ background: '#ef4444', color: 'white', border: 'none' }}
                onClick={() => {
                  setIsResetModalOpen(false);
                  localStorage.clear();
                  setToast({ message: '所有配置已初始化，正在重新加载...', type: 'success' });
                  setTimeout(() => {
                    window.location.reload();
                  }, 1000);
                }}
              >
                确认重置
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="app-container">
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={closeToast}
          />
        )}
        <header className="glass-panel app-header">
        <div className="header-left">
          <div className="logo-container" onClick={() => { navigate('/'); handleLogoClick(); }}>
            <span className="logo-text">MathALL</span>
            <span className="logo-badge">2.0.0</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/settings')}>
            <Settings size={18} /> <span className="btn-text">设置</span>
          </button>
          
          <div
             className="upload-dropdown"
             style={{ position: 'relative' }}
          >
             <button
               className="btn btn-outline"
               onClick={() => {
                 if (window.innerWidth <= 768) {
                   setIsMobileUploadOpen(true);
                 } else {
                   setIsUploadOpen(!isUploadOpen);
                   setIsDownloadOpen(false);
                   setIsModelSelectorOpen(false);
                 }
               }}
             >
               <Upload size={18} /> <span className="btn-text">上传</span>
             </button>

             {isUploadOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                    onClick={() => setIsUploadOpen(false)}
                  />
                  <div className="dropdown-menu" style={{ minWidth: '240px', right: 0, zIndex: 999 }}>
                    <label className="dropdown-item">
                       <Upload size={16} style={{ opacity: 0.7 }} />
                       <span>导入 JSON</span>
                       <input type="file" accept=".json" style={{display: 'none'}} onChange={handleImportJSON} />
                    </label>
                    <label className="dropdown-item">
                       <Upload size={16} style={{ opacity: 0.7 }} />
                       <span>导入 GGB</span>
                       <input type="file" accept=".ggb" style={{display: 'none'}} onChange={handleImportGGB} />
                    </label>
                  </div>
                </>
             )}
          </div>

          <div
             className="download-dropdown"
             style={{ position: 'relative' }}
          >
             <button
               className="btn btn-primary"
               onClick={() => { setIsDownloadOpen(!isDownloadOpen); setIsUploadOpen(false); setIsModelSelectorOpen(false); }}
             >
               <Download size={18} /> <span className="btn-text">下载</span>
             </button>

             {isDownloadOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                    onClick={() => setIsDownloadOpen(false)}
                  />
                  <div className="dropdown-menu" style={{ minWidth: '240px', right: 0, zIndex: 999 }}>
                    <button className="dropdown-item" onClick={handleExportJSON}>
                       <Download size={16} style={{ opacity: 0.7 }} />
                       <span>导出 JSON</span>
                    </button>
                    <button className="dropdown-item" onClick={handleExportGGB}>
                       <Download size={16} style={{ opacity: 0.7 }} />
                       <span>导出 GGB</span>
                    </button>

                    <div className="dropdown-divider"></div>

                    <button className="dropdown-item" onClick={() => {
                      setIsDownloadOpen(false);
                      let ggbState = '';
                      try {
                        ggbState = ggbApiRef.current?.getBase64() ?? '';
                      } catch { /* ignore */ }
                      if (!ggbState) {
                        // 旧实现在这里直接静默返回，用户点了没反应也不知道为什么
                        showToast('画板尚未就绪，无法导出网页', 'info');
                        return;
                      }
                      exportToHTML(ggbState, ggbAppName, problemText, imagesBase64, ggbCode, aiCode);
                    }}>
                       <Download size={16} style={{ opacity: 0.7 }} />
                       <span>导出网页 HTML</span>
                    </button>
                  </div>
                </>
             )}
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <div className="mobile-tab-bar">
        <button 
          className={`mobile-tab-btn ${activeMobileTab === 'canvas' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('canvas')}
        >
          <ImagePlus size={18} />
          <span>几何画板</span>
        </button>
        <button 
          className={`mobile-tab-btn ${activeMobileTab === 'analysis' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('analysis')}
        >
          <Bot size={18} />
          <span>分析代码</span>
        </button>
        <button 
          className={`mobile-tab-btn ${activeMobileTab === 'params' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('params')}
        >
          <Sliders size={18} />
          <span>控制测算</span>
        </button>
      </div>

      <div className="main-content">
        {isImageModalOpen && (
          <div className="image-modal-overlay" onClick={() => setIsImageModalOpen(false)}>
            <div className="image-modal-content" onClick={e => e.stopPropagation()}>
              <div className="image-modal-header">
                <h3>已选图片 ({imagesBase64.length}/{maxImages})</h3>
                <button className="btn-outline" style={{ border: 'none', padding: 4 }} onClick={() => setIsImageModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>
              <div className="image-modal-body">
                <div className="image-grid">
                  {imagesBase64.map((img, idx) => (
                    <div key={idx} className="image-grid-item">
                      <img
                        src={img}
                        alt={`preview-${idx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewerImage(img);
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <div
                        className="image-grid-delete"
                        onClick={() => setImagesBase64(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={14} />
                      </div>
                    </div>
                  ))}
                  {imagesBase64.length < maxImages && (
                    <button 
                      className="image-add-btn" 
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <ImagePlus size={24} />
                    </button>
                  )}
                </div>
              </div>
              <div className="image-modal-footer">
                <button className="btn btn-outline" onClick={() => setIsImageModalOpen(false)}>完成</button>
              </div>
            </div>
          </div>
        )}

        <div
          className={`input-bar glass-panel ${!isInputExpanded ? 'collapsed' : ''}`}
        >
            <input
                type="file"
                multiple
                ref={fileInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  void importImageFiles(files);
                }}
              />

            {/* 学段切换 + 该学段的题型模板 */}
            <div className="stage-bar">
              <div className="stage-switch" role="group" aria-label="学段">
                {CURRICULUM_STAGES.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={`stage-switch-btn ${stageId === s.id ? 'active' : ''}`}
                    onClick={() => setStageId(s.id)}
                    title={s.description}
                    aria-pressed={stageId === s.id}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              {stage.templates.length > 0 && (
                <div className="stage-templates">
                  {stage.templates.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      className="stage-template-chip"
                      onClick={() => applyTemplate(t.text)}
                      title={`插入「${t.label}」题型骨架`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="input-bar-row">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button 
                  className="btn btn-outline" 
                  style={{ border: 'none', background: 'var(--bg-color)', padding: '8px 12px', flexShrink: 0, borderRadius: '8px' }} 
                  onClick={() => {
                    if (window.innerWidth <= 768) {
                      setIsMobileUploadOpen(true);
                    } else if (imagesBase64.length > 0) {
                      setIsImageModalOpen(true);
                    } else {
                      fileInputRef.current?.click();
                    }
                  }}
                  onMouseEnter={() => setIsUploadBtnHovered(true)}
                  onMouseLeave={() => setIsUploadBtnHovered(false)}
                  title="上传图片 (或直接 Ctrl+V 粘贴)"
                >
                  {imagesBase64.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <img src={imagesBase64[0]} style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4 }} alt="uploaded" />
                        {imagesBase64.length > 1 && (
                          <div className="badge-counter" style={{ top: -6, right: -6 }}>+{imagesBase64.length - 1}</div>
                        )}
                      </div>
                      <span className="btn-text" style={{ fontWeight: 500, fontSize: '0.9rem', color: isUploadBtnHovered ? 'var(--primary-color)' : 'inherit' }}>
                        {isUploadBtnHovered ? '点击修改' : '已选图片'}
                      </span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                      <ImagePlus size={18} />
                      <span className="btn-text" style={{ fontWeight: 500, fontSize: '0.9rem' }}>添加图片</span>
                    </div>
                  )}
                </button>
                {imagesBase64.length > 0 && (
                  <div 
                    style={{ position: 'absolute', top: 4, right: 4, cursor: 'pointer', background: 'var(--panel-bg)', borderRadius: '50%', padding: '2px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-sm)', zIndex: 2 }} 
                    onClick={(e) => { e.stopPropagation(); setImagesBase64([]); }}
                    title="全部移除"
                  >
                    <X size={10} strokeWidth={3} />
                  </div>
                )}
              </div>
              
              <textarea
                ref={textareaRef}
                className="input-field"
                placeholder="在此输入题目内容（按 Ctrl+Enter 快速分析，支持 Ctrl+V 粘贴图片）......"
                style={{ 
                  border: 'none', 
                  background: 'transparent', 
                  flex: 1,
                  resize: 'none',
                  height: '36px',
                  minHeight: '36px',
                  maxHeight: '140px',
                  paddingTop: '8px',
                  paddingBottom: '8px',
                  lineHeight: '1.5',
                  overflowY: 'auto',
                  fontFamily: 'inherit'
                }}
                rows={1}
                value={problemText}
                onChange={handleTextareaChange}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleStreamAI();
                  }
                }}
              />
  
              {aiModels.length > 0 && (
                <div className="model-selector-dropdown" style={{ position: 'relative' }}>
                  <button
                    className="model-selector-btn"
                    onClick={() => { setIsModelSelectorOpen(!isModelSelectorOpen); }}
                    style={{ minWidth: '140px', justifyContent: 'space-between' }}
                  >
                    <Bot size={16} style={{ flexShrink: 0, color: 'var(--primary-color)' }} />
                    <span className="btn-text" style={{
                      flex: 1,
                      textAlign: 'left',
                      marginLeft: '6px',
                      marginRight: '6px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {aiModels.find(m => m.id === selectedModelId)?.name || '选择模型'}
                    </span>
                    <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
                  </button>
  
                  {isModelSelectorOpen && (
                    <>
                      <div
                        style={{ position: 'fixed', inset: 0, zIndex: 998 }}
                        onClick={() => setIsModelSelectorOpen(false)}
                      />
                      <div className="dropdown-menu" style={{ minWidth: '240px', right: 0, zIndex: 999, maxHeight: '320px', overflowY: 'auto' }}>
                        {aiModels.map(model => (
                          <button
                            key={model.id}
                            className="btn btn-outline"
                            style={{
                              display: 'flex',
                              width: '100%',
                              border: 'none',
                              justifyContent: 'flex-start',
                              alignItems: 'center',
                              gap: '8px',
                              background: model.id === selectedModelId ? 'var(--bg-secondary)' : 'transparent',
                              fontWeight: model.id === selectedModelId ? 600 : 400
                            }}
                            onClick={() => {
                              selectModel(model.id);
                              setIsModelSelectorOpen(false);
                            }}
                          >
                            {model.id === selectedModelId && (
                              <Check size={16} style={{ color: 'var(--primary-color)', flexShrink: 0 }} />
                            )}
                            <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {model.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
  
              {/* 生成中改为“停止”：长回答等好几十秒却没有中止入口，只能刷新页面 */}
              {isGenerating ? (
                <button
                  className="btn btn-outline"
                  onClick={handleStopGenerating}
                  style={{ flexShrink: 0 }}
                  title="停止本次生成"
                >
                  <Square size={16} />
                  <span className="btn-text">停止生成</span>
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleStreamAI}
                  style={{ flexShrink: 0 }}
                >
                  <RefreshCw size={18} />
                  <span className="btn-text">
                    {hasGenerated && lastGeneratedModelId === selectedModelId ? '重新生成' : '分析与生成'}
                  </span>
                </button>
              )}
  
              <button
                className="btn btn-outline"
                onClick={() => setIsInputExpanded(false)}
                style={{ padding: '8px', minWidth: 'auto', flexShrink: 0, border: 'none', background: 'transparent' }}
                title="收起输入框"
              >
                <X size={18} />
              </button>
            </div>
          </div>

        <div className="canvas-area" style={{ position: 'relative' }}>
          {/* Collapsed input bar floating at the bottom of the canvas */}
          <button
            className={`input-bar-collapsed-trigger glass-panel ${!isInputExpanded ? 'active' : ''}`}
            onClick={() => setIsInputExpanded(true)}
            title="展开题目输入栏"
          >
            <Bot size={18} style={{ color: 'var(--primary-color)' }} />
            <span>展开题目输入栏</span>
          </button>
            <div className="ggb-wrapper" style={{ position: 'relative' }}>
             {rendererMode !== 'HTML_CANVAS' && (
               <>
                 <div style={{ position: 'absolute', top: '12px', right: '12px', zIndex: 100, display: 'flex', gap: '8px' }}>
                   <button
                     className="btn btn-outline"
                     onClick={() => {
                       const newMode = ggbAppName === '3d' ? 'classic' : '3d';
                       // Clear pending code to prevent execution after switch
                       setPendingGgbCode('');
                       // Save current state with current mode before switching
                       saveGgbState(ggbAppName);
                       setGgbAppName(newMode);
                     }}
                     style={{
                       padding: '8px 12px',
                       minWidth: 'auto',
                       background: 'var(--panel-bg)',
                       backdropFilter: 'blur(8px)',
                       boxShadow: 'var(--shadow-md)',
                       fontSize: '0.85rem',
                       fontWeight: 600
                     }}
                     title={ggbAppName === '3d' ? '切换到 2D 模式' : '切换到 3D 模式'}
                   >
                     {ggbAppName === '3d' ? '2D' : '3D'}
                   </button>
                   {enableConsole && (
                     <button
                       className="btn btn-outline"
                       onClick={() => setIsConsoleOpen(!isConsoleOpen)}
                       style={{
                         padding: '8px',
                         minWidth: 'auto',
                         background: isConsoleOpen ? 'var(--primary-color)' : 'var(--panel-bg)',
                         color: isConsoleOpen ? 'white' : 'inherit',
                         backdropFilter: 'blur(8px)',
                         boxShadow: 'var(--shadow-md)'
                       }}
                       title="控制台"
                     >
                       <TerminalIcon size={18} />
                     </button>
                   )}
                   {enableDebugPanel && (
                     <button
                       className="btn btn-outline"
                       onClick={() => setIsDebugPanelOpen(!isDebugPanelOpen)}
                       style={{
                         padding: '8px',
                         minWidth: 'auto',
                         background: isDebugPanelOpen ? 'var(--primary-color)' : 'var(--panel-bg)',
                         color: isDebugPanelOpen ? 'white' : 'inherit',
                         backdropFilter: 'blur(8px)',
                         boxShadow: 'var(--shadow-md)'
                       }}
                       title="调试窗口"
                     >
                       <Bug size={18} />
                     </button>
                   )}
                   {enableCanvasFullscreen && (
                     <button
                       className="btn btn-outline"
                       onClick={isCanvasFullscreen ? exitCanvasFullscreen : enterCanvasFullscreen}
                       style={{
                         padding: '8px',
                         minWidth: 'auto',
                         background: 'var(--panel-bg)',
                         backdropFilter: 'blur(8px)',
                         boxShadow: 'var(--shadow-md)'
                       }}
                       title={isCanvasFullscreen ? '退出全屏' : '全屏显示'}
                     >
                       {isCanvasFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                     </button>
                   )}
                 </div>
                 {isDebugPanelOpen && (
                   <Suspense fallback={null}>
                     <DebugPanel
                       ggbApi={ggbApi}
                       onClose={closeDebugPanel}
                     />
                   </Suspense>
                 )}
               </>
             )}
             {rendererMode === 'HTML_CANVAS' ? (
                <AlgebraHtmlRenderer content={htmlContent} />
             ) : (
                <GeoGebraApplet
                  key={`ggb-${ggbAppName}`}
                  id={`ggb-applet-mathall`}
                  appName={ggbAppName}
                  onReady={handleGeoGebraReady}
                  onBeforeDestroy={handleGgbBeforeDestroy}
                />
             )}
          </div>
        </div>

        <aside className={`glass-panel properties-panel ${activeMobileTab === 'canvas' ? 'mobile-hide' : ''}`}>
          <div className={`panel-section ${activeMobileTab !== 'analysis' ? 'mobile-hide' : ''}`}>
            <h3 className="panel-title">原始题目</h3>
            <div className="panel-placeholder">
               {problemText && <div style={{ marginBottom: '12px', whiteSpace: 'pre-wrap' }}>{problemText}</div>}
               {imagesBase64.length > 0 && (
                 imagesBase64.length > imageModalThreshold ? (
                   <div
                     onClick={() => setIsImageModalOpen(true)}
                     style={{
                       padding: '20px',
                       border: '2px dashed var(--primary-color)',
                       borderRadius: '8px',
                       textAlign: 'center',
                       cursor: 'pointer',
                       background: 'rgba(16, 185, 129, 0.05)',
                       transition: 'all 0.2s'
                     }}
                     onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)'}
                     onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.05)'}
                   >
                     <ImagePlus size={32} style={{ color: 'var(--primary-color)', marginBottom: '8px' }} />
                     <div style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                       {imagesBase64.length} 张图片
                     </div>
                     <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                       点击查看全部
                     </div>
                   </div>
                 ) : (
                   <div style={{
                     display: 'grid',
                     gridTemplateColumns: imagesBase64.length >= 2 ? 'repeat(2, 1fr)' : '1fr',
                     gap: '8px'
                   }}>
                     {imagesBase64.map((img, idx) => (
                       <img
                         key={idx}
                         src={img}
                         alt={`题目图片-${idx + 1}`}
                         onClick={() => setViewerImage(img)}
                         style={{
                           width: '100%',
                           aspectRatio: imagesBase64.length >= 2 ? '1' : 'auto',
                           objectFit: imagesBase64.length >= 2 ? 'cover' : 'contain',
                           borderRadius: '8px',
                           cursor: 'pointer',
                           border: '1px solid var(--border-color)'
                         }}
                       />
                     ))}
                   </div>
                 )
               )}
               {!problemText && imagesBase64.length === 0 && "等待上传题目图文..."}
            </div>
          </div>

          <div className={`panel-section ${activeMobileTab !== 'analysis' ? 'mobile-hide' : ''}`}>
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsGgbCodeExpanded(!isGgbCodeExpanded)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>GGB 代码</span>
              </div>
              {isGgbCodeExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </h3>
            {isGgbCodeExpanded && (
              <div className="panel-placeholder" style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left', border: 'none', padding: 0 }}>
                {aiCode && (
                    <>
                      {ggbCode && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                          {enableGgbCodeEdit && (
                            <button
                              className="btn btn-outline"
                              style={{ 
                                flex: '1 1 auto',
                                padding: '6px 12px', 
                                fontSize: '0.85rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                gap: '4px',
                                minWidth: '70px'
                              }}
                              onClick={() => {
                                setEditableGgbCode(ggbCode || '');
                                setIsGgbCodeEditModalOpen(true);
                              }}
                            >
                              <Edit3 size={14} />
                              <span>编辑</span>
                            </button>
                          )}
                          <button
                            className="btn btn-outline"
                            style={{ 
                              flex: '1 1 auto',
                              padding: '6px 12px', 
                              fontSize: '0.85rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '4px',
                              minWidth: '90px'
                            }}
                            onClick={() => {
                              if (ggbApiRef.current) {
                                executeGgbCode(ggbApiRef.current, ggbCode, true);
                              } else {
                                const detectedMode = detectModeFromCode(ggbCode);
                                if (detectedMode && detectedMode !== ggbAppName) {
                                  setGgbAppName(detectedMode);
                                }
                                setPendingGgbCode(ggbCode);
                              }
                            }}
                            disabled={!ggbCode}
                          >
                            <Upload size={14} style={{ transform: 'rotate(-90deg)' }} />
                            <span>导入画板</span>
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{ 
                              flex: '1 1 auto',
                              padding: '6px 12px', 
                              fontSize: '0.85rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center',
                              gap: '4px',
                              minWidth: '70px'
                            }}
                            onClick={() => {
                              // 非 HTTPS 环境下 clipboard API 会 reject，不能默认成功
                              navigator.clipboard.writeText(ggbCode)
                                .then(() => showToast('已复制到剪贴板', 'success'))
                                .catch(() => showToast('当前环境不支持剪贴板，请手动复制', 'error'));
                            }}
                            disabled={!ggbCode}
                          >
                            <Copy size={14} />
                            <span>复制</span>
                          </button>
                        </div>
                      )}
                      {ggbCode ? (
                        <pre style={{
                          background: 'var(--bg-color)',
                          padding: '12px',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          lineHeight: '1.5',
                          overflowX: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          margin: 0,
                          border: '1px solid var(--border-color)',
                          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "Monaco", monospace',
                          fontWeight: 500,
                          letterSpacing: '0.02em',
                          width: '100%'
                        }}>
                          <code>{ggbCode}</code>
                        </pre>
                      ) : (
                        <div className="panel-placeholder" style={{ width: '100%' }}>
                          <div style={{ color: 'var(--text-secondary)' }}>等待生成 GGB 代码...</div>
                        </div>
                      )}
                    </>
                )}
              </div>
            )}
          </div>

          {rendererMode !== 'HTML_CANVAS' && (
            <div className={`panel-section ${activeMobileTab !== 'params' ? 'mobile-hide' : ''}`}>
              <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsDynamicParamsExpanded(!isDynamicParamsExpanded)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sliders size={18} style={{ color: 'var(--primary-color)' }} />
                  <span>动态解析与参数</span>
                  {dynamicParams.length > 0 && (
                    <span className="badge-counter" style={{ position: 'relative', top: 0, right: 0, border: 'none' }}>
                      {dynamicParams.length}
                    </span>
                  )}
                </div>
                {isDynamicParamsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </h3>
              
              {isDynamicParamsExpanded && (
                <div className="panel-placeholder" style={{ textAlign: 'left', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-color)' }}>
                  {dynamicParams.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '10px 0' }}>
                      未检测到可调节的动态参数或滑动条
                    </div>
                  ) : (
                    dynamicParams.map(param => (
                      <div key={param.name} style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--bg-color)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.95rem' }}>
                            {param.name} = {param.value.toFixed(2)}
                          </span>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px', height: '24px', width: '24px' }}
                              onClick={() => handleToggleAnimation(param.name)}
                              title={param.isAnimating ? "暂停动画" : "开始动画"}
                            >
                              {param.isAnimating ? <Pause size={14} style={{ color: 'var(--primary-color)' }} /> : <Play size={14} />}
                            </button>
                            <button
                              className="btn btn-outline"
                              style={{ padding: '4px', minWidth: 'auto', borderRadius: '4px', height: '24px', width: '24px' }}
                              onClick={() => setEditingParamName(editingParamName === param.name ? null : param.name)}
                              title="参数设置"
                            >
                              <Settings size={14} />
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '24px', textAlign: 'right' }}>{param.min}</span>
                          <input
                            type="range"
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={param.value}
                            onChange={(e) => handleParamChange(param.name, parseFloat(e.target.value))}
                            className="dynamic-slider"
                            style={{ flex: 1, cursor: 'pointer' }}
                          />
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', width: '24px' }}>{param.max}</span>
                        </div>

                        {editingParamName === param.name && (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-color)' }} onClick={(e) => e.stopPropagation()}>
                            <div>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>最小值</label>
                              <input
                                type="number"
                                className="input-field"
                                style={{ padding: '4px 6px', fontSize: '0.8rem', height: '28px' }}
                                defaultValue={param.min}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) handleUpdateLimits(param.name, val, param.max, param.step);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    if (!isNaN(val)) handleUpdateLimits(param.name, val, param.max, param.step);
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>最大值</label>
                              <input
                                type="number"
                                className="input-field"
                                style={{ padding: '4px 6px', fontSize: '0.8rem', height: '28px' }}
                                defaultValue={param.max}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val)) handleUpdateLimits(param.name, param.min, val, param.step);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    if (!isNaN(val)) handleUpdateLimits(param.name, param.min, val, param.step);
                                  }
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '2px' }}>步长</label>
                              <input
                                type="number"
                                className="input-field"
                                style={{ padding: '4px 6px', fontSize: '0.8rem', height: '28px' }}
                                defaultValue={param.step}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  if (!isNaN(val) && val > 0) handleUpdateLimits(param.name, param.min, param.max, val);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const val = parseFloat((e.target as HTMLInputElement).value);
                                    if (!isNaN(val) && val > 0) handleUpdateLimits(param.name, param.min, param.max, val);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <div className={`panel-section ${activeMobileTab !== 'analysis' ? 'mobile-hide' : ''}`} style={{ flex: isAiCodeExpanded ? 1 : 'none', display: 'flex', flexDirection: 'column' }}>
            <h3 className="panel-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => setIsAiCodeExpanded(!isAiCodeExpanded)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                <span>AI 指令流与解析</span>
                {/* 题目标签之前只存不显示，这里补上，生成中也能看到当前状态 */}
                {streamingTag && (
                  <span style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    whiteSpace: 'nowrap',
                    color: 'var(--primary-color)',
                    border: '1px solid var(--primary-color)',
                    opacity: isGenerating ? 0.7 : 1
                  }}>
                    {streamingTag}
                  </span>
                )}
              </div>
              {isAiCodeExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </h3>
            {isAiCodeExpanded && (
              <div
                className="input-field markdown-body"
                style={{ flex: 1, overflowY: 'auto', background: 'transparent', border: 'none', padding: '0', fontSize: '0.95rem', lineHeight: '1.6' }}
              >
                {aiCode ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {aiCode}
                  </ReactMarkdown>
                ) : (
                  <div style={{ color: 'var(--text-secondary)' }}>等待 AI 分析...</div>
                )}
              </div>
            )}
          </div>

          <div className={`panel-section ${activeMobileTab !== 'params' ? 'mobile-hide' : ''}`}>
            <h3 className="panel-title">代数暴力测算工具</h3>
            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setIsAlgebraCalculatorOpen(true)}
            >
              打开测算工具
            </button>
            <button
              className="btn btn-outline"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={() => setIsMinimumCalculatorOpen(true)}
            >
              计算线段最小值
            </button>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: '1.4' }}>
              自动提取长度、面积、计算轨迹和最值
            </p>
          </div>
        </aside>
      </div>
    </div>
      {isMobileUploadOpen && (
        <div className="mobile-sheet-overlay" onClick={() => setIsMobileUploadOpen(false)}>
          <div className="mobile-sheet-content" onClick={e => e.stopPropagation()}>
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <h3>导入与上传</h3>
              <button className="btn-close" onClick={() => setIsMobileUploadOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="mobile-sheet-body">
              <button 
                className="mobile-sheet-item"
                onClick={() => {
                  setIsMobileUploadOpen(false);
                  fileInputRef.current?.setAttribute('capture', 'environment');
                  fileInputRef.current?.click();
                }}
              >
                <div className="mobile-sheet-icon-wrapper">
                  <ImagePlus size={22} style={{ color: '#ec4899' }} />
                </div>
                <div className="mobile-sheet-text">
                  <strong>📸 拍照上传</strong>
                  <span>直接使用手机相机拍摄数学题目并识别</span>
                </div>
              </button>

              <button 
                className="mobile-sheet-item"
                onClick={() => {
                  setIsMobileUploadOpen(false);
                  fileInputRef.current?.removeAttribute('capture');
                  fileInputRef.current?.click();
                }}
              >
                <div className="mobile-sheet-icon-wrapper">
                  <ImagePlus size={22} style={{ color: 'var(--primary-color)' }} />
                </div>
                <div className="mobile-sheet-text">
                  <strong>🖼️ 从相册选择</strong>
                  <span>从系统相册中选取题目图片进行分析</span>
                </div>
              </button>

              <div className="mobile-sheet-divider" />

              <label className="mobile-sheet-item">
                <div className="mobile-sheet-icon-wrapper">
                  <Upload size={22} style={{ color: '#3b82f6' }} />
                </div>
                <div className="mobile-sheet-text">
                  <strong>📂 导入 JSON 项目</strong>
                  <span>恢复导出的 MathALL 项目完整配置与解析</span>
                </div>
                <input type="file" accept=".json" style={{display: 'none'}} onChange={handleImportJSON} />
              </label>

              <label className="mobile-sheet-item">
                <div className="mobile-sheet-icon-wrapper">
                  <Upload size={22} style={{ color: '#f59e0b' }} />
                </div>
                <div className="mobile-sheet-text">
                  <strong>📐 导入 GGB 画板</strong>
                  <span>导入现有的 GeoGebra 课件或画板文件 (.ggb)</span>
                </div>
                <input type="file" accept=".ggb" style={{display: 'none'}} onChange={handleImportGGB} />
              </label>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
