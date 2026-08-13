/**
 * 多参数数值最小化。
 *
 * 原来的做法是「每个滑块各自从头扫到尾，其余参数保持不动」，两个问题：
 *   1. 多参数题目求不出真正的最小值（真正的极小点通常需要多个参数同时移动）；
 *   2. 只取采样点上的最小值，精度被采样步长卡死（100 个点 ≈ 1% 误差），
 *      精确值识别自然也就无从谈起。
 *
 * 这里改成「坐标下降 + 黄金分割细化」：每一维先粗扫定位极小点所在区间，
 * 再在该区间内做黄金分割逼近，然后换下一维，反复若干轮直到不再改善。
 * 目标函数在极小点附近是二次的，所以函数值的收敛比自变量快一个量级——
 * 这正是我们要的：要的是最小值本身，而不是取到最小值的位置。
 */

export interface SearchDimension {
  /** 展示用名称，例如 "t" 或 "P.x"。 */
  name: string;
  min: number;
  max: number;
  /** 搜索起点（通常是当前值）。 */
  start: number;
  /** 把该维设成给定值。 */
  set: (value: number) => void;
}

export interface MinimizeOptions {
  /** 每一维粗扫的采样点数。 */
  samples?: number;
  /** 坐标下降的最大轮数。 */
  rounds?: number;
  /** 每维黄金分割细化的迭代次数。 */
  refineIterations?: number;
  /** 相对改善小于该值即认为收敛。 */
  tolerance?: number;
  /** 返回 true 时立即停止。 */
  shouldCancel?: () => boolean;
  /** 每执行这么多次目标函数就让出一次主线程，避免界面卡死。 */
  yieldEvery?: number;
  onProgress?: (info: { round: number; dimension: string; best: number }) => void;
}

export interface MinimizeResult {
  /** 找到的最小值；没有任何可行取值时为 Infinity。 */
  value: number;
  /** 取到最小值时各维的取值。 */
  at: Array<{ name: string; value: number }>;
  evaluations: number;
  rounds: number;
  cancelled: boolean;
  /** 目标函数在整个搜索过程中始终没变化（说明它不依赖这些参数）。 */
  constant: boolean;
}

const yieldToUI = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** 黄金分割搜索：在 [a, b] 上找单峰函数的极小点。 */
async function goldenSection(
  f: (x: number) => number | Promise<number>,
  a: number,
  b: number,
  iterations: number,
  shouldStop: () => boolean
): Promise<{ x: number; value: number }> {
  const invPhi = (Math.sqrt(5) - 1) / 2; // 0.618...
  let lo = a;
  let hi = b;
  let x1 = hi - invPhi * (hi - lo);
  let x2 = lo + invPhi * (hi - lo);
  let f1 = await f(x1);
  let f2 = await f(x2);

  for (let i = 0; i < iterations && !shouldStop(); i++) {
    if (f1 <= f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - invPhi * (hi - lo);
      f1 = await f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + invPhi * (hi - lo);
      f2 = await f(x2);
    }
  }

  return f1 <= f2 ? { x: x1, value: f1 } : { x: x2, value: f2 };
}

export async function minimize(
  dimensions: SearchDimension[],
  evaluate: () => number,
  options: MinimizeOptions = {}
): Promise<MinimizeResult> {
  const {
    samples = 100,
    rounds = 4,
    refineIterations = 60,
    tolerance = 1e-12,
    shouldCancel = () => false,
    yieldEvery = 64,
    onProgress,
  } = options;

  let evaluations = 0;
  let sinceYield = 0;
  let sawDifferentValue = false;
  let firstValue = NaN;

  /** NaN / 未定义一律视为 +∞，这样它们永远不会被当成最小值。 */
  const probe = async (): Promise<number> => {
    const raw = evaluate();
    evaluations++;
    const value = Number.isFinite(raw) ? raw : Infinity;

    if (Number.isNaN(firstValue)) firstValue = value;
    else if (!sawDifferentValue && value !== firstValue) sawDifferentValue = true;

    if (++sinceYield >= yieldEvery) {
      sinceYield = 0;
      await yieldToUI();
    }
    return value;
  };

  const current = dimensions.map(d => clamp(d.start, d.min, d.max));
  const applyAll = () => dimensions.forEach((d, i) => d.set(current[i]));
  applyAll();

  let best = await probe();
  let completedRounds = 0;

  for (let round = 0; round < rounds; round++) {
    if (shouldCancel()) break;
    const roundStart = best;
    completedRounds = round + 1;

    for (let i = 0; i < dimensions.length; i++) {
      if (shouldCancel()) break;
      const dim = dimensions[i];
      if (!(dim.min < dim.max)) continue;

      const measure = async (x: number) => {
        dim.set(x);
        current[i] = x;
        return probe();
      };

      // ① 粗扫，定位最优采样点
      const step = (dim.max - dim.min) / samples;
      let bestX = current[i];
      let bestValue = best;
      for (let j = 0; j <= samples; j++) {
        if (shouldCancel()) break;
        const x = j === samples ? dim.max : dim.min + j * step;
        const value = await measure(x);
        if (value < bestValue) {
          bestValue = value;
          bestX = x;
        }
      }

      // ② 在最优采样点两侧的区间内做黄金分割细化
      if (!shouldCancel() && Number.isFinite(bestValue)) {
        const lo = Math.max(dim.min, bestX - step);
        const hi = Math.min(dim.max, bestX + step);
        if (hi > lo) {
          const refined = await goldenSection(measure, lo, hi, refineIterations, shouldCancel);
          if (refined.value <= bestValue) {
            bestValue = refined.value;
            bestX = refined.x;
          }
        }
      }

      // 把该维固定在本轮找到的最优处，再去优化下一维
      current[i] = bestX;
      dim.set(bestX);
      if (bestValue < best) best = bestValue;
      onProgress?.({ round: round + 1, dimension: dim.name, best });
    }

    // 一整轮下来几乎没有改善就认为收敛了
    const improvement = roundStart - best;
    if (!(improvement > Math.abs(roundStart) * tolerance + tolerance)) break;
  }

  applyAll();

  return {
    value: best,
    at: dimensions.map((d, i) => ({ name: d.name, value: current[i] })),
    evaluations,
    rounds: completedRounds,
    cancelled: shouldCancel(),
    constant: !sawDifferentValue,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
