/**
 * 数值 → 精确代数形式的识别。
 *
 * 之前只认「平方后是整数」这一种情况（即 a√b），所以中学最值题里极常见的
 * 12/5、(3√5)/5、π/6 这类答案全部退化成 6 位小数。这里改成按优先级依次尝试：
 *   整数 → 有理数 → a√b/c → π 的有理数倍 → 小数兜底
 */

/** 最大公约数（对 0 安全）。 */
export function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

export interface Fraction {
  num: number;
  den: number;
}

/**
 * 连分数逼近：找出 |x - num/den| 足够小且 den ≤ maxDenominator 的最简分数。
 * 找不到返回 null（说明这个数大概率是无理数或带噪声）。
 *
 * 注意分母上限必须随容差收紧：狄利克雷逼近定理保证任意实数都存在
 * |x - p/q| < 1/q² 的有理逼近，所以只要 q 够大，π 也能"凑"成分数
 * （容差 1e-7 配 q≤1000 时，2.6833 会被识别成 2584/963 这种垃圾结果）。
 * 这里要求逼近质量显著优于 1/q²，即 q ≪ 1/√tolerance。
 */
export function toFraction(x: number, maxDenominator = 1000, tolerance = 1e-9): Fraction | null {
  if (!Number.isFinite(x)) return null;

  const sign = x < 0 ? -1 : 1;
  const target = Math.abs(x);
  const tol = tolerance * Math.max(1, target);
  const justifiedDenominator = Math.max(1, Math.floor(Math.sqrt(1 / Math.max(tolerance, 1e-15)) / 10));
  maxDenominator = Math.min(maxDenominator, justifiedDenominator);

  let numPrev = 0, num = 1;
  let denPrev = 1, den = 0;
  let frac = target;

  for (let i = 0; i < 64; i++) {
    const a = Math.floor(frac);
    const nextNum = a * num + numPrev;
    const nextDen = a * den + denPrev;
    if (nextDen > maxDenominator) break;

    numPrev = num; num = nextNum;
    denPrev = den; den = nextDen;

    if (den > 0 && Math.abs(num / den - target) <= tol) {
      const g = gcd(num, den) || 1;
      return { num: (sign * num) / g, den: den / g };
    }

    const rem = frac - a;
    if (rem < 1e-15) break;
    frac = 1 / rem;
  }

  return null;
}

/** 提取完全平方因子：n = coefficient² · radicand。 */
export function simplifySquareRoot(value: number): { coefficient: number; radicand: number } {
  if (!Number.isFinite(value) || value <= 0) return { coefficient: 0, radicand: 1 };

  let coefficient = 1;
  let radicand = Math.round(value);
  // 试除法是 O(√n)，被开方数太大时不值得（也基本不可能是题目里的"漂亮"答案）
  if (radicand > 1e8) return { coefficient: 1, radicand };

  for (let i = 2; i * i <= radicand; i++) {
    while (radicand % (i * i) === 0) {
      coefficient *= i;
      radicand /= (i * i);
    }
  }
  return { coefficient, radicand };
}

export function formatSquareRoot(coefficient: number, radicand: number): string {
  if (coefficient === 0) return '0';
  if (radicand === 1) return coefficient.toString();
  if (coefficient === 1) return `√${radicand}`;
  if (coefficient === -1) return `-√${radicand}`;
  return `${coefficient}√${radicand}`;
}

function formatFraction(num: number, den: number): string {
  return den === 1 ? String(num) : `${num}/${den}`;
}

/** 把 (sign·coefficient·√radicand)/denominator 拼成可读字符串。 */
function formatRadicalFraction(sign: number, coefficient: number, radicand: number, denominator: number): string {
  const g = gcd(coefficient, denominator) || 1;
  const c = coefficient / g;
  const d = denominator / g;
  const prefix = sign < 0 ? '-' : '';

  if (radicand === 1) return prefix + formatFraction(c, d);
  const head = c === 1 ? `√${radicand}` : `${c}√${radicand}`;
  return d === 1 ? prefix + head : `${prefix}${head}/${d}`;
}

export interface ExactFormOptions {
  /** 相对容差。数值扫描得到的结果精度低于直接测量值，可适当放宽。 */
  tolerance?: number;
  /** 兜底小数的位数。 */
  digits?: number;
  /** 允许出现的最大分母，超过就认为不是"漂亮"的答案。 */
  maxDenominator?: number;
  /** 允许出现的最大被开方数。 */
  maxRadicand?: number;
}

/**
 * 尝试把浮点数还原成精确形式；识别不出来时返回定点小数。
 */
export function formatExact(value: number, options: ExactFormOptions = {}): string {
  const {
    tolerance = 1e-9,
    digits = 6,
    maxDenominator = 1000,
    maxRadicand = 10000,
  } = options;

  if (!Number.isFinite(value)) return '';
  if (Math.abs(value) < tolerance) return '0';

  // ① 有理数（含整数）
  const rational = toFraction(value, maxDenominator, tolerance);
  if (rational) return formatFraction(rational.num, rational.den);

  // ② a√b/c —— 平方后若是有理数 p/q，则原值 = √(p·q)/q
  const squared = value * value;
  // 平方会把误差放大约 2|v| 倍，容差要跟着放大，否则 √5 这种值会漏判
  const squaredTolerance = tolerance * Math.max(1, 2 * Math.abs(value));
  const squaredFraction = toFraction(squared, Math.min(maxDenominator, 100), squaredTolerance);
  if (squaredFraction && squaredFraction.num > 0) {
    const inner = squaredFraction.num * squaredFraction.den;
    if (inner <= maxRadicand) {
      const { coefficient, radicand } = simplifySquareRoot(inner);
      if (coefficient > 0) {
        return formatRadicalFraction(Math.sign(value), coefficient, radicand, squaredFraction.den);
      }
    }
  }

  // ③ π 的有理数倍
  const piMultiple = toFraction(value / Math.PI, 64, tolerance);
  if (piMultiple) {
    const { num, den } = piMultiple;
    const sign = num < 0 ? '-' : '';
    const absNum = Math.abs(num);
    const head = absNum === 1 ? 'π' : `${absNum}π`;
    return den === 1 ? sign + head : `${sign}${head}/${den}`;
  }

  return value.toFixed(digits);
}

/**
 * 旧接口：只识别 a√b。保留是为了兼容既有调用，新代码请直接用 formatExact。
 * @deprecated 用 formatExact 代替
 */
export function decimalToExactRoot(decimalValue: number): string {
  if (!Number.isFinite(decimalValue)) return '';
  return formatExact(decimalValue);
}
