import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Settings, Moon, Sun, Download, Upload, ImagePlus, RefreshCw, Layers, X } from 'lucide-react';
import GeoGebraApplet, { type GeoGebraAPI } from './components/GeoGebraApplet';
import AlgebraHtmlRenderer from './components/AlgebraHtmlRenderer';
import { fetchAIAnalysisStream } from './services/aiStreamService';
import { downloadGGB, downloadProjectJSON, printToPDF } from './services/exportManager';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import './index.css';

function App() {
  const navigate = useNavigate();
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('mathall-theme') || 'light') as 'light' | 'dark');
  const [streamingTag, setStreamingTag] = useState('');
  const [problemText, setProblemText] = useState('');
  const [aiCode, setAiCode] = useState('');
  const [htmlContent, setHtmlContent] = useState('');
  const [rendererMode, setRendererMode] = useState<'GEOGEBRA' | 'HTML_CANVAS' | null>('GEOGEBRA'); // default to GGB
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const [imagesBase64, setImagesBase64] = useState<string[]>([]);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isUploadBtnHovered, setIsUploadBtnHovered] = useState(false);
  const [ggbAppName, setGgbAppName] = useState<'classic' | '3d' | 'geometry'>('classic');
  const [pendingGgbCode, setPendingGgbCode] = useState('');
  const ggbApiRef = useRef<GeoGebraAPI | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ggbLanguage = localStorage.getItem('mathall-ggb-language') || 'zh';
  const maxImages = parseInt(localStorage.getItem('mathall-max-images') || '4', 10);

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
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('mathall-theme', theme);
  }, [theme]);

  useEffect(() => {
    const savedColor = localStorage.getItem('mathall-primary-color');
    if (savedColor) document.documentElement.style.setProperty('--primary-color', savedColor);
  }, []);

  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const executeGgbCode = useCallback((api: GeoGebraAPI, code: string) => {
    const lines = code.split('\n');
    for (const line of lines) {
      if (line.trim() && !line.includes('MODE:')) {
         try { api.evalCommand(line); } catch (e) { console.error('GeoGebra command error:', e) }
      }
    }
  }, []);

  const handleGeoGebraReady = useCallback((api: GeoGebraAPI) => {
    ggbApiRef.current = api;
    console.log('GeoGebra ready! mode:', ggbAppName);
    if (pendingGgbCode) {
      executeGgbCode(api, pendingGgbCode);
      setPendingGgbCode('');
    }
  }, [pendingGgbCode, executeGgbCode, ggbAppName]);

  const handleStreamAI = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setStreamingTag('');
    setAiCode('');
    setHtmlContent('');
    setRendererMode(null); 

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

      if (finalRendererMode !== 'HTML_CANVAS') {
        if (appNameChanged || ggbApiRef.current == null) {
           // Component is remounting, save code to be executed when ready
           setPendingGgbCode(finalAiCode);
        } else {
           executeGgbCode(ggbApiRef.current, finalAiCode);
        }
      }

    } catch (error: any) {
      alert(`生成失败: ${error.message}`);
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
      downloadGGB(ggbApiRef.current, 'mathall_project.ggb');
    } else {
      alert("当前是在纯代数视图，需要使用 GeoGebra 视图时才可导出 GGB 图形。");
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
      } catch (err) {
         alert("无效的 JSON 文件或解析失败");
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
         } else {
             alert('当前不是画板模式，请先切换');
         }
     }
     reader.readAsDataURL(file);
     e.target.value = '';
  };

  return (
    <div className="app-container">
      <header className="glass-panel app-header">
        <div className="header-left">
          <div className="logo">
            MathAll
          </div>
          {streamingTag && (
            <div className="tag-stream">
              问题类型：{streamingTag}
              {isGenerating && <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn btn-outline" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="btn btn-outline" onClick={() => navigate('/settings')}>
            <Settings size={18} /> 设置
          </button>
          
          <div 
             className="upload-dropdown" 
             style={{ position: 'relative' }}
          >
             <button 
               className="btn btn-outline" 
               onClick={() => { setIsUploadOpen(!isUploadOpen); setIsDownloadOpen(false); }}
             >
               <Upload size={18} /> 上传
             </button>
             
             {isUploadOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
                    onClick={() => setIsUploadOpen(false)}
                  />
                  <div className="dropdown-menu" style={{ minWidth: '220px', right: 0, zIndex: 999 }}>
                    <label className="btn btn-outline" style={{ display: 'flex', width: '100%', border: 'none', justifyContent: 'flex-start', cursor: 'pointer' }}>
                       导入 JSON (还原配置)
                       <input type="file" accept=".json" style={{display: 'none'}} onChange={handleImportJSON} />
                    </label>
                    <label className="btn btn-outline" style={{ display: 'flex', width: '100%', border: 'none', justifyContent: 'flex-start', cursor: 'pointer' }}>
                       导入 GGB (追加画板)
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
               onClick={() => { setIsDownloadOpen(!isDownloadOpen); setIsUploadOpen(false); }}
             >
               <Download size={18} /> 下载
             </button>
             
             {isDownloadOpen && (
                <>
                  <div 
                    style={{ position: 'fixed', inset: 0, zIndex: 998 }} 
                    onClick={() => setIsDownloadOpen(false)}
                  />
                  <div className="dropdown-menu" style={{ minWidth: '220px', right: 0, zIndex: 999 }}>
                    <button className="btn btn-outline" onClick={handleExportJSON}>
                       导出 JSON 归档
                    </button>
                    <button className="btn btn-outline" onClick={handleExportGGB}>
                       导出 GGB 画稿
                    </button>

                    <div className="dropdown-divider"></div>

                    <button className="btn btn-outline" onClick={() => { setIsDownloadOpen(false); setTimeout(printToPDF, 100) }}>
                       打印输出为 PDF
                    </button>
                  </div>
                </>
             )}
          </div>
        </div>
      </header>

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
                      <img src={img} alt={`preview-${idx}`} />
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

        <div className="canvas-area" style={{ position: 'relative' }}>
          <div className="input-bar glass-panel">
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
                onClick={() => imagesBase64.length > 0 ? setIsImageModalOpen(true) : fileInputRef.current?.click()}
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
                    <span style={{ fontWeight: 500, fontSize: '0.9rem', color: isUploadBtnHovered ? 'var(--primary-color)' : 'inherit' }}>
                      {isUploadBtnHovered ? '点击修改' : '已选图片'}
                    </span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)' }}>
                    <ImagePlus size={18} />
                    <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>添加图片</span>
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
            
            <input
              type="text"
              className="input-field"
              placeholder="在此输入题目内容，支持 Ctrl+V 粘贴图片......"
              style={{ border: 'none', background: 'transparent' }}
              value={problemText}
              onChange={e => setProblemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStreamAI()}
            />
            <button className="btn btn-primary" onClick={handleStreamAI} disabled={isGenerating} style={{ flexShrink: 0 }}>
              <RefreshCw size={18} className={isGenerating ? "animate-spin" : ""} />
              {isGenerating ? "生成中..." : "分析与生成"}
            </button>
          </div>

          <div className="ggb-wrapper">
             {rendererMode === 'HTML_CANVAS' ? (
                <AlgebraHtmlRenderer content={htmlContent} />
             ) : (
                <GeoGebraApplet 
                  key={`ggb-${ggbLanguage}-${ggbAppName}`} 
                  id={`ggb-applet-mathall-${ggbLanguage}-${ggbAppName}`} 
                  appName={ggbAppName}
                  onReady={handleGeoGebraReady} 
                />
             )}
          </div>
        </div>

        <aside className="glass-panel properties-panel">
          <div className="panel-section">
            <h3 className="panel-title">原始题目</h3>
            <div className="panel-placeholder">
               {problemText || "等待上传题目图文..."}
            </div>
          </div>

          <div className="panel-section" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h3 className="panel-title">AI 指令流与解析</h3>
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
          </div>

          <div className="panel-section">
            <h3 className="panel-title">代数暴力测算工具</h3>
            <button className="btn btn-primary" style={{ width: '100%' }}>计算动点轨迹 & 最值</button>
            <button className="btn btn-outline" style={{ width: '100%', marginTop: '8px' }}>提取长度 / 面积值</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;
