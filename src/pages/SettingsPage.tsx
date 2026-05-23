import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Sun, Moon, Palette, Bot, Info, FileText, Beaker,
  Search, ChevronRight, ChevronLeft, Plus, Trash2, Check, ChevronDown,
  Shield, Link
} from 'lucide-react';
import './SettingsPage.css';

const WEB_SAFE_COLORS = [
  { name: 'Emerald', hex: '#10b981' },
  { name: 'Sky', hex: '#0ea5e9' },
  { name: 'Indigo', hex: '#6366f1' },
  { name: 'Violet', hex: '#8b5cf6' },
  { name: 'Rose', hex: '#f43f5e' },
  { name: 'Amber', hex: '#f59e0b' },
  { name: 'Teal', hex: '#14b8a6' },
  { name: 'Cyan', hex: '#06b6d4' },
  { name: 'Lime', hex: '#84cc16' },
  { name: 'Pink', hex: '#ec4899' },
];

const APP_VERSION = 'PRE-2.0.0';

type SettingsSection = 'appearance' | 'ai' | 'prompt' | 'experimental' | 'about';

interface AIModel {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

interface SidebarItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
  iconBg: string; // for iOS mobile list
}

interface SearchableItem {
  id: string;
  label: string;
  category: SettingsSection;
  keywords: string[];
}

