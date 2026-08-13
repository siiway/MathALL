import { useEffect, useRef } from 'react';
import { readStorage } from '../utils/storage';

declare global {
  interface Window {
    GGBApplet: new (params: Record<string, unknown>, version?: string | boolean) => {
      inject: (el: string | HTMLElement) => void;
    };
  }
}

interface GeoGebraAppletProps {
  id?: string;
  appName?: 'classic' | '3d' | 'geometry';
  onReady?: (api: GeoGebraAPI) => void;
  /**
   * 销毁 applet 之前触发，调用方可以在这里保存现场。
   * 卸载时子组件的清理会先于父组件执行，父组件在自己的 cleanup 里已经拿不到可用的 api。
   */
  onBeforeDestroy?: (api: GeoGebraAPI) => void;
}

export interface GeoGebraAPI {
  evalCommand: (cmd: string) => boolean;
  evalCommandCAS: (cmd: string) => string;
  reset: () => void;
  setCoordSystem: (xmin: number, xmax: number, ymin: number, ymax: number) => void;
  getValue: (name: string) => number;
  getValueString: (name: string, useTemplate?: boolean) => string;
  setValue: (name: string, value: number) => void;
  setVisible: (name: string, visible: boolean) => void;
  setColor: (name: string, r: number, g: number, b: number) => void;
  setLineThickness: (name: string, thickness: number) => void;
  setPointSize: (name: string, size: number) => void;
  setFixed: (name: string, fixed: boolean) => void;
  deleteObject: (name: string) => void;
  exists: (name: string) => boolean;
  getAllObjectNames: (type?: string) => string[];
  getXcoord: (name: string) => number;
  getYcoord: (name: string) => number;
  getZcoord: (name: string) => number;
  getObjectType: (name: string) => string;
  getCommandString: (name: string, substituteNumbers?: boolean) => string;
  getLaTeXString: (name: string) => string;
  registerObjectUpdateListener: (name: string, callback: string) => void;
  registerAddListener: (callback: string) => void;
  setAnimating: (name: string, animating: boolean) => void;
  setAnimationSpeed: (name: string, speed: number) => void;
  isAnimationRunning: () => boolean;
  startAnimation: () => void;
  stopAnimation: () => void;
  getXML: () => string;
  setXML: (xml: string) => void;
  getBase64: () => string;
  setBase64: (base64: string) => void;
  setLabelVisible: (name: string, visible: boolean) => void;
  setLabelStyle: (name: string, style: number) => void;
  setCoords: (name: string, x: number, y: number, z?: number) => void;
  /** 可选：不同 GGB 版本对以下 API 的支持不一致，调用前需判空 */
  setSize?: (width: number, height: number) => void;
  getMinimum?: (name: string) => number;
  getMaximum?: (name: string) => number;
  remove?: () => void;
}

/** appName → GGB perspective code（"T" 才是 3D 图形区，旧代码里的 "5" 是错的）。 */
const PERSPECTIVE: Record<NonNullable<GeoGebraAppletProps['appName']>, string> = {
  classic: 'G',
  geometry: '2',
  '3d': 'T',
};

