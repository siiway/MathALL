import { useState, useEffect, useCallback, useRef } from 'react';
import { Minimize2, X, Play, TrendingDown } from 'lucide-react';
import type { GeoGebraAPI } from './GeoGebraApplet';
import { formatExact } from '../utils/exactValue';
import { minimize, type SearchDimension } from '../utils/optimizer';

/** 参与搜索的维度上限：每多一维，坐标下降的开销就多一轮全区间粗扫。 */
const MAX_DIMENSIONS = 6;
/** 自由点在原位置周围的搜索半径。 */
const FREE_POINT_RADIUS = 10;

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
  /** 取到最小值时各参数的取值，便于用户回到画板上验证。 */
  argMin?: Array<{ name: string; value: number }>;
}

/**
 * 读取滑块 / 自由数值的取值范围。
 * 旧实现写的是 getValue("Min(t)")——getValue 只接受对象名，不接受表达式，
 * 永远返回 NaN，导致整个滑块扫描是空跑。
 */
function readRange(api: GeoGebraAPI, name: string): { min: number; max: number } | null {
  try {
    const min = api.getMinimum?.(name);
    const max = api.getMaximum?.(name);
    if (Number.isFinite(min) && Number.isFinite(max) && (min as number) < (max as number)) {
      return { min: min as number, max: max as number };
    }
  } catch {
    /* 部分版本没有这两个方法，走下面的解析回退 */
  }

  try {
    const cmd = api.getCommandString(name, false) || '';
    const match = cmd.match(/Slider[[(]\s*([^,]+)\s*,\s*([^,)\]]+)/);
    if (match) {
      const min = parseFloat(match[1]);
      const max = parseFloat(match[2]);
      if (Number.isFinite(min) && Number.isFinite(max) && min < max) return { min, max };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * 收集画板上所有"可以动"的量，作为搜索维度。
 * 优先用滑块/自由数值：它们是题目显式给出的参数；只有在完全没有参数时
 * 才退而求其次去挪自由点（挪点等于改变图形本身，通常不是题目的本意）。
 */
function collectDimensions(api: GeoGebraAPI): { dims: SearchDimension[]; restore: Array<() => void>; truncated: number } {
  const dims: SearchDimension[] = [];
  const restore: Array<() => void> = [];

  for (const name of api.getAllObjectNames('numeric')) {
    const range = readRange(api, name);
    if (!range) continue;
    const original = api.getValue(name);
    if (!Number.isFinite(original)) continue;
    restore.push(() => api.setValue(name, original));
    dims.push({
      name,
      min: range.min,
      max: range.max,
      start: original,
      set: value => api.setValue(name, value),
    });
  }

  if (dims.length === 0) {
    for (const name of api.getAllObjectNames('point')) {
      let cmd = '';
      try {
        cmd = api.getCommandString(name, false) || '';
      } catch {
        continue;
      }
      // 有定义式的点是从属点，动不了
      if (cmd && !cmd.includes('Point(')) continue;

      const originalX = api.getXcoord(name);
      const originalY = api.getYcoord(name);
      if (!Number.isFinite(originalX) || !Number.isFinite(originalY)) continue;

      // x、y 作为两个独立维度，但底层要一起写回去，所以共享一份坐标状态
      const coords = { x: originalX, y: originalY };
      const apply = () => api.setCoords(name, coords.x, coords.y);
      restore.push(() => api.setCoords(name, originalX, originalY));

      dims.push({
        name: `${name}.x`, min: originalX - FREE_POINT_RADIUS, max: originalX + FREE_POINT_RADIUS,
        start: originalX, set: v => { coords.x = v; apply(); },
      });
      dims.push({
        name: `${name}.y`, min: originalY - FREE_POINT_RADIUS, max: originalY + FREE_POINT_RADIUS,
        start: originalY, set: v => { coords.y = v; apply(); },
      });
    }
  }

  const truncated = Math.max(0, dims.length - MAX_DIMENSIONS);
  return { dims: dims.slice(0, MAX_DIMENSIONS), restore, truncated };
}

export default function MinimumCalculator({ ggbApi, isOpen, onClose }: MinimumCalculatorProps) {
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [result, setResult] = useState<MinimumResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [samplePoints, setSamplePoints] = useState(100);
  const cancelRef = useRef(false);

  // 加载所有线段
  const loadSegments = useCallback(() => {
    if (!ggbApi) return;

    try {
      const segmentList: SegmentInfo[] = [];

      ggbApi.getAllObjectNames('segment').forEach(name => {
        try {
          const length = ggbApi.getValue(name);
          if (!Number.isFinite(length)) return;
          const lengthStr = ggbApi.getValueString(name, false);

          // 尝试转换为根号形式
          let exactValue = lengthStr;
          if (!lengthStr.includes('√')) {
            const converted = formatExact(length);
            if (converted) exactValue = converted;
          }

          segmentList.push({
            name,
            currentLength: length,
            currentLengthExact: exactValue
          });
        } catch {
          // 跳过无法处理的对象
        }
      });

      setSegments(segmentList);
      // 之前选中的线段可能已被删除/重建，这里做一次校正
      setSelectedSegment(prev =>
        prev && segmentList.some(s => s.name === prev)
          ? prev
          : (segmentList[0]?.name ?? '')
      );
    } catch (error) {
      console.error('Error loading segments:', error);
    }
  }, [ggbApi]);

  // 计算线段的最小值
  const calculateMinimum = async () => {
    if (!ggbApi || !selectedSegment || isCalculating) return;

    const api = ggbApi;
    const target = selectedSegment;
    const startValue = api.getValue(target);

    cancelRef.current = false;
    setIsCalculating(true);
    setResult({
      segmentName: target,
      minimumValue: Infinity,
      minimumValueExact: '',
      currentValue: startValue,
      status: 'calculating'
    });

    // 扫描会真的去改画板上的值，必须记下原始状态，无论成功、失败还是中途取消都还原
    let restore: Array<() => void> = [];

    try {
      const collected = collectDimensions(api);
      restore = collected.restore;
      const { dims, truncated } = collected;

      if (dims.length === 0) {
        setResult({
          segmentName: target,
          minimumValue: 0,
          minimumValueExact: '无法计算',
          currentValue: startValue,
          status: 'error',
          message: '未找到可变动的参数（滑块、自由数值或自由点）'
        });
        return;
      }

      const result = await minimize(dims, () => api.getValue(target), {
        samples: samplePoints,
        shouldCancel: () => cancelRef.current,
        // 粗扫定位 + 黄金分割细化，函数值能收敛到接近双精度极限，
        // 精确值识别才有意义
        refineIterations: 80,
      });

      if (result.cancelled) {
        setResult({
          segmentName: target,
          minimumValue: 0,
          minimumValueExact: '已取消',
          currentValue: startValue,
          status: 'error',
          message: '计算已取消，画板已恢复原状'
        });
        return;
      }

      if (result.constant) {
        setResult({
          segmentName: target,
          minimumValue: result.value,
          minimumValueExact: formatExact(result.value),
          currentValue: startValue,
          status: 'error',
          message: `线段 ${target} 不随 ${dims.map(d => d.name).join('、')} 变化，长度恒为定值`
        });
        return;
      }

      if (!Number.isFinite(result.value)) {
        setResult({
          segmentName: target,
          minimumValue: 0,
          minimumValueExact: '无法计算',
          currentValue: startValue,
          status: 'error',
          message: '所有采样点上线段都无定义，请检查构型'
        });
        return;
      }

      const notes = [
        `${dims.length} 个参数联合搜索，${result.evaluations} 次求值，${result.rounds} 轮细化`,
      ];
      if (truncated > 0) {
        notes.push(`另有 ${truncated} 个参数因超出上限（${MAX_DIMENSIONS} 维）未参与搜索`);
      }

      setResult({
        segmentName: target,
        minimumValue: result.value,
        // 数值解带有约 1e-9 量级的残差，容差比直接测量值放宽
        minimumValueExact: formatExact(result.value, { tolerance: 1e-7 }),
        currentValue: startValue,
        status: 'success',
        message: notes.join('；'),
        argMin: result.at,
      });
    } catch (error) {
      console.error('Error calculating minimum:', error);
      setResult({
        segmentName: target,
        minimumValue: 0,
        minimumValueExact: '计算失败',
        currentValue: startValue,
        status: 'error',
        message: error instanceof Error ? error.message : '计算过程中出现错误'
      });
    } finally {
      // 逆序还原，保证画板回到扫描前的状态
      for (let i = restore.length - 1; i >= 0; i--) {
        try {
          restore[i]();
        } catch (e) {
          console.warn('恢复画板状态失败:', e);
        }
      }
      setIsCalculating(false);
    }
  };

  // 当对话框打开时加载线段
  useEffect(() => {
    if (isOpen && ggbApi) {
      loadSegments();
    }
  }, [isOpen, ggbApi, loadSegments]);

  // 关闭 / 卸载时中止正在进行的扫描，否则它会继续改画板
  useEffect(() => {
    if (!isOpen) {
      cancelRef.current = true;
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      cancelRef.current = true;
    };
  }, [isOpen, onClose]);

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
              每维粗扫点数: {samplePoints}
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
              <span>500 (不易漏极小点)</span>
            </div>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
              粗扫只负责定位极小点所在区间，之后会自动用黄金分割细化到接近双精度极限，
              所以最终精度不受这个点数限制；点数越大越不容易漏掉狭窄的极小点。
            </p>
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
                  {result.argMin && result.argMin.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        取到最小值时
                      </div>
                      <div style={{ fontSize: '0.9rem', fontFamily: 'monospace', display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                        {result.argMin.map(p => (
                          <span key={p.name}>{p.name} = {formatExact(p.value, { tolerance: 1e-6, digits: 4 })}</span>
                        ))}
                      </div>
                    </div>
                  )}
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
          {isCalculating ? (
            // 采样点拉到 500 时扫描要跑好几秒，必须给用户一个中止入口
            <button onClick={() => { cancelRef.current = true; }} className="btn btn-outline">
              停止
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-outline">
              关闭
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
