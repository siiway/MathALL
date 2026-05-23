// 计算最大公约数
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

// 简化分数
function simplifyFraction(numerator: number, denominator: number): { num: number; den: number } {
  const divisor = gcd(numerator, denominator);
  return {
    num: numerator / divisor,
    den: denominator / divisor
  };
}

// 简化根号
export function simplifySquareRoot(value: number): { coefficient: number; radicand: number } {
  if (value === 0) return { coefficient: 0, radicand: 1 };
  if (value < 0) return { coefficient: 0, radicand: 1 };

  let coefficient = 1;
  let radicand = Math.round(value);

  // 提取完全平方因子
  for (let i = 2; i * i <= radicand; i++) {
    while (radicand % (i * i) === 0) {
      coefficient *= i;
      radicand /= (i * i);
    }
  }

  return { coefficient, radicand };
}

// 格式化根号表达式
export function formatSquareRoot(coefficient: number, radicand: number): string {
  if (coefficient === 0) return '0';
  if (radicand === 1) return coefficient.toString();
  if (coefficient === 1) return `√${radicand}`;
  return `${coefficient}√${radicand}`;
}

// 将小数值尝试转换为根号形式
export function decimalToExactRoot(decimalValue: number): string {
  if (isNaN(decimalValue)) return '';

  const squared = decimalValue * decimalValue;
  const squaredInt = Math.round(squared * 1000000) / 1000000;
  const squaredRounded = Math.round(squaredInt);

  if (Math.abs(squaredInt - squaredRounded) < 0.0001) {
    const { coefficient, radicand } = simplifySquareRoot(squaredRounded);
    return formatSquareRoot(coefficient, radicand);
  }

  return decimalValue.toFixed(6);
}

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

  // 尝试将距离平方转换为整数（处理浮点误差）
  const distanceSquaredInt = Math.round(distanceSquared * 1000000) / 1000000;
  const distanceSquaredRounded = Math.round(distanceSquaredInt);

  let exact: string;

  // 检查是否接近整数
  if (Math.abs(distanceSquaredInt - distanceSquaredRounded) < 0.0001) {
    const { coefficient, radicand } = simplifySquareRoot(distanceSquaredRounded);
    exact = formatSquareRoot(coefficient, radicand);
  } else {
    // 尝试表示为分数形式的根号
    // 例如：√(5/4) = (√5)/2
    const scale = 10000;
    const scaledSquared = Math.round(distanceSquaredInt * scale);
    const { num, den } = simplifyFraction(scaledSquared, scale);

    if (den === 1) {
      const { coefficient, radicand } = simplifySquareRoot(num);
      exact = formatSquareRoot(coefficient, radicand);
    } else {
      // 检查分子是否可以简化根号
      const { coefficient, radicand } = simplifySquareRoot(num);
      const denSqrt = Math.sqrt(den);

      if (Math.abs(denSqrt - Math.round(denSqrt)) < 0.0001) {
        // 分母是完全平方数
        const denInt = Math.round(denSqrt);
        if (radicand === 1) {
          const { num: finalNum, den: finalDen } = simplifyFraction(coefficient, denInt);
          exact = finalDen === 1 ? finalNum.toString() : `${finalNum}/${finalDen}`;
        } else {
          const { num: finalNum, den: finalDen } = simplifyFraction(coefficient, denInt);
          if (finalDen === 1) {
            exact = formatSquareRoot(finalNum, radicand);
          } else {
            exact = finalNum === 1
              ? `√${radicand}/${finalDen}`
              : `${finalNum}√${radicand}/${finalDen}`;
          }
        }
      } else {
        // 使用小数表示
        exact = decimalDistance.toFixed(6);
      }
    }
  }

  return {
    decimal: decimalDistance,
    exact: exact,
    squared: distanceSquaredInt
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