const SEARCHABLE_ITEMS: SearchableItem[] = [
  { id: 'theme', label: '主题显示模式 (浅色/深色/Arwes)', category: 'appearance', keywords: ['theme', 'dark', 'light', 'mode', '主题', '深色', '浅色', '模式'] },
  { id: 'primary-color', label: '应用主题色 (主色调)', category: 'appearance', keywords: ['color', 'primary', 'theme color', '颜色', '主题色', '主色'] },
  { id: 'cors', label: '网络与跨域优化 (CORS 代理)', category: 'ai', keywords: ['cors', 'proxy', 'network', '跨域', '代理', '网络'] },
  { id: 'ai-models', label: 'AI 模型配置列表', category: 'ai', keywords: ['model', 'api', 'key', 'openai', 'gemini', 'claude', '模型', '接口'] },
  { id: 'prompt', label: '系统提示词 (System Prompt)', category: 'prompt', keywords: ['prompt', 'system', 'instruction', '提示词', '指令', '规则'] },
  { id: 'max-images', label: '最大上传图片数量', category: 'experimental', keywords: ['image', 'upload', 'limit', '图片', '上传', '限制', '数量'] },
  { id: 'image-threshold', label: '图片模态框显示阈值', category: 'experimental', keywords: ['image', 'modal', 'threshold', '图片', '阈值', '显示'] },
  { id: 'canvas-fullscreen', label: '启用画板全屏按钮', category: 'experimental', keywords: ['fullscreen', 'canvas', 'button', '全屏', '画板', '按钮'] },
  { id: 'ggb-edit', label: '允许编辑 GGB 代码', category: 'experimental', keywords: ['edit', 'ggb', 'code', 'geogebra', '编辑', '代码'] },
  { id: 'debug-panel', label: '启用调试窗口 (Bug 图标)', category: 'experimental', keywords: ['debug', 'bug', 'panel', '调试', '面板', '窗口'] },
  { id: 'console', label: '启用控制台 (Terminal 图标)', category: 'experimental', keywords: ['console', 'terminal', 'cmd', '控制台', '终端', '命令行'] },
  { id: 'about', label: '关于 MathAll (版本/版权)', category: 'about', keywords: ['version', 'about', 'copyright', '版本', '关于', '版权'] },
];

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'appearance', label: '外观与主题', icon: <Palette size={16} />, iconBg: '#007aff' },
  { id: 'ai', label: 'AI 模型配置', icon: <Bot size={16} />, iconBg: '#34c759' },
  { id: 'prompt', label: '系统提示词', icon: <FileText size={16} />, iconBg: '#af52de' },
  { id: 'experimental', label: '实验性设置', icon: <Beaker size={16} />, iconBg: '#ff9500' },
  { id: 'about', label: '关于', icon: <Info size={16} />, iconBg: '#8e8e93' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [mobileDetail, setMobileDetail] = useState<SettingsSection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Settings state
  const [theme, setTheme] = useState(() =>
    (localStorage.getItem('mathall-theme') || 'light') as 'light' | 'dark' | 'arwes'
  );
  const [primaryColor, setPrimaryColor] = useState(() =>
    localStorage.getItem('mathall-primary-color') || '#10b981'
  );

  // AI Models management
  const [aiModels, setAiModels] = useState<AIModel[]>(() => {
    const saved = localStorage.getItem('mathall-ai-models');
    if (saved) {
      return JSON.parse(saved);
    }
    // Migrate old single model config if exists
    const oldProvider = localStorage.getItem('mathall-api-provider');
    const oldBaseUrl = localStorage.getItem('mathall-api-base-url');
    const oldApiKey = localStorage.getItem('mathall-api-key');
    const oldModelName = localStorage.getItem('mathall-model-name');
    if (oldProvider || oldBaseUrl || oldApiKey || oldModelName) {
      return [{
        id: Date.now().toString(),
        name: '默认模型',
        provider: oldProvider || 'openai',
        baseUrl: oldBaseUrl || '',
        apiKey: oldApiKey || '',
        modelName: oldModelName || ''
      }];
    }
    return [];
  });
  const [selectedModelId, setSelectedModelId] = useState(() =>
    localStorage.getItem('mathall-selected-model-id') || (aiModels.length > 0 ? aiModels[0].id : '')
  );
  const [providerDropdownOpen, setProviderDropdownOpen] = useState<string | null>(null);

  const [systemPrompt, setSystemPrompt] = useState(() =>
    localStorage.getItem('mathall-system-prompt') || DEFAULT_PROMPT
  );
  const [maxImages, setMaxImages] = useState(() =>
    parseInt(localStorage.getItem('mathall-max-images') || '4', 10)
  );
  const [imageModalThreshold, setImageModalThreshold] = useState(() =>
    parseInt(localStorage.getItem('mathall-image-modal-threshold') || '5', 10)
  );
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
  const [proxyMode, setProxyMode] = useState<'builtin' | 'custom'>(() =>
    (localStorage.getItem('mathall-proxy-mode') as 'builtin' | 'custom') || 'builtin'
  );
  const [corsProxy, setCorsProxy] = useState(() =>
    localStorage.getItem('mathall-cors-proxy') || ''
  );


  // Auto-save on change
  useEffect(() => {
    localStorage.setItem('mathall-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('mathall-primary-color', primaryColor);
    document.documentElement.style.setProperty('--primary-color', primaryColor);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [primaryColor]);

  // Save AI models
  useEffect(() => {
    localStorage.setItem('mathall-ai-models', JSON.stringify(aiModels));
    // Update legacy keys for backward compatibility
    const selectedModel = aiModels.find(m => m.id === selectedModelId);
    if (selectedModel) {
      localStorage.setItem('mathall-api-provider', selectedModel.provider);
      localStorage.setItem('mathall-api-base-url', selectedModel.baseUrl);
      localStorage.setItem('mathall-api-key', selectedModel.apiKey);
      localStorage.setItem('mathall-model-name', selectedModel.modelName);
    }
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [aiModels, selectedModelId]);

  useEffect(() => {
    localStorage.setItem('mathall-selected-model-id', selectedModelId);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [selectedModelId]);

  useEffect(() => {
    localStorage.setItem('mathall-system-prompt', systemPrompt);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [systemPrompt]);

  useEffect(() => {
    localStorage.setItem('mathall-max-images', maxImages.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [maxImages]);

  useEffect(() => {
    localStorage.setItem('mathall-image-modal-threshold', imageModalThreshold.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [imageModalThreshold]);

  useEffect(() => {
    localStorage.setItem('mathall-enable-canvas-fullscreen', enableCanvasFullscreen.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [enableCanvasFullscreen]);

  useEffect(() => {
    localStorage.setItem('mathall-enable-ggb-code-edit', enableGgbCodeEdit.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [enableGgbCodeEdit]);

  useEffect(() => {
    localStorage.setItem('mathall-enable-debug-panel', enableDebugPanel.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [enableDebugPanel]);

  useEffect(() => {
    localStorage.setItem('mathall-enable-console', enableConsole.toString());
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [enableConsole]);

  useEffect(() => {
    localStorage.setItem('mathall-proxy-mode', proxyMode);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [proxyMode]);

  useEffect(() => {
    localStorage.setItem('mathall-cors-proxy', corsProxy);
    window.dispatchEvent(new Event('mathall-settings-updated'));
  }, [corsProxy]);


  const filteredItems = SIDEBAR_ITEMS
    .filter(item => item.label.toLowerCase().includes(searchQuery.toLowerCase()));

  const filteredSearchItems = searchQuery.trim() !== ''
    ? SEARCHABLE_ITEMS.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.keywords.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : [];

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // AI Model management functions
  const addNewModel = () => {
    const newModel: AIModel = {
      id: Date.now().toString(),
      name: `模型 ${aiModels.length + 1}`,
      provider: 'openai',
      baseUrl: '',
      apiKey: '',
      modelName: ''
    };
    setAiModels([...aiModels, newModel]);
    setSelectedModelId(newModel.id);
  };

  const deleteModel = (id: string) => {
    const filtered = aiModels.filter(m => m.id !== id);
    setAiModels(filtered);
    if (selectedModelId === id && filtered.length > 0) {
      setSelectedModelId(filtered[0].id);
    }
  };

  const updateModel = (id: string, updates: Partial<AIModel>) => {
    setAiModels(aiModels.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleSearchResultClick = (category: SettingsSection, _id: string) => {
    setActiveSection(category);
    setSearchQuery('');
    // TODO: Scroll to element or highlight
  };

  const renderSectionContent = (section: SettingsSection) => {
    if (searchQuery.trim() !== '') {
      return (
        <div className="search-results-content">
          <div className="search-results-header">
            <Search size={20} className="search-results-icon" />
            <h2>搜索结果: "{searchQuery}"</h2>
          </div>

          {filteredSearchItems.length === 0 ? (
            <div className="search-empty-state">
              <div className="search-empty-icon">
                <Search size={40} />
              </div>
              <p>未找到匹配的设置项</p>
              <button className="btn-link" onClick={() => setSearchQuery('')}>清除搜索</button>
            </div>
          ) : (
            <div className="search-results-grid">
              {filteredSearchItems.map(item => (
                <button
                  key={item.id}
                  className="search-result-card"
                  onClick={() => handleSearchResultClick(item.category, item.id)}
                >
                  <div className="search-result-card-main">
                    <div className="search-result-card-icon">
                      {SIDEBAR_ITEMS.find(s => s.id === item.category)?.icon}
                    </div>
                    <div className="search-result-card-body">
                      <div className="search-result-card-title">{item.label}</div>
                      <div className="search-result-card-path">
                        {SIDEBAR_ITEMS.find(s => s.id === item.category)?.label}
                      </div>
                    </div>
                  </div>
                  <ChevronRight size={18} className="search-result-chevron" />
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    switch (section) {
      case 'appearance':
        return (
          <>
            <h2>外观与主题</h2>
            <div className="setting-group">
              <div className="setting-group-title">显示模式</div>
              <div className="setting-row">
                <div>
                  <div className="setting-row-label">主题</div>
                  <div className="setting-row-desc">选择应用的外观风格</div>
                </div>
                <div className="segmented-control" style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className={`segmented-btn ${theme === 'light' ? 'active' : ''}`}
                    onClick={() => setTheme('light')}
                  >
                    <Sun size={14} /> 浅色
                  </button>
                  <button
                    className={`segmented-btn ${theme === 'dark' ? 'active' : ''}`}
                    onClick={() => setTheme('dark')}
                  >
                    <Moon size={14} /> 深色
                  </button>
                  <button
                    className={`segmented-btn ${theme === 'arwes' ? 'active' : ''}`}
                    onClick={() => setTheme('arwes')}
                  >
                    Arwes
                  </button>
                </div>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-group-title">主题色</div>
              <div className="setting-row-desc" style={{ marginBottom: 12 }}>
                选择应用的主色调（不会影响画板内部样式）
              </div>
              <div className="settings-color-palette">
                {WEB_SAFE_COLORS.map(c => (
                  <button
                    key={c.hex}
                    title={c.name}
                    className={`settings-color-swatch ${primaryColor === c.hex ? 'active' : ''}`}
                    style={{ background: c.hex }}
                    onClick={() => setPrimaryColor(c.hex)}
                  />
                ))}
              </div>
            </div>
          </>
        );

      case 'ai':
        return (
          <>
            <h2>AI 模型配置</h2>
            <div className="setting-row-desc" style={{ marginBottom: 20 }}>
              支持配置多个模型，可在主界面切换使用。
            </div>

            <div className="setting-group">
              <div className="setting-group-title">网络代理模式 (CORS)</div>
              <div className="setting-row-desc" style={{ marginBottom: 12, lineHeight: 1.6 }}>
                选择 API 请求的代理方式。开发环境推荐使用内置代理；生产部署或自定义需求时可切换为自定义代理。
              </div>

              {/* Toggle buttons */}
              <div style={{ display: 'flex', gap: '0', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
                <button
                  onClick={() => setProxyMode('builtin')}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                    background: proxyMode === 'builtin' ? 'var(--primary-color)' : 'var(--bg-color)',
                    color: proxyMode === 'builtin' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <Shield size={14} /> 内置代理
                </button>
                <button
                  onClick={() => setProxyMode('custom')}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                    borderLeft: '1px solid var(--border-color)',
                    background: proxyMode === 'custom' ? 'var(--primary-color)' : 'var(--bg-color)',
                    color: proxyMode === 'custom' ? 'white' : 'var(--text-secondary)',
                    transition: 'all 0.2s ease',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  }}
                >
                  <Link size={14} /> 自定义代理
                </button>
              </div>

              {proxyMode === 'builtin' ? (
                <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', padding: '12px 14px' }}>
                  <div style={{ fontSize: '0.85rem', color: 'var(--primary-color)', fontWeight: 600, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={14} /> Vite 内置代理已激活
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    所有 API 请求由 Vite 开发服务器在<strong style={{ color: 'var(--text-primary)' }}>服务端</strong>转发，
                    完全绕过浏览器 CORS 限制。仅在 <code style={{ background: 'var(--bg-color)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.78rem' }}>npm run dev</code> 时有效。
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    className="settings-input"
                    placeholder="例如 https://your-proxy.workers.dev/"
                    style={{ width: '100%', maxWidth: 'none', marginBottom: '8px' }}
                    value={corsProxy}
                    onChange={e => setCorsProxy(e.target.value)}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    请填入您的反向代理地址。请求将以 <code style={{ background: 'var(--bg-color)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.73rem' }}>代理地址 + API路径</code> 的方式转发。
                    建议使用自建 Nginx 反代或 Cloudflare Worker，不推荐使用公共代理以防 API Key 泄露。
                  </p>
                </div>
              )}
            </div>

            <div className="setting-group">
              <div className="setting-group-title">模型列表</div>
              {aiModels.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  暂无配置的模型，点击下方按钮添加
                </div>
              ) : (
                aiModels.map(model => {
                  const isSelected = model.id === selectedModelId;
                  let baseUrlPlaceholder = "例如 https://api.openai.com/v1";
                  let baseUrlLabel = "API Base URL";
                  let modelPlaceholder = "例如 gpt-4o, deepseek-chat";

                  if (model.provider === 'gemini') {
                    baseUrlPlaceholder = "默认: https://generativelanguage.googleapis.com";
                    modelPlaceholder = "例如 gemini-1.5-pro, gemini-2.0-flash";
                  } else if (model.provider === 'cloudflare') {
                    baseUrlLabel = "Account ID";
                    baseUrlPlaceholder = "填入您的 Cloudflare Account ID";
                    modelPlaceholder = "例如 @cf/meta/llama-3-8b-instruct";
                  } else if (model.provider === 'anthropic') {
                    baseUrlPlaceholder = "默认: https://api.anthropic.com";
                    modelPlaceholder = "例如 claude-3-5-sonnet-20240620";
                  } else if (model.provider === 'ollama') {
                    baseUrlPlaceholder = "例如 http://127.0.0.1:11434/v1";
                    modelPlaceholder = "例如 qwen2.5:7b, llama3.1";
                  }

                  return (
                    <div
                      key={model.id}
                      style={{
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        padding: '16px',
                        marginBottom: '12px',
                        background: isSelected ? 'var(--bg-secondary)' : 'transparent'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                        <button
                          onClick={() => setSelectedModelId(model.id)}
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: '50%',
                            border: '2px solid var(--primary-color)',
                            background: isSelected ? 'var(--primary-color)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            flexShrink: 0
                          }}
                        >
                          {isSelected && <Check size={12} color="white" />}
                        </button>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder="模型名称"
                          value={model.name}
                          onChange={e => updateModel(model.id, { name: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <button
                          onClick={() => deleteModel(model.id)}
                          style={{
                            padding: '6px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="删除模型"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="setting-row" style={{ marginBottom: '8px' }}>
                        <div className="setting-row-label">API 协议服务商</div>
                        <div style={{ position: 'relative' }}>
                          <button
                            className="custom-select-btn"
                            onClick={() => setProviderDropdownOpen(providerDropdownOpen === model.id ? null : model.id)}
                            style={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 14px',
                              borderRadius: '8px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--panel-bg)',
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              fontWeight: '500',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            <span>
                              {model.provider === 'openai' && 'OpenAI 兼容 (OpenAI, DeepSeek, 智谱等)'}
                              {model.provider === 'gemini' && 'Google Gemini 原生'}
                              {model.provider === 'anthropic' && 'Anthropic Claude 原生'}
                              {model.provider === 'cloudflare' && 'Cloudflare Workers AI'}
                              {model.provider === 'ollama' && 'Ollama 本地部署 (OpenAI 兼容)'}
                            </span>
                            <ChevronDown size={16} style={{
                              transition: 'transform 0.2s ease',
                              transform: providerDropdownOpen === model.id ? 'rotate(180deg)' : 'rotate(0deg)'
                            }} />
                          </button>
                          {providerDropdownOpen === model.id && (
                            <div className="custom-dropdown" style={{
                              position: 'absolute',
                              top: 'calc(100% + 4px)',
                              right: 0,
                              minWidth: '100%',
                              width: 'max-content',
                              maxWidth: 'min(400px, 90vw)',
                              background: 'var(--panel-bg)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '8px',
                              boxShadow: 'var(--shadow-lg)',
                              zIndex: 1000,
                              maxHeight: '240px',
                              overflowY: 'auto',
                              padding: '4px'
                            }}>
                              {[
                                { value: 'openai', label: 'OpenAI 兼容 (OpenAI, DeepSeek, 智谱等)' },
                                { value: 'gemini', label: 'Google Gemini 原生' },
                                { value: 'anthropic', label: 'Anthropic Claude 原生' },
                                { value: 'cloudflare', label: 'Cloudflare Workers AI' },
                                { value: 'ollama', label: 'Ollama 本地部署 (OpenAI 兼容)' }
                              ].map(option => (
                                <div
                                  key={option.value}
                                  className="dropdown-item"
                                  onClick={() => {
                                    updateModel(model.id, { provider: option.value });
                                    setProviderDropdownOpen(null);
                                  }}
                                  style={{
                                    padding: '10px 14px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    color: model.provider === option.value ? 'var(--primary-color)' : 'var(--text-primary)',
                                    background: model.provider === option.value ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                                    fontWeight: model.provider === option.value ? '600' : '500'
                                  }}
                                >
                                  {option.label}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="setting-row" style={{ marginBottom: '8px' }}>
                        <div className="setting-row-label">{baseUrlLabel}</div>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder={baseUrlPlaceholder}
                          value={model.baseUrl}
                          onChange={e => updateModel(model.id, { baseUrl: e.target.value })}
                        />
                      </div>

                      <div className="setting-row" style={{ marginBottom: '8px' }}>
                        <div className="setting-row-label">API Key</div>
                        <input
                          type="password"
                          className="settings-input"
                          placeholder="sk-..."
                          value={model.apiKey}
                          onChange={e => updateModel(model.id, { apiKey: e.target.value })}
                        />
                      </div>

                      <div className="setting-row">
                        <div className="setting-row-label">模型名称</div>
                        <input
                          type="text"
                          className="settings-input"
                          placeholder={modelPlaceholder}
                          value={model.modelName}
                          onChange={e => updateModel(model.id, { modelName: e.target.value })}
                        />
                      </div>
                    </div>
                  );
                })
              )}

              <button
                onClick={addNewModel}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'var(--primary-color)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                <Plus size={16} /> 添加新模型
              </button>
            </div>
          </>
        );

      case 'prompt':
        return (
          <>
            <h2>系统级提示词</h2>
            <div className="setting-row-desc" style={{ marginBottom: 16 }}>
              包含暴力建系公式（距离、中点、鞋带公式等）约束以及指令输出格式规范。您可以随时优化以提升 AI 的分析表现。
            </div>
            <textarea
              className="settings-textarea"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
            />
            <button className="btn-reset" onClick={() => setSystemPrompt(DEFAULT_PROMPT)}>
              恢复默认提示词
            </button>
          </>
        );

      case 'experimental':
        return (
          <>
            <h2>实验性设置</h2>
            <div className="setting-row-desc" style={{ marginBottom: 20 }}>
              这些设置可能会影响应用的显示行为，请谨慎调整。
            </div>
            <div className="setting-group">
              <div className="setting-group-title">图片上传与显示</div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">最大上传图片数量</div>
                   <div className="setting-row-desc">部分模型单次限制传图数量，可在此调整上限</div>
                </div>
                <input
                  type="number"
                  className="settings-input"
                  min="1"
                  max="20"
                  style={{ width: '80px', textAlign: 'center' }}
                  value={maxImages}
                  onChange={e => setMaxImages(parseInt(e.target.value) || 1)}
                />
              </div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">图片模态框显示阈值</div>
                   <div className="setting-row-desc">当图片数量超过此值时，右侧面板将显示"点击查看全部"按钮而非直接显示图片</div>
                </div>
                <input
                  type="number"
                  className="settings-input"
                  min="1"
                  max="20"
                  style={{ width: '80px', textAlign: 'center' }}
                  value={imageModalThreshold}
                  onChange={e => setImageModalThreshold(parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-group-title">画板显示</div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">启用画板全屏按钮</div>
                   <div className="setting-row-desc">在画板区域显示全屏按钮，点击可放大画板到全屏状态</div>
                </div>
                <label className="m3-toggle">
                  <input
                    type="checkbox"
                    checked={enableCanvasFullscreen}
                    onChange={e => setEnableCanvasFullscreen(e.target.checked)}
                  />
                  <div className="m3-toggle-track">
                    <div className="m3-toggle-thumb">
                      <svg className="m3-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-group-title">代码编辑</div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">允许编辑 GGB 代码</div>
                   <div className="setting-row-desc">启用后可在右侧面板直接编辑和应用 GeoGebra 代码</div>
                </div>
                <label className="m3-toggle">
                  <input
                    type="checkbox"
                    checked={enableGgbCodeEdit}
                    onChange={e => setEnableGgbCodeEdit(e.target.checked)}
                  />
                  <div className="m3-toggle-track">
                    <div className="m3-toggle-thumb">
                      <svg className="m3-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="setting-group">
              <div className="setting-group-title">开发者工具</div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">启用调试窗口</div>
                   <div className="setting-row-desc">在画板区域显示调试窗口按钮 (Bug 图标)</div>
                </div>
                <label className="m3-toggle">
                  <input
                    type="checkbox"
                    checked={enableDebugPanel}
                    onChange={e => setEnableDebugPanel(e.target.checked)}
                  />
                  <div className="m3-toggle-track">
                    <div className="m3-toggle-thumb">
                      <svg className="m3-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">启用控制台</div>
                   <div className="setting-row-desc">在画板区域显示控制台按钮 (Terminal 图标)</div>
                </div>
                <label className="m3-toggle">
                  <input
                    type="checkbox"
                    checked={enableConsole}
                    onChange={e => setEnableConsole(e.target.checked)}
                  />
                  <div className="m3-toggle-track">
                    <div className="m3-toggle-thumb">
                      <svg className="m3-toggle-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/>
                      </svg>
                    </div>
                  </div>
                </label>
              </div>
            </div>

          </>
        );

      case 'about':
        return (
          <>
            <h2>关于 MathAll</h2>
            <div className="about-info">
              <div className="about-info-row">
                <span className="about-info-label">版本</span>
                <span className="about-info-value">{APP_VERSION}</span>
              </div>
              <div className="about-info-row">
                <span className="about-info-label">数据存储位置</span>
                <span className="about-info-value">本地浏览器缓存</span>
              </div>
              <div className="about-info-row">
                <span className="about-info-label">渲染引擎</span>
                <span className="about-info-value">GeoGebra JS</span>
              </div>
              <div className="about-info-row">
                <span className="about-info-label">AI 协议标准</span>
                <span className="about-info-value">支持主流API标准，可手动适配</span>
              </div>
            </div>
            <div className="setting-row-desc" style={{ marginTop: 20 }}>
              MathAll 由xhc861 开发设计，项目版权属于 SiiWay 团队。开源遵循Apache 2.0 协议。
            </div>
          </>
        );
    }
  };

  const currentItemLabel = SIDEBAR_ITEMS.find(i => i.id === (mobileDetail || activeSection))?.label || '';

  return (
    <div className="settings-root">
      <div className="macos-window">
        {/* macOS Title Bar */}
        <div className="macos-titlebar">
          <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem', border: 'none', background: 'transparent' }} onClick={() => navigate('/')}>
            <ChevronLeft size={16} /> 返回
          </button>
          <div className="macos-titlebar-center">
            {isMobile && mobileDetail ? currentItemLabel : 'MathAll 设置'}
          </div>
          <div style={{ width: '80px' }}></div>
        </div>

        {/* Body */}
        <div className="macos-body">
          {/* === Desktop Sidebar === */}
          <div className="macos-sidebar">
            <div className="sidebar-search">
              <Search size={14} className="search-icon" />
              <input
                type="text"
                placeholder="搜索"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            {filteredItems.map(item => (
              <button
                key={item.id}
                className={`sidebar-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="sidebar-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>

          {/* === Desktop Content === */}
          {!isMobile && (
            <div className="macos-content">
              {renderSectionContent(activeSection)}
            </div>
          )}

          {/* === Mobile: iOS grouped list === */}
          {isMobile && !mobileDetail && (
            <div className="macos-content" style={{ padding: 0 }}>
              <div className="ios-group">
                <div className="ios-group-header">通用</div>
                <div className="ios-group-card">
                  {SIDEBAR_ITEMS.map(item => (
                    <button
                      key={item.id}
                      className="ios-list-item"
                      onClick={() => setMobileDetail(item.id)}
                    >
                      <div className="ios-list-icon" style={{ background: item.id === 'appearance' ? primaryColor : item.iconBg }}>
                        {item.icon}
                      </div>
                      <div className="ios-list-text">
                        <div className="ios-list-text-title">{item.label}</div>
                      </div>
                      <ChevronRight size={18} className="ios-chevron" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* === Mobile: iOS detail page === */}
          {isMobile && mobileDetail && (
            <div className="ios-detail-page">
              <div className="ios-detail-header">
                <button className="ios-back-btn" onClick={() => setMobileDetail(null)}>
                  <ChevronLeft size={18} /> 返回
                </button>
                <div className="ios-detail-title">{currentItemLabel}</div>
                <div style={{ width: 50 }} /> {/* spacer for centering */}
              </div>
              <div className="ios-detail-body">
                {renderSectionContent(mobileDetail)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PROMPT = `你是数学可视化 AI 助手。分析题目后，将 GeoGebra 代码放在【RESULT】标记内。

【输出格式】
你可以先分析题目，然后在最后输出：

【RESULT】
MODE: 2D
A = (0, 0)
ShowLabel(A, true)
B = (5, 0)
ShowLabel(B, true)
seg = Segment(A, B)
SetColor(seg, "Black")
【/RESULT】

【代码规范】
- 第一行必须是 MODE: 2D 或 MODE: 3D
- 每行一条可执行的 GeoGebra 命令
- 点：A = (0, 0) 或 A = (0, 0, 0)
- 线段：seg = Segment(A, B)
- 多边形：poly = Polygon(A, B, C, D)
- 圆：c = Circle(A, 5)
- 滑块：t = Slider(0, 1, 0.01)
- 动点：P = (t, t^2)
- 函数：f(x) = x^2 + 2x + 1

【显示规范】
1. 每个点创建后必须显示标签：
   ShowLabel(点名, true)

2. 线段、多边形等图形不显示标签

【颜色规范】
只设置点和线段的颜色，使用颜色名称字符串：

1. 固定点 → 蓝色
   SetColor(点名, "Blue")

2. 动点（依赖滑块的）→ 红色
   SetColor(点名, "Red")

3. 所有线段（固定或动态）→ 黑色
   SetColor(线段名, "Black")

4. 目标线段（题目要求的）→ 红色
   SetColor(目标线段名, "Red")

【示例】
【RESULT】
MODE: 2D
A = (0, 0)
ShowLabel(A, true)
SetColor(A, "Blue")
B = (4, 0)
ShowLabel(B, true)
SetColor(B, "Blue")
seg1 = Segment(A, B)
SetColor(seg1, "Black")
t = Slider(0, 1, 0.01)
P = (t, 2)
ShowLabel(P, true)
SetColor(P, "Red")
seg2 = Segment(A, P)
SetColor(seg2, "Black")
target = Segment(B, P)
SetColor(target, "Red")
【/RESULT】

【重要】
- 每个点必须显示标签
- 只设置点和线的颜色，不设置面的填充色
- 使用颜色名称字符串，不要使用 RGB 数值`;

