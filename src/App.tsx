import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Settings, Moon, Sun, Download, Upload, ImagePlus, RefreshCw, X, ChevronDown, ChevronUp, Bot, Check, Maximize, Minimize, Copy, Bug, Edit3, Terminal as TerminalIcon, Play, Pause, Sliders } from 'lucide-react';
import GeoGebraApplet, { type GeoGebraAPI } from './components/GeoGebraApplet';
import AlgebraHtmlRenderer from './components/AlgebraHtmlRenderer';
import Toast from './components/Toast';
import ImageViewer from './components/ImageViewer';
import DebugPanel from './components/DebugPanel';
import ConsolePanel from './components/ConsolePanel';
import AlgebraCalculator from './components/AlgebraCalculator';
import MinimumCalculator from './components/MinimumCalculator';
import { fetchAIAnalysisStream } from './services/aiStreamService';
import { downloadGGB, downloadProjectJSON, exportToHTML } from './services/exportManager';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './index.css';

export interface GgbParam {
  name: string;
  value: number;
  min: number;
  max: number;
  step: number;
  isSlider: boolean;
  isAnimating: boolean;
}

function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mathall-theme') || 'light') as 'light' | 'dark');
  const [streamingTag, setStreamingTag] = useState('');
  const [problemText, setProblemText] = useState(() => localStorage.getItem('mathall-problem-text') || '');
  const [aiCode, setAiCode] = useState(() => localStorage.getItem('mathall-ai-code') || '');
  const [htmlContent, setHtmlContent] = useState(() => localStorage.getItem('mathall-html-content') || '');
  const [rendererMode, setRendererMode] = useState<'GEOGEBRA' | 'HTML_CANVAS' | null>(() => {
    const saved = localStorage.getItem('mathall-renderer-mode');
    return saved ? (saved as 'GEOGEBRA' | 'HTML_CANVAS' | null) : 'GEOGEBRA';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [imagesBase64, setImagesBase64] = useState<string[]>(() => {
    const saved = localStorage.getItem('mathall-images');
    return saved ? JSON.parse(saved) : [];
  });
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isUploadBtnHovered, setIsUploadBtnHovered] = useState(false);
  const [ggbAppName, setGgbAppName] = useState<'classic' | '3d' | 'geometry'>(() => {
    const saved = localStorage.getItem('mathall-ggb-app-name');
    return saved ? (saved as 'classic' | '3d' | 'geometry') : 'classic';
  });
  const [pendingGgbCode, setPendingGgbCode] = useState('');
  const ggbApiRef = useRef<GeoGebraAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [isAiCodeExpanded, setIsAiCodeExpanded] = useState(() => {
    const saved = localStorage.getItem('mathall-ai-code-expanded');
    return saved === 'true';
  });
  const [isCanvasFullscreen, setIsCanvasFullscreen] = useState(false);
  const [isGgbCodeExpanded, setIsGgbCodeExpanded] = useState(() => {
    const saved = localStorage.getItem('mathall-ggb-code-expanded');
    return saved === 'true'; // Default to collapsed if not 'true'
  });
  const [isDebugPanelOpen, setIsDebugPanelOpen] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [isAlgebraCalculatorOpen, setIsAlgebraCalculatorOpen] = useState(false);
  const [isMinimumCalculatorOpen, setIsMinimumCalculatorOpen] = useState(false);
  const [dynamicParams, setDynamicParams] = useState<GgbParam[]>([]);
  const [isDynamicParamsExpanded, setIsDynamicParamsExpanded] = useState(true);
  const [editingParamName, setEditingParamName] = useState<string | null>(null);

  const [_logoClickCount, setLogoClickCount] = useState(0);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const logoClickTimerRef = useRef<number | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);
  const [activeMobileTab, setActiveMobileTab] = useState<'canvas' | 'analysis' | 'params'>('canvas');
  const [isMobileUploadOpen, setIsMobileUploadOpen] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setProblemText(e.target.value);
    const target = e.target;
    target.style.height = 'auto';
    target.style.height = `${Math.min(target.scrollHeight, 140)}px`;
  };

  useEffect(() => {
    if (isInputExpanded && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 140)}px`;
    }
  }, [problemText, isInputExpanded]);

  const handleLogoClick = useCallback(() => {
    setLogoClickCount(prev => {
      const nextCount = prev + 1;
      if (nextCount >= 7) {
        setIsResetModalOpen(true);
        return 0;
      }
      return nextCount;
    });

    if (logoClickTimerRef.current !== null) {
      clearTimeout(logoClickTimerRef.current);
    }
    logoClickTimerRef.current = window.setTimeout(() => {
      setLogoClickCount(0);
    }, 1000);
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
      'mathall-images'
    ];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    setToast({ message: 'GeoGebra 环境与设置已强制重置，正在重新加载...', type: 'success' });

    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }, []);

  // AI Models
  const [aiModels, setAiModels] = useState<Array<{id: string; name: string}>>([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [hasGenerated, setHasGenerated] = useState(false);
  const [lastGeneratedModelId, setLastGeneratedModelId] = useState('');

  useEffect(() => {
    const loadModels = () => {
      const saved = localStorage.getItem('mathall-ai-models');
      if (saved) {
        const models = JSON.parse(saved);
        setAiModels(models);
        const selected = localStorage.getItem('mathall-selected-model-id');
        if (selected && models.find((m: any) => m.id === selected)) {
          setSelectedModelId(selected);
        } else if (models.length > 0) {
          setSelectedModelId(models[0].id);
        }
      }
    };
    loadModels();
    window.addEventListener('mathall-settings-updated', loadModels);
    return () => window.removeEventListener('mathall-settings-updated', loadModels);
  }, []);

  const maxImages = parseInt(localStorage.getItem('mathall-max-images') || '4', 10);
  const imageModalThreshold = parseInt(localStorage.getItem('mathall-image-modal-threshold') || '5', 10);
  const [enableCanvasFullscreen, setEnableCanvasFullscreen] = useState(() =>
    localStorage.getItem('mathall-enable-canvas-fullscreen') === 'true'
  );
  const [enableGgbCodeEdit, setEnableGgbCodeEdit] = useState(() =>
    localStorage.getItem('mathall-enable-ggb-code-edit') === 'true'
  );
  const [enableDebugPanel, setEnableDebugPanel] = useState(() =>
    localStorage.getItem('mathall-enable-debug-panel') === 'true'
  );
  const [enableConsole, setEnableConsole] = useState(() =>
    localStorage.getItem('mathall-enable-console') === 'true'
  );
  const [editableGgbCode, setEditableGgbCode] = useState('');
  const [isGgbCodeEditModalOpen, setIsGgbCodeEditModalOpen] = useState(false);

  useEffect(() => {
    const loadSettings = () => {
      setEnableCanvasFullscreen(localStorage.getItem('mathall-enable-canvas-fullscreen') === 'true');
      setEnableGgbCodeEdit(localStorage.getItem('mathall-enable-ggb-code-edit') === 'true');
      setEnableDebugPanel(localStorage.getItem('mathall-enable-debug-panel') === 'true');
      setEnableConsole(localStorage.getItem('mathall-enable-console') === 'true');

      const savedTheme = localStorage.getItem('mathall-theme') as 'light' | 'dark';
      if (savedTheme) setTheme(savedTheme);

      const savedColor = localStorage.getItem('mathall-primary-color');
      if (savedColor) document.documentElement.style.setProperty('--primary-color', savedColor);
    };
    window.addEventListener('mathall-settings-updated', loadSettings);
    return () => window.removeEventListener('mathall-settings-updated', loadSettings);
  }, []);

  // Persist state changes
  useEffect(() => {
    localStorage.setItem('mathall-problem-text', problemText);
  }, [problemText]);

  useEffect(() => {
    localStorage.setItem('mathall-ai-code', aiCode);
  }, [aiCode]);

  useEffect(() => {
    localStorage.setItem('mathall-html-content', htmlContent);
  }, [htmlContent]);

  useEffect(() => {
    if (rendererMode) {
      localStorage.setItem('mathall-renderer-mode', rendererMode);
    }
  }, [rendererMode]);

  useEffect(() => {
    localStorage.setItem('mathall-images', JSON.stringify(imagesBase64));
  }, [imagesBase64]);

  useEffect(() => {
    localStorage.setItem('mathall-ggb-app-name', ggbAppName);
  }, [ggbAppName]);

  useEffect(() => {
    localStorage.setItem('mathall-ai-code-expanded', String(isAiCodeExpanded));
  }, [isAiCodeExpanded]);

  useEffect(() => {
    localStorage.setItem('mathall-ggb-code-expanded', String(isGgbCodeExpanded));
  }, [isGgbCodeExpanded]);

  // Save GeoGebra state before unmount
  useEffect(() => {
    return () => {
      if (ggbApiRef.current) {
        try {
          const state = ggbApiRef.current.getBase64();
          localStorage.setItem(`mathall-ggb-state-${ggbAppName}`, state);
          console.log(`Saved ${ggbAppName} state to localStorage`);
        } catch (e) {
          console.warn('Failed to save GeoGebra state:', e);
        }
      }
    };
  }, [ggbAppName]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgItems = Array.from(items).filter(item => item.type.indexOf('image') !== -1);
      if (imgItems.length === 0) return;
      
      const newImages: string[] = [];
      let processed = 0;
      
      imgItems.forEach(item => {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            newImages.push(event.target?.result as string);
            processed++;
            if (processed === imgItems.length) {
              setImagesBase64(prev => {
                const combined = [...prev, ...newImages];
                return combined.slice(0, maxImages);
              });
              setIsImageModalOpen(true);
            }
          };
          reader.readAsDataURL(file);
        }
      });
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [maxImages]);

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
      dragCounterRef.current--;
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

      let importedImages: File[] = [];
      let ggbFile: File | null = null;
      let jsonFile: File | null = null;

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          importedImages.push(file);
        } else if (file.name.endsWith('.ggb')) {
          ggbFile = file;
        } else if (file.name.endsWith('.json')) {
          jsonFile = file;
        }
      }

      if (jsonFile) {
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
             const data = JSON.parse(event.target?.result as string);
             setProblemText(data.problemText || '');
             setStreamingTag(data.tag || '');
             setAiCode(data.aiCode || '');
             setHtmlContent(data.htmlContent || '');
             setRendererMode(data.rendererMode || 'GEOGEBRA');
             
             setTimeout(() => {
               if (data.ggbBase64 && ggbApiRef.current && data.rendererMode !== 'HTML_CANVAS') {
                  ggbApiRef.current.setBase64(data.ggbBase64);
               }
             }, 500);
             setToast({ message: 'JSON 项目配置已成功导入', type: 'success' });
          } catch (err) {
             setToast({ message: '无效的 JSON 文件或解析失败', type: 'error' });
          }
        };
        reader.readAsText(jsonFile);
      }

      if (ggbFile) {
        if (rendererMode === 'HTML_CANVAS') {
          setToast({ message: '当前不是画板模式，请先切换再导入 GGB 文件', type: 'info' });
        } else {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64Url = event.target?.result as string; 
            const base64 = base64Url.split(',')[1];
            if (ggbApiRef.current) {
                ggbApiRef.current.setBase64(base64);
                setToast({ message: 'GGB 画板文件已成功导入', type: 'success' });
            } else {
                setToast({ message: '画板未准备就绪，无法导入', type: 'info' });
            }
          };
          reader.readAsDataURL(ggbFile);
        }
      }

      if (importedImages.length > 0) {
        let processed = 0;
        const newImages: string[] = [];
        for (const file of importedImages) {
          const reader = new FileReader();
          reader.onload = ev => {
            newImages.push(ev.target?.result as string);
            processed++;
            if (processed === importedImages.length) {
               setImagesBase64(prev => {
                 const combined = [...prev, ...newImages];
                 return combined.slice(0, maxImages);
               });
               setIsImageModalOpen(true);
               setToast({ message: `已导入 ${importedImages.length} 张题目图片`, type: 'success' });
            }
          };
          reader.readAsDataURL(file);
        }
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
  }, [rendererMode, maxImages]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mathall-theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedColor = localStorage.getItem('mathall-primary-color');
    if (savedColor) document.documentElement.style.setProperty('--primary-color', savedColor);
  }, []);

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

  const handleUpdateLimits = useCallback((name: string, newMin: number, newMax: number, newStep: number) => {
    const api = ggbApiRef.current;
    if (!api) return;
    try {
      api.evalCommand(`SetRange[${name}, ${newMin}, ${newMax}]`);
      api.evalCommand(`SetIncrement[${name}, ${newStep}]`);
      setDynamicParams(prev => prev.map(p => p.name === name ? { ...p, min: newMin, max: newMax, step: newStep } : p));
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

    const timer = setInterval(() => {
      const api = ggbApiRef.current;
      if (!api) return;

      try {
        const numerics = api.getAllObjectNames('numeric');
        const validNames = numerics.filter(name => {
          if (name.startsWith('perimeter_') || name.startsWith('area_') || name.startsWith('extremum_')) return false;
          const cmd = api.getCommandString(name, false) || '';
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
            return validNames.map(name => {
              const cmd = api.getCommandString(name, false) || '';
              const isSlider = cmd.startsWith('Slider');
              const value = api.getValue(name);
              let min = -5;
              let max = 5;
              let step = 0.1;

              if (isSlider) {
                const match = cmd.match(/Slider\[\s*([^,]+)\s*,\s*([^,]+)\s*,\s*([^,]+)/);
                if (match) {
                  min = parseFloat(match[1]);
                  if (isNaN(min)) min = -5;
                  max = parseFloat(match[2]);
                  if (isNaN(max)) max = 5;
                  step = parseFloat(match[3]);
                  if (isNaN(step) || step <= 0) step = 0.1;
                }
              }

              const prevParam = prev.find(p => p.name === name);
              if (prevParam) {
                return {
                  ...prevParam,
                  value: value,
                  isAnimating: isAnimRunning ? prevParam.isAnimating : false
                };
              }

              return {
                name,
                value,
                min,
                max,
                step,
                isSlider,
                isAnimating: false
              };
            });
          } else {
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
          }
        });
      } catch (e) {
        console.warn('Error syncing GGB dynamic parameters:', e);
      }
    }, 500);

    return () => clearInterval(timer);
  }, [rendererMode]);

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
    match = content.match(/\*\*RESULT\*\*\s*\n([\s\S]*?)(?=\n\n|\n\*\*|$)/i);
    if (match) return match[1].trim();

    // Pattern 5: RESULT:\n...\n
    match = content.match(/RESULT:?\s*\n([\s\S]*?)(?=\n\n|\n#|$)/i);
    if (match) return match[1].trim();

    return content;
  }, []);

  const executeGgbCode = useCallback((api: GeoGebraAPI, code: string, shouldCheckMode = false) => {
    // Check MODE before execution if requested
    if (shouldCheckMode) {
      const detectedMode = detectModeFromCode(code);
      if (detectedMode && detectedMode !== ggbAppName) {
        console.log(`Mode mismatch detected: current=${ggbAppName}, code=${detectedMode}. Switching...`);
        setGgbAppName(detectedMode);
        setPendingGgbCode(code);
        return; // Will be executed after remount
      }
    }

    // Clear all objects before importing
    api.reset();

    const lines = code.split('\n');
    let errorCount = 0;
    const errors: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.includes('MODE:')) {
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
      const msg = `GeoGebra 执行了 ${lines.length} 行代码，其中 ${errorCount} 行失败${errors.length > 0 ? '，前几个错误命令：' + errors.join('; ') : ''}`;
      setToast({ message: msg, type: 'error' });
    }

    // Save GeoGebra state after execution
    try {
      const state = api.getBase64();
      localStorage.setItem(`mathall-ggb-state-${ggbAppName}`, state);
      console.log(`Saved ${ggbAppName} state after code execution`);
    } catch (e) {
      console.warn('Failed to save GeoGebra state:', e);
    }
  }, [ggbAppName, detectModeFromCode]);

  const handleGeoGebraReady = useCallback((api: GeoGebraAPI) => {
    ggbApiRef.current = api;
    console.log('GeoGebra ready! mode:', ggbAppName);

    if (pendingGgbCode) {
      executeGgbCode(api, pendingGgbCode);
      setPendingGgbCode('');
    } else {
      // Try to restore mode-specific saved state
      const modeSpecificState = localStorage.getItem(`mathall-ggb-state-${ggbAppName}`);
      if (modeSpecificState) {
        try {
          api.setBase64(modeSpecificState);
          console.log(`Restored ${ggbAppName} state from localStorage`);
        } catch (e) {
          console.warn('Failed to restore GeoGebra state:', e);
        }
      }
    }
  }, [pendingGgbCode, executeGgbCode, ggbAppName]);

  const handleStreamAI = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStreamingTag('');
    setAiCode('');
    setHtmlContent('');
    setRendererMode(null);
    setHasGenerated(true);
    setLastGeneratedModelId(selectedModelId);

    try {
      const stream = fetchAIAnalysisStream(problemText, imagesBase64); 
      let finalAiCode = '';
      let finalRendererMode: 'GEOGEBRA' | 'HTML_CANVAS' | null = rendererMode;
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
           setAiCode(prev => prev + chunk.contentChunk);
           if (finalRendererMode === 'HTML_CANVAS') {
             setHtmlContent(prev => prev + chunk.contentChunk);
           }
           
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

      // 使用统一的提取逻辑
      const extractedCode = extractGgbCode(finalAiCode);
      console.log('Extracted code for execution:', extractedCode);

      if (finalRendererMode !== 'HTML_CANVAS') {
        const detectedMode = detectModeFromCode(extractedCode);
        if (detectedMode && detectedMode !== targetGgbApp && !appNameChanged) {
          console.log(`MODE detected in extraction: ${detectedMode}, switching from ${targetGgbApp}`);
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

    } catch (error: any) {
      setToast({ message: `生成失败: ${error.message}`, type: 'error' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportJSON = () => {
    let ggbBase64 = null;
    if (ggbApiRef.current && rendererMode !== 'HTML_CANVAS') {
       try { ggbBase64 = ggbApiRef.current.getBase64(); } catch (e) {}
    }
    downloadProjectJSON({ problemText, tag: streamingTag, aiCode, htmlContent, rendererMode, ggbBase64 }, 'mathall_state.json');
    setIsDownloadOpen(false);
  };

  const handleExportGGB = () => {
    if (ggbApiRef.current && rendererMode !== 'HTML_CANVAS') {
      try {
        downloadGGB(ggbApiRef.current, 'mathall_project.ggb');
        setToast({ message: 'GGB 文件已导出', type: 'success' });
      } catch (error: any) {
        setToast({ message: error.message || 'GGB 导出失败', type: 'error' });
      }
    } else {
      setToast({ message: '当前是在纯代数视图，需要使用 GeoGebra 视图时才可导出 GGB 图形', type: 'info' });
    }
    setIsDownloadOpen(false);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsUploadOpen(false);
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
         const data = JSON.parse(event.target?.result as string);
         setProblemText(data.problemText || '');
         setStreamingTag(data.tag || '');
         setAiCode(data.aiCode || '');
         setHtmlContent(data.htmlContent || '');
         setRendererMode(data.rendererMode || 'GEOGEBRA');
         
         setTimeout(() => {
           if (data.ggbBase64 && ggbApiRef.current && data.rendererMode !== 'HTML_CANVAS') {
              ggbApiRef.current.setBase64(data.ggbBase64);
           }
         }, 500);
         setToast({ message: 'JSON 配置已导入', type: 'success' });
      } catch (err) {
         setToast({ message: '无效的 JSON 文件或解析失败', type: 'error' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportGGB = (e: React.ChangeEvent<HTMLInputElement>) => {
     setIsUploadOpen(false);
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (event) => {
         const base64Url = event.target?.result as string; 
         // result is usually inline data string
         const base64 = base64Url.split(',')[1];
         if (ggbApiRef.current && rendererMode !== 'HTML_CANVAS') {
             ggbApiRef.current.setBase64(base64);
             setToast({ message: 'GGB 文件已导入', type: 'success' });
         } else {
             setToast({ message: '当前不是画板模式，请先切换', type: 'info' });
         }
     }
     reader.readAsDataURL(file);
     e.target.value = '';
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
      <AlgebraCalculator
        ggbApi={ggbApiRef.current}
        isOpen={isAlgebraCalculatorOpen}
        onClose={() => setIsAlgebraCalculatorOpen(false)}
      />
      <MinimumCalculator
        ggbApi={ggbApiRef.current}
        isOpen={isMinimumCalculatorOpen}
        onClose={() => setIsMinimumCalculatorOpen(false)}
      />
      <ConsolePanel
        isOpen={isConsoleOpen}
        onClose={() => setIsConsoleOpen(false)}
        onResetGGB={handleForceResetGGB}
        ggbApi={ggbApiRef.current}
      />
      {viewerImage && (
        <ImageViewer
          imageUrl={viewerImage}
          onClose={() => setViewerImage(null)}
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
            onClick={() => setIsCanvasFullscreen(false)}
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
                onReady={(api) => {
                  // Load the same state as the main applet
                  const modeSpecificState = localStorage.getItem(`mathall-ggb-state-${ggbAppName}`);
                  if (modeSpecificState) {
                    try {
                      api.setBase64(modeSpecificState);
                      console.log(`Loaded ${ggbAppName} state in fullscreen mode`);
                    } catch (e) {
                      console.warn('Failed to load state in fullscreen:', e);
                    }
                  }
                }}
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
            onClose={() => setToast(null)}
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
                      setTimeout(() => {
                        const ggbState = ggbApiRef.current?.getBase64();
                        const ggbCode = extractGgbCode(aiCode);
                        if (ggbState) {
                          exportToHTML(ggbState, ggbAppName, problemText, imagesBase64, ggbCode, aiCode);
                        }
                      }, 100);
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
                  if (files.length > 0) {
                    let processed = 0;
                    const newImages: string[] = [];
                    files.forEach(file => {
                      const reader = new FileReader();
                      reader.onload = ev => {
                        newImages.push(ev.target?.result as string);
                        processed++;
                        if (processed === files.length) {
                           setImagesBase64(prev => {
                             const combined = [...prev, ...newImages];
                             return combined.slice(0, maxImages);
                           });
                           setIsImageModalOpen(true);
                        }
                      };
                      reader.readAsDataURL(file);
                    });
                  }
                  e.target.value = '';
                }} 
              />
  
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <button 
                  className="btn btn-outline" 
                  style={{ border: 'none', background: 'var(--bg-color)', padding: '8px 12px', flexShrink: 0, borderRadius: '8px' }} 
                  onClick={() => {
                    if (window.innerWidth <= 768) {
                      setIsMobileUploadOpen(true);
                    } else {
                      imagesBase64.length > 0 ? setIsImageModalOpen(true) : fileInputRef.current?.click();
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
                              setSelectedModelId(model.id);
                              localStorage.setItem('mathall-selected-model-id', model.id);
                              // Update legacy keys
                              const models = JSON.parse(localStorage.getItem('mathall-ai-models') || '[]');
                              const selected = models.find((m: any) => m.id === model.id);
                              if (selected) {
                                localStorage.setItem('mathall-api-provider', selected.provider);
                                localStorage.setItem('mathall-api-base-url', selected.baseUrl);
                                localStorage.setItem('mathall-api-key', selected.apiKey);
                                localStorage.setItem('mathall-model-name', selected.modelName);
                              }
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
  
              <button
                className="btn btn-primary"
                onClick={handleStreamAI}
                disabled={isGenerating}
                style={{ flexShrink: 0 }}
              >
                <RefreshCw size={18} className={isGenerating ? "animate-spin" : ""} />
                <span className="btn-text">
                  {isGenerating ? "生成中..." : (hasGenerated && lastGeneratedModelId === selectedModelId ? "重新生成" : "分析与生成")}
                </span>
              </button>
  
              <button
                className="btn btn-outline"
                onClick={() => setIsInputExpanded(false)}
                style={{ padding: '8px', minWidth: 'auto', flexShrink: 0, border: 'none', background: 'transparent' }}
                title="收起输入框"
              >
                <X size={18} />
              </button>
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
                       if (ggbApiRef.current) {
                         try {
                           const state = ggbApiRef.current.getBase64();
                           localStorage.setItem(`mathall-ggb-state-${ggbAppName}`, state);
                           console.log(`Saved ${ggbAppName} state before switching`);
                         } catch (e) {
                           console.warn('Failed to save state before mode switch:', e);
                         }
                       }
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
                       onClick={() => setIsCanvasFullscreen(!isCanvasFullscreen)}
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
                   <DebugPanel
                     ggbApi={ggbApiRef.current}
                     onClose={() => setIsDebugPanelOpen(false)}
                   />
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
                {aiCode && (() => {
                  const ggbCode = extractGgbCode(aiCode);
                  return (
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
                              navigator.clipboard.writeText(ggbCode);
                              setToast({ message: '已复制到剪贴板', type: 'success' });
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
                  );
                })()}
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
              <span>AI 指令流与解析</span>
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