export default function GeoGebraApplet({
  id = 'ggb-applet',
  appName = 'classic',
  onReady,
  onBeforeDestroy,
}: GeoGebraAppletProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GeoGebraAPI | null>(null);

  // Use a ref to store the latest onReady callback to prevent stale closure issues
  const onReadyRef = useRef(onReady);
  const onBeforeDestroyRef = useRef(onBeforeDestroy);
  useEffect(() => {
    onReadyRef.current = onReady;
    onBeforeDestroyRef.current = onBeforeDestroy;
  }, [onReady, onBeforeDestroy]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let readyFired = false;

    // Clear out any existing applet to guarantee fresh re-mount on language change
    container.innerHTML = '';
    const previous = (window as unknown as Record<string, GeoGebraAPI | undefined>)[id];
    try {
      previous?.remove?.();
    } catch {
      /* ignore */
    }

    const applyBackgroundColor = (api: GeoGebraAPI) => {
      const bgColor = readStorage('mathall-ggb-bgcolor') || '#ffffff';
      if (!/^#[0-9a-fA-F]{6}$/.test(bgColor)) return;
      try {
        const xml = api.getXML();
        const r = parseInt(bgColor.slice(1, 3), 16);
        const g = parseInt(bgColor.slice(3, 5), 16);
        const b = parseInt(bgColor.slice(5, 7), 16);

        const newXml = xml.includes('<bgColor')
          ? xml.replace(/<bgColor[^>]*\/>/g, `<bgColor r="${r}" g="${g}" b="${b}"/>`)
          : xml.replace(/<euclidianView>/, `<euclidianView>\n<bgColor r="${r}" g="${g}" b="${b}"/>`);

        if (newXml !== xml) {
          api.setXML(newXml);
          // setXML 会重置视角，需要重新指定
          api.evalCommand(`SetPerspective("${PERSPECTIVE[appName]}")`);
        }
      } catch (e) {
        console.warn('Failed to set GeoGebra background color via XML:', e);
      }
    };

    const handleAppletLoad = (api: GeoGebraAPI) => {
      // GGB 在个别版本里会同时触发 appletOnLoad 与全局 ggbOnInit，去重避免代码执行两次
      if (disposed || readyFired) return;
      readyFired = true;

      apiRef.current = api;
      try {
        api.evalCommand(`SetPerspective("${PERSPECTIVE[appName]}")`);
      } catch (e) {
        console.warn('Failed to set perspective:', e);
      }
      applyBackgroundColor(api);
      onReadyRef.current?.(api);
    };

    const callbackName = `ggbOnInit_${id.replace(/-/g, '_')}`;
    (window as unknown as Record<string, unknown>)[callbackName] = () => {
      const api = (window as unknown as Record<string, GeoGebraAPI | undefined>)[id];
      if (api) handleAppletLoad(api);
    };

    const ggbLanguage = readStorage('mathall-ggb-language') || 'zh';

    const params: Record<string, unknown> = {
      appName: appName,
      width: container.clientWidth || 800,
      height: container.clientHeight || 600,
      codebase: '/GeoGebra/HTML5/5.0/web3d/',
      showToolBar: false,
      showAlgebraInput: false,
      showMenuBar: false,
      showResetIcon: false,
      enableLabelDrags: false,
      enableShiftDragZoom: true,
      enableRightClick: true,
      showZoomButtons: true,
      useBrowserForJS: true,
      borderColor: 'transparent',
      language: ggbLanguage,
      id: id,
      algebraInputPosition: 'none',
      showAlgebraView: false,
      perspective: PERSPECTIVE[appName],
      appletOnLoad: handleAppletLoad,
    };

    // deployggb.js 是普通 <script>，React 挂载时不一定已就绪，直接 new 会抛 TypeError
    let retryTimer: number | null = null;
    const tryInject = (attempt = 0) => {
      if (disposed || !containerRef.current) return;
      if (!window.GGBApplet) {
        if (attempt >= 40) { // ~10s
          console.error('GeoGebra deployggb.js 加载失败，画板无法初始化');
          return;
        }
        retryTimer = window.setTimeout(() => tryInject(attempt + 1), 250);
        return;
      }
      try {
        new window.GGBApplet(params, '6.0').inject(containerRef.current);
      } catch (e) {
        console.error('GeoGebra inject failed:', e);
      }
    };
    tryInject();

    return () => {
      disposed = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      delete (window as unknown as Record<string, unknown>)[callbackName];
      // 先让调用方存档，再销毁：销毁之后 getBase64 就取不到东西了
      if (apiRef.current) {
        try {
          onBeforeDestroyRef.current?.(apiRef.current);
        } catch (e) {
          console.warn('onBeforeDestroy failed:', e);
        }
      }
      // 不销毁 applet 会在模式切换 / 路由跳转时残留整个 GGB 运行时，非常吃内存
      try {
        apiRef.current?.remove?.();
      } catch {
        /* ignore */
      }
      apiRef.current = null;
      delete (window as unknown as Record<string, unknown>)[id];
      container.innerHTML = '';
    };
  }, [id, appName]);

  // Responsive resize —— 仅改 DOM 尺寸 GGB 不会重绘，必须调用 setSize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frame = 0;
    const ro = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      // ResizeObserver 每帧可能触发多次，用 rAF 合并，避免连续 setSize 造成卡顿
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const { width, height } = entry.contentRect;
        if (width < 1 || height < 1) return;
        try {
          apiRef.current?.setSize?.(Math.round(width), Math.round(height));
        } catch {
          /* 部分版本不支持 setSize */
        }
      });
    });
    ro.observe(container);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      id={`${id}-container`}
      style={{
        width: '100%',
        height: '100%',
        background: readStorage('mathall-ggb-bgcolor') || '#ffffff',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
