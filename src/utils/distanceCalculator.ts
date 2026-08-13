import { formatExact } from './exactValue';

// 精确形式的识别统一收敛到 exactValue，这里只保留几何计算。
// 旧版在本文件里手写了一套「平方是否接近整数 → 拆分数 → 判断分母是否完全平方」的
// 分支，能力比 formatExact 弱（认不出 12/5、π/6），而且和 decimalToExactRoot 各算各的。
export { simplifySquareRoot, formatSquareRoot, decimalToExactRoot, formatExact } from './exactValue';

// 计算两点之间的距离（保留根号形式）
export interface DistanceResult {
  decimal: number;
  exact: string;
  squared: number;
}

export function calculateDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  z1?: number,
  z2?: number
): DistanceResult {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dz = (z1 !== undefined && z2 !== undefined) ? z2 - z1 : 0;

  const distanceSquared = dx * dx + dy * dy + dz * dz;
  const decimalDistance = Math.sqrt(distanceSquared);

  return {
    decimal: decimalDistance,
    exact: formatExact(decimalDistance),
    // 抹掉浮点噪声，让 3 这样的平方值不显示成 2.9999999996
    squared: Math.round(distanceSquared * 1e6) / 1e6,
  };
}

// 批量计算所有点对之间的距离
export interface PointPairDistance {
  point1: string;
  point2: string;
  distance: DistanceResult;
}

export function calculateAllDistances(
  points: Array<{ name: string; x: number; y: number; z?: number }>
): PointPairDistance[] {
  const distances: PointPairDistance[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];

      const distance = calculateDistance(
        p1.x, p1.y, p2.x, p2.y,
        p1.z, p2.z
      );

      distances.push({
        point1: p1.name,
        point2: p2.name,
        distance
      });
    }
  }

  return distances;
}
