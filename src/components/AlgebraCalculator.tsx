import { useState } from 'react';
import { Calculator, TrendingUp, Ruler, X, Copy, Check } from 'lucide-react';
import type { GeoGebraAPI } from './GeoGebraApplet';
import { decimalToExactRoot } from '../utils/distanceCalculator';

interface AlgebraCalculatorProps {
  ggbApi: GeoGebraAPI | null;
  isOpen: boolean;
  onClose: () => void;
}

interface CalculationResult {
  type: 'trajectory' | 'extremum' | 'length' | 'area';
  label: string;
  expression: string;
  exactValue?: string;
  decimalValue?: number;
  description: string;
}

export default function AlgebraCalculator({ ggbApi, isOpen, onClose }: AlgebraCalculatorProps) {
  const [results, setResults] = useState<CalculationResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activeMode, setActiveMode] = useState<'trajectory' | 'extremum' | 'measure'>('measure');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 提取所有对象的长度和面积
  const extractMeasurements = () => {
    if (!ggbApi) return;

    setIsCalculating(true);
    const newResults: CalculationResult[] = [];

    try {
      const allObjects = ggbApi.getAllObjectNames();

      allObjects.forEach(name => {
        try {
          const objType = ggbApi.getObjectType(name);

          // 处理线段 (segment)
          if (objType === 'segment') {
            try {
              const decimalValue = ggbApi.getValue(name);
              let exactValue = ggbApi.getValueString(name, false);
              
              // 尝试使用 CAS 获取绝对精确的代数形式
              try {
                if (ggbApi.evalCommandCAS) {
                  const casResult = ggbApi.evalCommandCAS(`Length(${name})`);
                  if (casResult && casResult !== '?' && casResult.trim() !== '') {
                    exactValue = casResult;
                  }
                }
              } catch (casErr) {
                // Ignore CAS errors, fallback to previous method
              }

              // 如果精确值仍然是小数，并且没有根号，尝试自己转换
              if (!exactValue.includes('√') && !exactValue.includes('sqrt') && !isNaN(decimalValue)) {
                const converted = decimalToExactRoot(decimalValue);
                if (converted) exactValue = converted;
              }

              newResults.push({
                type: 'length',
                label: name,
                expression: `Length(${name})`,
                exactValue: exactValue,
                decimalValue: decimalValue,
                description: `线段 ${name} 的长度`
              });
            } catch (e) {
              console.error(`Error processing segment ${name}:`, e);
            }
          }

          // 处理多边形和圆锥曲线 (polygon / conic)
          else if (objType === 'polygon' || objType === 'conic') {
            try {
              // 计算周长
              let perimeterValue = NaN;
              let perimeterStr = '';
              try {
                if (ggbApi.evalCommandCAS) {
                  const casPerimeter = ggbApi.evalCommandCAS(`Perimeter(${name})`);
                  if (casPerimeter && casPerimeter !== '?') {
                    perimeterStr = casPerimeter;
                    const numResult = ggbApi.evalCommandCAS(`Numeric(Perimeter(${name}))`);
                    if (numResult && numResult !== '?') {
                      perimeterValue = parseFloat(numResult);
                    }
                  }
                }
              } catch(e) {}
              
              // 回退逻辑：如果 CAS 失败或没有结果
              if (!perimeterStr || isNaN(perimeterValue)) {
                const tempId = `temp_perim_${Math.floor(Math.random()*100000)}`;
                ggbApi.evalCommand(`${tempId} = Perimeter(${name})`);
                if (ggbApi.exists(tempId)) {
                  perimeterValue = ggbApi.getValue(tempId);
                  if (!perimeterStr) perimeterStr = ggbApi.getValueString(tempId, false);
                  ggbApi.deleteObject(tempId);
                }
              }

              if (!isNaN(perimeterValue) && perimeterValue > 0) {
                newResults.push({
                  type: 'length',
                  label: `${name}_周长`,
                  expression: `Perimeter(${name})`,
                  exactValue: perimeterStr,
                  decimalValue: perimeterValue,
                  description: `${objType === 'polygon' ? '多边形' : '曲线'} ${name} 的周长`
                });
              }

              // 计算面积
              let areaValue = NaN;
              let areaStr = '';
              try {
                if (ggbApi.evalCommandCAS) {
                  const casArea = ggbApi.evalCommandCAS(`Area(${name})`);
                  if (casArea && casArea !== '?') {
                    areaStr = casArea;
                    const numResult = ggbApi.evalCommandCAS(`Numeric(Area(${name}))`);
                    if (numResult && numResult !== '?') {
                      areaValue = parseFloat(numResult);
                    }
                  }
                }
              } catch(e) {}

              // 回退逻辑
              if (!areaStr || isNaN(areaValue)) {
                const tempId = `temp_area_${Math.floor(Math.random()*100000)}`;
                ggbApi.evalCommand(`${tempId} = Area(${name})`);
                if (ggbApi.exists(tempId)) {
                  areaValue = ggbApi.getValue(tempId);
                  if (!areaStr) areaStr = ggbApi.getValueString(tempId, false);
                  ggbApi.deleteObject(tempId);
                }
              }

              if (!isNaN(areaValue) && areaValue > 0) {
                newResults.push({
                  type: 'area',
                  label: `${name}_面积`,
                  expression: `Area(${name})`,
                  exactValue: areaStr,
                  decimalValue: areaValue,
                  description: `${objType === 'polygon' ? '多边形' : '曲线'} ${name} 的面积`
                });
              }
            } catch (e) {
              console.error(`Error processing closed curve ${name}:`, e);
            }
          }

        } catch (e) {
          console.error(`Error processing object ${name}:`, e);
        }
      });

      setResults(newResults);
    } catch (error) {
      console.error('Error extracting measurements:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // 计算动点轨迹
  const calculateTrajectory = () => {
    if (!ggbApi) return;

    setIsCalculating(true);
    const newResults: CalculationResult[] = [];

    try {
      const allObjects = ggbApi.getAllObjectNames();

      // 查找所有点对象
      const points = allObjects.filter(name => {
        try {
          return ggbApi.getObjectType(name) === 'point';
        } catch (e) {
          return false;
        }
      });

      // 对每个点显示坐标信息
      points.forEach(pointName => {
        try {
          const x = ggbApi.getXcoord(pointName);
          const y = ggbApi.getYcoord(pointName);
          let z: number | undefined;

          try {
            z = ggbApi.getZcoord(pointName);
            if (isNaN(z)) z = undefined;
          } catch (e) {
            z = undefined;
          }

          const coordStr = z !== undefined
            ? `(${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`
            : `(${x.toFixed(3)}, ${y.toFixed(3)})`;

          newResults.push({
            type: 'trajectory',
            label: pointName,
            expression: coordStr,
            exactValue: coordStr,
            decimalValue: Math.sqrt(x*x + y*y + (z||0)*(z||0)),
            description: `点 ${pointName} 的当前坐标`
          });

          // 尝试获取点的定义命令
          try {
            const cmdStr = ggbApi.getCommandString(pointName, false);
            if (cmdStr && cmdStr.length > 0 && !cmdStr.includes('Point')) {
              newResults.push({
                type: 'trajectory',
                label: `${pointName}_定义`,
                expression: cmdStr,
                exactValue: cmdStr,
                description: `点 ${pointName} 的定义`
              });
            }
          } catch (e) {
            // 无法获取命令
          }
        } catch (e) {
          console.error(`Error processing point ${pointName}:`, e);
        }
      });

      setResults(newResults);
    } catch (error) {
      console.error('Error calculating trajectory:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // 计算极值
  const calculateExtremum = () => {
    if (!ggbApi) return;

    setIsCalculating(true);
    const newResults: CalculationResult[] = [];

    try {
      const allObjects = ggbApi.getAllObjectNames();

      // 查找所有数值对象和函数
      allObjects.forEach(name => {
        try {
          const objType = ggbApi.getObjectType(name);

          // 处理数值对象
          if (objType === 'numeric') {
            const value = ggbApi.getValue(name);
            const valueStr = ggbApi.getValueString(name, false);

            if (!isNaN(value) && isFinite(value)) {
              newResults.push({
                type: 'extremum',
                label: name,
                expression: valueStr,
                exactValue: valueStr,
                decimalValue: value,
                description: `数值 ${name} 的当前值`
              });
            }
          }

          // 处理函数对象
          if (objType === 'function') {
            try {
              const cmdStr = ggbApi.getCommandString(name, false);
              newResults.push({
                type: 'extremum',
                label: name,
                expression: cmdStr,
                exactValue: cmdStr,
                description: `函数 ${name} 的定义`
              });

              // 尝试计算极值点
              const extremumCmd = `Extremum(${name})`;
              ggbApi.evalCommand(`extremum_${name} = ${extremumCmd}`);

              // 检查是否成功创建了极值点
              if (ggbApi.exists(`extremum_${name}`)) {
                const extremumStr = ggbApi.getValueString(`extremum_${name}`, false);
                newResults.push({
                  type: 'extremum',
                  label: `${name}_极值`,
                  expression: extremumCmd,
                  exactValue: extremumStr,
                  description: `函数 ${name} 的极值点`
                });
                ggbApi.deleteObject(`extremum_${name}`);
              }
            } catch (e) {
              console.error(`Error processing function ${name}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error processing object ${name}:`, e);
        }
      });

      setResults(newResults);
    } catch (error) {
      console.error('Error calculating extremum:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleCalculate = () => {
    switch (activeMode) {
      case 'trajectory':
        calculateTrajectory();
        break;
      case 'extremum':
        calculateExtremum();
        break;
      case 'measure':
        extractMeasurements();
        break;
    }
  };

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

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
          maxWidth: '600px',
          maxHeight: '80vh',
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
            <Calculator size={24} style={{ color: 'var(--primary-color)' }} />
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
              代数暴力测算工具
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

        {/* Mode Selector */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            gap: '8px'
          }}
        >
          <button
            onClick={() => setActiveMode('measure')}
            className="btn"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: activeMode === 'measure' ? 'var(--primary-color)' : 'var(--bg-color)',
              color: activeMode === 'measure' ? 'white' : 'inherit',
              border: activeMode === 'measure' ? 'none' : '1px solid var(--border-color)'
            }}
          >
            <Ruler size={16} />
            <span>长度/面积</span>
          </button>
          <button
            onClick={() => setActiveMode('trajectory')}
            className="btn"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: activeMode === 'trajectory' ? 'var(--primary-color)' : 'var(--bg-color)',
              color: activeMode === 'trajectory' ? 'white' : 'inherit',
              border: activeMode === 'trajectory' ? 'none' : '1px solid var(--border-color)'
            }}
          >
            <TrendingUp size={16} />
            <span>动点轨迹</span>
          </button>
          <button
            onClick={() => setActiveMode('extremum')}
            className="btn"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: activeMode === 'extremum' ? 'var(--primary-color)' : 'var(--bg-color)',
              color: activeMode === 'extremum' ? 'white' : 'inherit',
              border: activeMode === 'extremum' ? 'none' : '1px solid var(--border-color)'
            }}
          >
            <Calculator size={16} />
            <span>最值计算</span>
          </button>
        </div>

        {/* Description */}
        <div
          style={{
            padding: '16px',
            background: 'var(--bg-color)',
            borderBottom: '1px solid var(--border-color)'
          }}
        >
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            {activeMode === 'measure' && '自动提取画板中所有对象的长度、周长和面积值'}
            {activeMode === 'trajectory' && '分析动点的运动轨迹和位置信息'}
            {activeMode === 'extremum' && '计算函数和表达式的最大值、最小值'}
          </p>
        </div>

        {/* Results */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px'
          }}
        >
          {results.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: 'var(--text-secondary)'
              }}
            >
              <Calculator size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p style={{ margin: 0, fontSize: '0.9rem' }}>
                点击下方"开始计算"按钮进行分析
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {results.map((result, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    background: 'var(--bg-color)',
                    borderRadius: '12px',
                    border: '1px solid var(--border-color)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {result.type === 'length' && <Ruler size={16} style={{ color: 'var(--primary-color)' }} />}
                        {result.type === 'area' && <Calculator size={16} style={{ color: 'var(--primary-color)' }} />}
                        {result.type === 'trajectory' && <TrendingUp size={16} style={{ color: 'var(--primary-color)' }} />}
                        {result.type === 'extremum' && <TrendingUp size={16} style={{ color: 'var(--primary-color)' }} />}
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
                          {result.label}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {result.description}
                      </p>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>表达式: </span>
                          {result.expression}
                        </div>
                        {result.exactValue && (
                          <div style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>精确值: </span>
                            {result.exactValue}
                          </div>
                        )}
                        {result.decimalValue !== undefined && (
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            小数值: ≈ {result.decimalValue.toFixed(6)}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(result.exactValue || result.expression, index)}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px',
                        padding: '6px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        color: copiedIndex === index ? 'var(--primary-color)' : 'var(--text-secondary)'
                      }}
                      title="复制"
                    >
                      {copiedIndex === index ? <Check size={16} /> : <Copy size={16} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '12px',
            background: 'var(--bg-secondary)'
          }}
        >
          <button
            onClick={handleCalculate}
            disabled={isCalculating || !ggbApi}
            className="btn btn-primary"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <Calculator size={18} />
            <span>{isCalculating ? '计算中...' : '开始计算'}</span>
          </button>
          <button
            onClick={() => setResults([])}
            disabled={results.length === 0}
            className="btn btn-outline"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <X size={18} />
            <span>清空结果</span>
          </button>
        </div>
      </div>
    </div>
  );
}
