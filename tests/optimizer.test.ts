import { test } from 'node:test';
import assert from 'node:assert/strict';
import { minimize, type SearchDimension } from '../src/utils/optimizer.ts';
import { formatExact } from '../src/utils/exactValue.ts';

/** 造一个受控的搜索维度：set 只是写进 state。 */
function dim(name: string, min: number, max: number, start: number, state: Record<string, number>): SearchDimension {
  state[name] = start;
  return { name, min, max, start, set: v => { state[name] = v; } };
}

test('单参数：抛物线极小点', async () => {
  const s: Record<string, number> = {};
  const t = dim('t', -5, 5, 0, s);
  const result = await minimize([t], () => (s.t - 2) ** 2 + 3, { samples: 20 });

  assert.ok(Math.abs(result.value - 3) < 1e-9, `期望 3，实际 ${result.value}`);
  assert.ok(Math.abs(result.at[0].value - 2) < 1e-4);
  assert.equal(result.constant, false);
});

test('单参数：极小点落在采样点之间也能收敛（粗扫是取不到的）', async () => {
  const s: Record<string, number> = {};
  // 极小点 t=1/3，20 等分的采样点上没有这个值
  const t = dim('t', 0, 1, 0, s);
  const result = await minimize([t], () => (s.t - 1 / 3) ** 2, { samples: 20 });

  assert.ok(result.value < 1e-12, `细化后应逼近 0，实际 ${result.value}`);
});

test('点到直线距离：最小值应还原成 6√5/5', async () => {
  const s: Record<string, number> = {};
  // 动点 P=(t, 2t) 到定点 A=(3,0) 的距离，即点到直线 y=2x 的距离 = 6/√5 = 6√5/5 ≈ 2.6833
  const t = dim('t', -5, 5, -5, s);
  const result = await minimize(
    [t],
    () => Math.hypot(s.t - 3, 2 * s.t - 0),
    { samples: 100, refineIterations: 80 }
  );

  assert.ok(Math.abs(result.value - (6 * Math.sqrt(5)) / 5) < 1e-9, `实际 ${result.value}`);
  // 端到端：优化结果直接喂给精确值识别
  assert.equal(formatExact(result.value, { tolerance: 1e-7 }), '6√5/5');
});

test('多参数：单维扫描找不到、必须联合搜索的情形', async () => {
  const s: Record<string, number> = {};
  const a = dim('a', -5, 5, 5, s);
  const b = dim('b', -5, 5, 5, s);
  // 极小点在 (1, -2)，两个参数都从 5 出发；任一参数单独扫描都到不了最小值
  const result = await minimize([a, b], () => (s.a - 1) ** 2 + (s.b + 2) ** 2 + 1, { samples: 20 });

  assert.ok(Math.abs(result.value - 1) < 1e-8, `期望 1，实际 ${result.value}`);
  assert.ok(Math.abs(result.at[0].value - 1) < 1e-3);
  assert.ok(Math.abs(result.at[1].value + 2) < 1e-3);
});

test('目标函数与参数无关时标记 constant', async () => {
  const s: Record<string, number> = {};
  const t = dim('t', 0, 1, 0.5, s);
  const result = await minimize([t], () => 4, { samples: 10 });

  assert.equal(result.constant, true);
  assert.equal(result.value, 4);
});

test('NaN 视为 +∞，不会被当成最小值', async () => {
  const s: Record<string, number> = {};
  const t = dim('t', 0, 4, 0, s);
  // t < 2 时无定义
  const result = await minimize([t], () => (s.t < 2 ? NaN : s.t), { samples: 40 });

  assert.ok(Number.isFinite(result.value));
  assert.ok(result.value >= 2 - 1e-6, `不应落进无定义区间，实际 ${result.value}`);
});

test('可以中途取消', async () => {
  const s: Record<string, number> = {};
  const t = dim('t', 0, 1, 0, s);
  let calls = 0;
  const result = await minimize([t], () => { calls++; return s.t; }, {
    samples: 1000,
    shouldCancel: () => calls > 10,
  });

  assert.equal(result.cancelled, true);
  assert.ok(result.evaluations < 100, `取消后不应继续跑，实际 ${result.evaluations}`);
});

test('退化区间（min === max）不会死循环', async () => {
  const s: Record<string, number> = {};
  const t = dim('t', 2, 2, 2, s);
  const result = await minimize([t], () => s.t, { samples: 10 });

  assert.equal(result.value, 2);
});
