import { useEffect, useState } from 'react';
import { X, Ruler } from 'lucide-react';
import type { GeoGebraAPI } from './GeoGebraApplet';
import { calculateAllDistances, type PointPairDistance } from '../utils/distanceCalculator';

interface DebugPanelProps {
  ggbApi: GeoGebraAPI | null;
  onClose: () => void;
}

interface PointInfo {
  name: string;
  x: number;
  y: number;
  z?: number;
}

type TabType = 'points' | 'distances';

export default function DebugPanel({ ggbApi, onClose }: DebugPanelProps) {
  const [points, setPoints] = useState<PointInfo[]>([]);
  const [distances, setDistances] = useState<PointPairDistance[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('points');

  useEffect(() => {
    if (!ggbApi) return;

    const updatePoints = () => {
      try {
        const allObjects = ggbApi.getAllObjectNames();
        const pointsList: PointInfo[] = [];

        allObjects.forEach(name => {
          try {
            const objType = ggbApi.getObjectType(name);
            if (objType === 'point') {
              const x = ggbApi.getXcoord(name);
              const y = ggbApi.getYcoord(name);
              const pointInfo: PointInfo = { name, x, y };

              // Try to get Z coordinate for 3D points
              try {
                // If it's a 3D point, getZcoord will return a number
                const zValue = ggbApi.getZcoord(name);
                if (!isNaN(zValue)) {
                  pointInfo.z = zValue;
                }
              } catch (e) {
                // Not a 3D point or z not available
              }

              pointsList.push(pointInfo);
            }
          } catch (e) {
            // Error getting object info
          }
        });

        setPoints(pointsList);

        // Calculate distances between all point pairs
        if (pointsList.length > 1) {
          const allDistances = calculateAllDistances(pointsList);
          setDistances(allDistances);
        } else {
          setDistances([]);
        }
      } catch (e) {
        console.error('Error updating points:', e);
      }
    };

    // Initial update
    updatePoints();

    // Update every 500ms to catch dynamic changes
    const interval = setInterval(updatePoints, 500);

    return () => clearInterval(interval);
  }, [ggbApi]);

  return (
    <div
      style={{
        position: 'absolute',
        top: '60px',
        right: '12px',
        width: '320px',
        maxHeight: '500px',
        background: 'var(--panel-bg)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-color)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)'
        }}
      >
        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600 }}>
          调试窗口
        </h4>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            color: 'var(--text-secondary)',
            borderRadius: '4px'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-color)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <X size={16} />
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--bg-color)'
        }}
      >
        <button
          onClick={() => setActiveTab('points')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'points' ? 'var(--panel-bg)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'points' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: activeTab === 'points' ? 600 : 400,
            color: activeTab === 'points' ? 'var(--primary-color)' : 'var(--text-secondary)',
            transition: 'all 0.2s'
          }}
        >
          点坐标 ({points.length})
        </button>
        <button
          onClick={() => setActiveTab('distances')}
          style={{
            flex: 1,
            padding: '10px',
            background: activeTab === 'distances' ? 'var(--panel-bg)' : 'transparent',
            border: 'none',
            borderBottom: activeTab === 'distances' ? '2px solid var(--primary-color)' : '2px solid transparent',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: activeTab === 'distances' ? 600 : 400,
            color: activeTab === 'distances' ? 'var(--primary-color)' : 'var(--text-secondary)',
            transition: 'all 0.2s',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px'
          }}
        >
          <Ruler size={14} />
          距离 ({distances.length})
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px'
        }}
      >
        {activeTab === 'points' ? (
          points.length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              暂无点对象
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {points.map((point, idx) => (
                <div
                  key={`${point.name}-${idx}`}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-color)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.85rem'
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: '6px',
                      color: 'var(--primary-color)'
                    }}
                  >
                    {point.name}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>x:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                        {point.x.toFixed(3)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>y:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                        {point.y.toFixed(3)}
                      </span>
                    </div>
                    {point.z !== undefined && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>z:</span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                          {point.z.toFixed(3)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          distances.length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.85rem'
              }}
            >
              需要至少2个点才能计算距离
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {distances.map((dist, idx) => (
                <div
                  key={`${dist.point1}-${dist.point2}-${idx}`}
                  style={{
                    padding: '10px 12px',
                    background: 'var(--bg-color)',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.85rem'
                  }}
                >
                  <div
                    style={{
                      fontWeight: 600,
                      marginBottom: '6px',
                      color: 'var(--primary-color)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span>{dist.point1}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>→</span>
                    <span>{dist.point2}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>精确值:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary-color)' }}>
                        {dist.distance.exact}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>小数值:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8rem' }}>
                        ≈ {dist.distance.decimal.toFixed(4)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>平方:</span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 500, fontSize: '0.8rem' }}>
                        {dist.distance.squared.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
