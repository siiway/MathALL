import { useEffect, useRef, useCallback } from 'react';

declare global {
  interface Window {
    GGBApplet: new (params: Record<string, unknown>, version?: string) => {
      inject: (el: string | HTMLElement) => void;
    };
  }
}

interface GeoGebraAppletProps {
  id?: string;
  appName?: 'classic' | '3d' | 'geometry';
  onReady?: (api: GeoGebraAPI) => void;
}

export interface GeoGebraAPI {
  evalCommand: (cmd: string) => boolean;
  reset: () => void;
  setCoordSystem: (xmin: number, xmax: number, ymin: number, ymax: number) => void;
  getValue: (name: string) => number;
  getValueString: (name: string) => string;
  setVisible: (name: string, visible: boolean) => void;
  setColor: (name: string, r: number, g: number, b: number) => void;
  setLineThickness: (name: string, thickness: number) => void;
  setPointSize: (name: string, size: number) => void;
  setFixed: (name: string, fixed: boolean) => void;
  deleteObject: (name: string) => void;
  exists: (name: string) => boolean;
  getAllObjectNames: () => string[];
  getXcoord: (name: string) => number;
  getYcoord: (name: string) => number;
  registerObjectUpdateListener: (name: string, callback: string) => void;
  registerAddListener: (callback: string) => void;
  setAnimating: (name: string, animating: boolean) => void;
  setAnimationSpeed: (name: string, speed: number) => void;
  startAnimation: () => void;
  stopAnimation: () => void;
  getXML: () => string;
  setXML: (xml: string) => void;
  getBase64: () => string;
  setBase64: (base64: string) => void;
}

export default function GeoGebraApplet({ id = 'ggb-applet', appName = 'classic', onReady }: GeoGebraAppletProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<GeoGebraAPI | null>(null);
  const injectedRef = useRef(false);

  const handleAppletLoad = useCallback(() => {
    // The GGB API is available on the global scope as `window[id]`
    const api = (window as unknown as Record<string, GeoGebraAPI>)[id];
    if (api) {
      apiRef.current = api;
      
      if (appName === 'classic') {
        api.evalCommand('SetPerspective("G")');
      } else if (appName === 'geometry') {
        api.evalCommand('SetPerspective("2")');
      } else if (appName === '3d') {
        api.evalCommand('SetPerspective("5")');
      }

      // Inject user-configured background color into GeoGebra via XML
      const bgColor = localStorage.getItem('mathall-ggb-bgcolor') || '#ffffff';
      try {
        const xml = api.getXML();
        // Parse hex to RGB
        const r = parseInt(bgColor.slice(1, 3), 16);
        const g = parseInt(bgColor.slice(3, 5), 16);
        const b = parseInt(bgColor.slice(5, 7), 16);
        // Replace or inject bgColor in the euclidianView XML
        let newXml = xml;
        if (xml.includes('bgColor')) {
          newXml = xml.replace(/bgColor="[^"]*"/g, `bgColor="#${bgColor.slice(1)}"`);
        } else {
          // Inject bgColor attribute into the <euclidianView> tag
          newXml = xml.replace(
            /<euclidianView>/,
            `<euclidianView>\n<bgColor r="${r}" g="${g}" b="${b}"/>`
          );
        }
        if (newXml !== xml) {
          api.setXML(newXml);
          if (appName === 'classic') {
            api.evalCommand('SetPerspective("G")');
          } else if (appName === 'geometry') {
            api.evalCommand('SetPerspective("2")');
          } else if (appName === '3d') {
            api.evalCommand('SetPerspective("5")');
          }
        }
      } catch (e) {
        console.warn('Failed to set GeoGebra background color via XML:', e);
      }

      onReady?.(api);
    }
  }, [id, onReady]);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear out any existing applet to guarantee fresh re-mount on language change
    if (containerRef.current) {
      containerRef.current.innerHTML = '';
    }
    try {
       const existingApi = (window as any)[id];
       if (existingApi && existingApi.remove) {
          existingApi.remove();
       }
    } catch(e){}

    const callbackName = `ggbOnInit_${id.replace(/-/g, '_')}`;
    (window as unknown as Record<string, () => void>)[callbackName] = handleAppletLoad;

    const ggbLanguage = localStorage.getItem('mathall-ggb-language') || 'zh';

    const params: Record<string, unknown> = {
      appName: 'classic', // Use classic engine and manage views via SetPerspective to prevent white screens
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
      showToolBar: false,
      showAlgebraInput: false,
      showMenuBar: false,
      showResetIcon: false,
      enableLabelDrags: false,
      enableShiftDragZoom: true,
      enableRightClick: false,
      showZoomButtons: true,
      useBrowserForJS: true, // Should remain true for api bridges
      borderColor: 'transparent',
      language: ggbLanguage,
      id: id,
      appletOnLoad: (api: GeoGebraAPI) => {
        apiRef.current = api;
        onReady?.(api);
      },
    };

    try {
      const applet = new window.GGBApplet(params, '5.0');
      applet.inject(containerRef.current);
      injectedRef.current = true;
    } catch (e) {
      console.warn('GeoGebra not ready yet, retrying...', e);
      // Retry after script loads
      const timer = setTimeout(() => {
        if (containerRef.current && window.GGBApplet) {
          const applet = new window.GGBApplet(params, '5.0');
          applet.inject(containerRef.current);
          injectedRef.current = true;
        }
      }, 2000);
      return () => clearTimeout(timer);
    }

    return () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
    };
  }, [id, appName, handleAppletLoad, onReady]);

  // Responsive resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => {
      // GeoGebra handles its own resizing via container dimensions
      const frame = container.querySelector('iframe, article, div[id]');
      if (frame instanceof HTMLElement) {
        frame.style.width = '100%';
        frame.style.height = '100%';
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      id={`${id}-container`}
      style={{
        width: '100%',
        height: '100%',
        background: localStorage.getItem('mathall-ggb-bgcolor') || '#ffffff',
        borderRadius: '12px',
        overflow: 'hidden',
        position: 'relative',
      }}
    />
  );
}
