import { useState } from 'react';
import { Minimize2, X, Play, TrendingDown } from 'lucide-react';
import type { GeoGebraAPI } from './GeoGebraApplet';
import { formatSquareRoot, simplifySquareRoot, decimalToExactRoot } from '../utils/distanceCalculator';

interface MinimumCalculatorProps {
  ggbApi: GeoGebraAPI | null;
  isOpen: boolean;
  onClose: () => void;
}

interface SegmentInfo {
  name: string;
  currentLength: number;
  currentLengthExact: string;
}

interface MinimumResult {
  segmentName: string;
  minimumValue: number;
  minimumValueExact: string;
  currentValue: number;
  status: 'calculating' | 'success' | 'error';
  message?: string;
}

export default function MinimumCalculator({ ggbApi, isOpen, onClose }: MinimumCalculatorProps) {
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [result, setResult] = useState<MinimumResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [samplePoints, setSamplePoints] = useState(100);

  // 加载所有线段
  const loadSegments = () => {
    if (!ggbApi) return;

    try {
      const allObjects = ggbApi.getAllObjectNames();
      const segmentList: SegmentInfo[] = [];

      allObjects.forEach(name => {
        try {
          const objType = ggbApi.getObjectType(name);
          if (objType === 'segment') {
            const length = ggbApi.getValue(name);
            const lengthStr = ggbApi.getValueString(name, false);

            // 尝试转换为根号形式
            let exactValue = lengthStr;
            if (!lengthStr.includes('√') && !isNaN(length)) {
              const converted = decimalToExactRoot(length);
              if (converted) exactValue = converted;
            }

            segmentList.push({
              name,
              currentLength: length,
              currentLengthExact: exactValue
            });
          }
        } catch (e) {
          // 跳过无法处理的对象
        }
      });

      setSegments(segmentList);
      if (segmentList.length > 0 && !selectedSegment) {
        setSelectedSegment(segmentList[0].name);
      }
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  };

  // 计算线段的最小值
  const calculateMinimum = async () => {
    if (!ggbApi || !selectedSegment) return;

    setIsCalculating(true);
    setResult({
      segmentName: selectedSegment,
      minimumValue: Infinity,
      minimumValueExact: '',
      currentValue: ggbApi.getValue(selectedSegment),
      status: 'calculating'
    });

    try {
      // 获取线段的定义命令
      const cmdStr = ggbApi.getCommandString(selectedSegment, false);
      console.log('Segment definition:', cmdStr);

      // 尝试找到可以移动的点（自由点或依赖于滑块的点）
      const allObjects = ggbApi.getAllObjectNames();
      const freePoints: string[] = [];
      const sliders: string[] = [];

      allObjects.forEach(name => {
        try {
          const objType = ggbApi.getObjectType(name);
          if (objType === 'point') {
            // 检查点是否可以移动
            const cmdStr = ggbApi.getCommandString(name, false);
            if (!cmdStr || cmdStr.length === 0 || cmdStr.includes('Point(')) {
              freePoints.push(name);
            }
          } else if (objType === 'numeric') {
            // 检查是否是滑块
            const cmdStr = ggbApi.getCommandString(name, false);
            if (cmdStr.includes('Slider')) {
              sliders.push(name);
            }
          }
        } catch (e) {
          // 跳过
        }
      });

      console.log('Free points:', freePoints);
      console.log('Sliders:', sliders);

      let minValue = Infinity;
      let minValueExact = '';

      // 如果有滑块，遍历滑块的值
      if (sliders.length > 0) {
        for (const slider of sliders) {
          try {
            // 获取滑块的范围
            const min = ggbApi.getValue(`Min(${slider})`);
            const max = ggbApi.getValue(`Max(${slider})`);
            const step = (max - min) / samplePoints;

            for (let i = 0; i <= samplePoints; i++) {
              const value = min + i * step;
              ggbApi.evalCommand(`${slider} = ${value}`);

              // 等待一小段时间让 GeoGebra 更新
              await new Promise(resolve => setTimeout(resolve, 1));

              const length = ggbApi.getValue(selectedSegment);
              if (!isNaN(length) && length < minValue) {
                minValue = length;
              }
            }
          } catch (e) {
            console.error(`Error processing slider ${slider}:`, e);
          }
        }
      }

      // 如果有自由点，尝试在一定范围内移动
      if (freePoints.length > 0 && minValue === Infinity) {
        const searchRange = 10;
        const searchStep = 0.5;

        for (const point of freePoints) {
          try {
            const originalX = ggbApi.getXcoord(point);
            const originalY = ggbApi.getYcoord(point);

            for (let x = originalX - searchRange; x <= originalX + searchRange; x += searchStep) {
              for (let y = originalY - searchRange; y <= originalY + searchRange; y += searchStep) {
                ggbApi.evalCommand(`SetCoords(${point}, ${x}, ${y})`);

                await new Promise(resolve => setTimeout(resolve, 1));

                const length = ggbApi.getValue(selectedSegment);
                if (!isNaN(length) && length < minValue) {
                  minValue = length;
                }
              }
            }

            // 恢复原始位置
            ggbApi.evalCommand(`SetCoords(${point}, ${originalX}, ${originalY})`);
          } catch (e) {
            console.error(`Error processing point ${point}:`, e);
          }
        }
      }

      // 转换为根号形式
      if (minValue !== Infinity) {
        minValueExact = decimalToExactRoot(minValue);

        setResult({
          segmentName: selectedSegment,
          minimumValue: minValue,
          minimumValueExact: minValueExact,
          currentValue: ggbApi.getValue(selectedSegment),
          status: 'success',
          message: `在 ${samplePoints} 个采样点中找到最小值`
        });
      } else {
        setResult({
          segmentName: selectedSegment,
          minimumValue: 0,
          minimumValueExact: '无法计算',
          currentValue: ggbApi.getValue(selectedSegment),
          status: 'error',
          message: '未找到可变动的参数（滑块或自由点）'
        });
      }
    } catch (error: any) {
      console.error('Error calculating minimum:', error);
      setResult({
        segmentName: selectedSegment,
        minimumValue: 0,
        minimumValueExact: '计算失败',
        currentValue: ggbApi.getValue(selectedSegment),
        status: 'error',
        message: error.message || '计算过程中出现错误'
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // 当对话框打开时加载线段
  useEffect(() => {
    if (isOpen && ggbApi) {
      loadSegments();
    }
  }, [isOpen, ggbApi]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          background: 'var(--panel-bg)',
          borderRadius: '16px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Minimize2 size={24} style={{ color: 'var(--primary-color)' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              线段最小值计算
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              color: 'var(--text-secondary)',
              borderRadius: '8px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-color)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 线段选择 */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>
              选择线段
            </label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-color)',
                fontSize: '0.9rem'
              }}
            >
              {segments.length === 0 ? (
                <option>暂无线段</option>
              ) : (
                segments.map(seg => (
                  <option key={seg.name} value={seg.name}>
                    {seg.name} (当前长度: {seg.currentLengthExact})
                  </option>
                ))
              )}
            </select>
            <button
              onClick={loadSegments}
              className="btn btn-outline"
              style={{ marginTop: '8px', width: '100%', fontSize: '0.85rem' }}
            >
              刷新线段列表
            </button>
          </div>

          {/* 采样点数 */}
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, fontSize: '0.9rem' }}>
              采样点数: {samplePoints}
            </label>
            <input
              type="range"
              min="10"
              max="500"
              step="10"
              value={samplePoints}
              onChange={(e) => setSamplePoints(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              <span>10 (快速)</span>
              <span>500 (精确)</span>
            </div>
          </div>

          {/* 结果显示 */}
          {result && (
            <div
              style={{
                padding: '16px',
                background: result.status === 'error' ? 'rgba(244, 63, 94, 0.1)' : 'var(--bg-color)',
                borderRadius: '12px',
                border: `1px solid ${result.status === 'error' ? 'rgba(244, 63, 94, 0.3)' : 'var(--border-color)'}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <TrendingDown size={20} style={{ color: 'var(--primary-color)' }} />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>计算结果</h3>
              </div>

              {result.status === 'calculating' ? (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>
                  <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
                  <p>正在计算中...</p>
                </div>
              ) : result.status === 'error' ? (
                <div style={{ color: 'var(--text-secondary)' }}>
                  <p style={{ margin: 0 }}>{result.message}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      最小值（精确）
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                      {result.minimumValueExact}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      最小值（小数）
                    </div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600, fontFamily: 'monospace' }}>
                      ≈ {result.minimumValue.toFixed(6)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      当前值
                    </div>
                    <div style={{ fontSize: '1rem', fontFamily: 'monospace' }}>
                      {result.currentValue.toFixed(6)}
                    </div>
                  </div>
                  {result.message && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '8px' }}>
                      {result.message}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '12px',
            background: 'var(--bg-secondary)'
          }}
        >
          <button
            onClick={calculateMinimum}
            disabled={isCalculating || !selectedSegment || segments.length === 0}
            className="btn btn-primary"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Play size={18} />
            <span>{isCalculating ? '计算中...' : '开始计算'}</span>
          </button>
          <button
            onClick={onClose}
            className="btn btn-outline"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
