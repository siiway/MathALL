import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  Sun, Moon, Palette, Bot, Info, Monitor,
  Save, Search, ChevronRight, ChevronLeft
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

const BG_COLORS = ['#ffffff', '#f8fafc', '#ecfdf5', '#fefce8', '#1e293b', '#273444'];

const APP_VERSION = 'v1.0.0';

type SettingsSection = 'appearance' | 'ai' | 'canvas' | 'prompt' | 'about';

interface SidebarItem {
  id: SettingsSection;
  label: string;
  icon: React.ReactNode;
  iconBg: string; // for iOS mobile list
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'appearance', label: '外观与主题', icon: <Palette size={16} />, iconBg: '#007aff' },
  { id: 'ai', label: 'AI 模型配置', icon: <Bot size={16} />, iconBg: '#34c759' },
  { id: 'canvas', label: '画板设置', icon: <Monitor size={16} />, iconBg: '#ff9500' },
  { id: 'prompt', label: '系统提示词', icon: <Info size={16} />, iconBg: '#af52de' },
  { id: 'about', label: '关于', icon: <Info size={16} />, iconBg: '#8e8e93' },
];

export default function SettingsPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState<SettingsSection>('appearance');
  const [mobileDetail, setMobileDetail] = useState<SettingsSection | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Settings state
  const [theme, setTheme] = useState(() =>
    (localStorage.getItem('mathall-theme') || 'light') as 'light' | 'dark'
  );
  const [primaryColor, setPrimaryColor] = useState(() =>
    localStorage.getItem('mathall-primary-color') || '#10b981'
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(() =>
    localStorage.getItem('mathall-api-base-url') || ''
  );
  const [apiKey, setApiKey] = useState(() =>
    localStorage.getItem('mathall-api-key') || ''
  );
  const [modelName, setModelName] = useState(() =>
    localStorage.getItem('mathall-model-name') || ''
  );
  const [apiProvider, setApiProvider] = useState(() =>
    localStorage.getItem('mathall-api-provider') || 'openai'
  );
  const [ggbLanguage, setGgbLanguage] = useState(() =>
    localStorage.getItem('mathall-ggb-language') || 'zh'
  );
  const [ggbBgColor, setGgbBgColor] = useState(() =>
    localStorage.getItem('mathall-ggb-bgcolor') || '#ffffff'
  );
  const [systemPrompt, setSystemPrompt] = useState(() =>
    localStorage.getItem('mathall-system-prompt') || DEFAULT_PROMPT
  );
  const [maxImages, setMaxImages] = useState(() =>
    parseInt(localStorage.getItem('mathall-max-images') || '4', 10)
  );
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--primary-color', primaryColor);
  }, [primaryColor]);

  const handleSave = () => {
    localStorage.setItem('mathall-theme', theme);
    localStorage.setItem('mathall-primary-color', primaryColor);
    localStorage.setItem('mathall-api-base-url', apiBaseUrl);
    localStorage.setItem('mathall-api-key', apiKey);
    localStorage.setItem('mathall-model-name', modelName);
    localStorage.setItem('mathall-api-provider', apiProvider);
    localStorage.setItem('mathall-ggb-language', ggbLanguage);
    localStorage.setItem('mathall-ggb-bgcolor', ggbBgColor);
    localStorage.setItem('mathall-system-prompt', systemPrompt);
    localStorage.setItem('mathall-max-images', maxImages.toString());
    setSaved(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 1200);
  };

  const filteredItems = SIDEBAR_ITEMS.filter(item =>
    item.label.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Detect mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const renderSectionContent = (section: SettingsSection) => {
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
                  <div className="setting-row-desc">选择浅色或深色外观模式</div>
                </div>
                <div className="segmented-control">
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
        let baseUrlPlaceholder = "例如 https://api.openai.com/v1";
        let baseUrlLabel = "API Base URL";
        let modelPlaceholder = "例如 gpt-4o, deepseek-chat";

        if (apiProvider === 'gemini') {
          baseUrlPlaceholder = "默认: https://generativelanguage.googleapis.com (按需修改代理)";
          modelPlaceholder = "例如 gemini-1.5-pro, gemini-2.0-flash";
        } else if (apiProvider === 'cloudflare') {
          baseUrlLabel = "Account ID";
          baseUrlPlaceholder = "填入您的 Cloudflare Account ID";
          modelPlaceholder = "例如 @cf/meta/llama-3-8b-instruct";
        } else if (apiProvider === 'anthropic') {
          baseUrlPlaceholder = "默认: https://api.anthropic.com (按需修改代理)";
          modelPlaceholder = "例如 claude-3-5-sonnet-20240620";
        } else if (apiProvider === 'ollama') {
          baseUrlPlaceholder = "例如 http://127.0.0.1:11434/v1";
          modelPlaceholder = "例如 qwen2.5:7b, llama3.1";
        }

        return (
          <>
            <h2>AI 模型配置</h2>
            <div className="setting-row-desc" style={{ marginBottom: 20 }}>
              支持各大原生协议与兼容协议。所有请求从您浏览器直接发送，不经过我们的服务器。
            </div>
            <div className="setting-group">
              <div className="setting-row">
                <div>
                  <div className="setting-row-label">API 协议服务商</div>
                  <div className="setting-row-desc">选择您的 API 使用的接口规范</div>
                </div>
                <select
                  className="settings-select"
                  value={apiProvider}
                  onChange={e => setApiProvider(e.target.value)}
                >
                  <option value="openai">OpenAI 兼容 (OpenAI, DeepSeek, 智谱等)</option>
                  <option value="gemini">Google Gemini 原生</option>
                  <option value="anthropic">Anthropic Claude 原生</option>
                  <option value="cloudflare">Cloudflare Workers AI</option>
                  <option value="ollama">Ollama 本地部署 (OpenAI 兼容)</option>
                </select>
              </div>
              <div className="setting-row">
                <div className="setting-row-label">{baseUrlLabel}</div>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={baseUrlPlaceholder}
                  value={apiBaseUrl}
                  onChange={e => setApiBaseUrl(e.target.value)}
                />
              </div>
              <div className="setting-row">
                <div className="setting-row-label">API Key</div>
                <input
                  type="password"
                  className="settings-input"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                />
              </div>
              <div className="setting-row">
                <div className="setting-row-label">模型名称</div>
                <input
                  type="text"
                  className="settings-input"
                  placeholder={modelPlaceholder}
                  value={modelName}
                  onChange={e => setModelName(e.target.value)}
                />
              </div>
              <div className="setting-row">
                <div>
                   <div className="setting-row-label">最大上传图片数量</div>
                   <div className="setting-row-desc">调试配置，部分模型单次限制传图，可在此时调整</div>
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
            </div>
          </>
        );

      case 'canvas':
        return (
          <>
            <h2>画板设置</h2>
            <div className="setting-group">
              <div className="setting-group-title">GeoGebra 配置</div>
              <div className="setting-row">
                <div>
                  <div className="setting-row-label">界面语言</div>
                  <div className="setting-row-desc">GeoGebra 画板的显示语言</div>
                </div>
                <select
                  className="settings-select"
                  value={ggbLanguage}
                  onChange={e => setGgbLanguage(e.target.value)}
                >
                  <option value="zh">简体中文 (zh)</option>
                  <option value="zh_TW">繁体中文 (zh_TW)</option>
                  <option value="en">English (en)</option>
                  <option value="fr">Français (fr)</option>
                  <option value="de">Deutsch (de)</option>
                  <option value="ja">日本語 (ja)</option>
                </select>
              </div>

              <div className="setting-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <div>
                  <div className="setting-row-label">画板背景色</div>
                  <div className="setting-row-desc" style={{ marginBottom: 10 }}>自定义画板的背景颜色（保存后生效）</div>
                </div>
                <div className="settings-color-palette">
                  {BG_COLORS.map(c => (
                    <button
                      key={c}
                      className={`settings-color-swatch ${ggbBgColor === c ? 'active' : ''}`}
                      style={{
                        background: c,
                        border: c === '#ffffff' ? '1px solid #e2e8f0' : '1px solid transparent'
                      }}
                      onClick={() => setGgbBgColor(c)}
                    />
                  ))}
                </div>
              </div>
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
                <span className="about-info-value">本地</span>
              </div>
              <div className="about-info-row">
                <span className="about-info-label">渲染引擎</span>
                <span className="about-info-value">GeoGebra Classic 5.0</span>
              </div>
              <div className="about-info-row">
                <span className="about-info-label">AI 协议标准</span>
                <span className="about-info-value">仅支持主流API标准，可手动适配</span>
              </div>
            </div>
            <div className="setting-row-desc" style={{ marginTop: 20 }}>
              MathAll 由 xhc861 开发，项目属于 SiiWay 团队。并遵循Apache 2.0 协议。
            </div>
          </>
        );
    }
  };

  const currentItemLabel = SIDEBAR_ITEMS.find(i => i.id === (mobileDetail || activeSection))?.label || '';

  return (
    <div className="settings-root">
      {saved && <div className="save-toast">设置已保存，正在返回工作台...</div>}

      <div className="macos-window">
        {/* macOS Title Bar */}
        <div className="macos-titlebar">
          <div style={{ paddingLeft: '16px', display: 'flex', alignItems: 'center' }}>
            <button className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem', border: 'none', background: 'transparent' }} onClick={() => navigate('/')}>
              <ChevronLeft size={16} /> 返回
            </button>
          </div>
          <div className="macos-titlebar-center">
            {isMobile && mobileDetail ? currentItemLabel : 'MathAll 设置'}
          </div>
          <div className="macos-titlebar-actions">
            <button
              className="btn btn-primary"
              style={{ padding: '6px 16px', fontSize: '0.82rem', borderRadius: '6px' }}
              onClick={handleSave}
            >
              <Save size={14} />
              {saved ? '已保存' : '保存'}
            </button>
          </div>
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
                      <div className="ios-list-icon" style={{ background: item.iconBg }}>
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

const DEFAULT_PROMPT = `你是一位严谨、顶尖的数学教研宗师级 AI 助手。请严格遵循以下工作流程：

【第一步：题目分类（流式输出，必须最先返回）】
请先输出4个字的题目标签用于分类，比如："几何最值"、"几何定值"、"立体几何"、"二次函数"、"函数综合"、"数形结合"等。

【第二步：常规解法（辅助线法）】
如果题目含有几何特征，请提供标准的辅助线几何解法，画出必要的辅助线。立体几何需明确辅助面或辅线。

【第三步：暴力解析几何法（坐标法，强制要求提供）】
对所有可以建系的题目（平面、立体几何、数形结合类），你必须强制补充【暴力代数解法】，使用以下工具：
- 两点距离（2D/3D）：d = √((x₁-x₂)²+(y₁-y₂)²+(z₁-z₂)²)
- 中点坐标
- 斜率、法向量等相关性质
- 鞋带公式等可以代数化的方法

【第四步：GeoGebra 指令输出】
将解法结果转化为 GeoGebra 的标准指令格式，每条指令一行，以便直接使用 evalCommand 执行。
若是立体几何问题，请务必使用三维坐标点（例如：A=(0,0,0)）以及立体几何配套命令（如 Sphere, Plane 等）。
若是平面几何问题则使用二维坐标（A=(0,0)）。

格式示例：
MODE: 2D/3D
A = (0, 0, 0)
B = (5, 0, 0)
poly1 = Polygon(A, B, C, D)
segment_AB = Segment(A, B)

如果涉及动点，请使用 Slider 变量来表达参数，例如：
t = Slider(0, 1, 0.01)
P = Point(...)

【输出要求】
- 确保 GeoGebra 指令语法正确，且变量命名合理。
- 对于求最值的问题，请标注最大/最小值的计算过程和结果。
- 如果涉及轨迹，请使用 Locus() 命令。`;
