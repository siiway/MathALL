import { useEffect, useState } from 'react';
import { X, RotateCw, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';

interface ImageViewerProps {
  imageUrl: string;
  onClose: () => void;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;

export default function ImageViewer({ imageUrl, onClose }: ImageViewerProps) {
  // 注意：调用方需要给本组件传 key={imageUrl}，换图时整体重挂载即可重置视角
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === '+' || e.key === '=') setScale(s => Math.min(s + 0.25, MAX_SCALE));
      else if (e.key === '-') setScale(s => Math.max(s - 0.25, MIN_SCALE));
      else if (e.key.toLowerCase() === 'r') setRotation(r => (r + 90) % 360);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleRotate = (e: React.MouseEvent) => {
    stop(e);
    setRotation(prev => (prev + 90) % 360);
  };

  const handleZoomIn = (e: React.MouseEvent) => {
    stop(e);
    setScale(prev => Math.min(prev + 0.25, MAX_SCALE));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    stop(e);
    setScale(prev => Math.max(prev - 0.25, MIN_SCALE));
  };

  const handleReset = (e: React.MouseEvent) => {
    stop(e);
    setScale(1);
    setRotation(0);
  };

  const handleClose = (e: React.MouseEvent) => {
    stop(e);
    onClose();
  };

  const btnStyle: React.CSSProperties = {
    background: 'transparent',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center'
  };

  return (
    <div
      className="image-viewer-overlay"
      onClick={onClose}
      onWheel={(e) => {
        // 滚轮缩放：大图看细节时比反复点按钮顺手
        setScale(prev => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev - Math.sign(e.deltaY) * 0.15)));
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 0.2s ease-out',
        pointerEvents: 'auto',
        overflow: 'hidden'
      }}
    >
      <div
        onClick={stop}
        style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          background: 'rgba(0, 0, 0, 0.7)',
          padding: '8px 12px',
          borderRadius: '8px',
          backdropFilter: 'blur(10px)',
          zIndex: 100002
        }}
      >
        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(scale * 100)}%
        </span>
        <button onClick={handleZoomOut} style={btnStyle} title="缩小 (-)">
          <ZoomOut size={20} />
        </button>
        <button onClick={handleZoomIn} style={btnStyle} title="放大 (+)">
          <ZoomIn size={20} />
        </button>
        <button onClick={handleRotate} style={btnStyle} title="旋转 (R)">
          <RotateCw size={20} />
        </button>
        <button onClick={handleReset} style={btnStyle} title="重置视图">
          <RefreshCw size={20} />
        </button>
        <button onClick={handleClose} style={btnStyle} title="关闭 (Esc)">
          <X size={20} />
        </button>
      </div>

      <img
        src={imageUrl}
        alt="查看图片"
        onClick={stop}
        draggable={false}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          transform: `rotate(${rotation}deg) scale(${scale})`,
          transition: 'transform 0.2s ease',
          borderRadius: '8px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
      />
    </div>
  );
}
