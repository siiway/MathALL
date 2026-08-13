import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatExact, toFraction, simplifySquareRoot } from '../src/utils/exactValue.ts';

test('整数与零', () => {
  assert.equal(formatExact(0), '0');
  assert.equal(formatExact(7), '7');
  assert.equal(formatExact(-3), '-3');
  // 浮点噪声不应该破坏整数识别
  assert.equal(formatExact(5 + 1e-13), '5');
});

test('有理数', () => {
  assert.equal(formatExact(12 / 5), '12/5');
  assert.equal(formatExact(0.6), '3/5');
  assert.equal(formatExact(-7 / 4), '-7/4');
  assert.equal(formatExact(1 / 3), '1/3');
});

test('纯根号', () => {
  assert.equal(formatExact(Math.sqrt(2)), '√2');
  assert.equal(formatExact(Math.sqrt(5)), '√5');
  assert.equal(formatExact(2 * Math.sqrt(3)), '2√3');
  assert.equal(formatExact(Math.sqrt(50)), '5√2');
});

test('带分母的根号（旧实现识别不了的那类）', () => {
  // 点到直线距离里最常见的形式
  assert.equal(formatExact((3 * Math.sqrt(5)) / 5), '3√5/5');
  assert.equal(formatExact(Math.sqrt(2) / 2), '√2/2');
  assert.equal(formatExact((2 * Math.sqrt(3)) / 3), '2√3/3');
  assert.equal(formatExact(-Math.sqrt(3) / 3), '-√3/3');
});

test('π 的有理数倍', () => {
  assert.equal(formatExact(Math.PI), 'π');
  assert.equal(formatExact(Math.PI / 6), 'π/6');
  assert.equal(formatExact((2 * Math.PI) / 3), '2π/3');
  assert.equal(formatExact(-Math.PI / 2), '-π/2');
});

test('识别不出来时退回小数，不能瞎猜', () => {
  assert.equal(formatExact(1.234567891234), '1.234568');
  assert.equal(formatExact(Math.E), '2.718282');
  assert.equal(formatExact(Math.log(7)), '1.945910');
});

test('非有限值返回空串', () => {
  assert.equal(formatExact(NaN), '');
  assert.equal(formatExact(Infinity), '');
});

test('容差可放宽以适配数值扫描结果', () => {
  const noisy = Math.sqrt(5) + 3e-8;
  // 默认容差下噪声太大，不应该硬凑成 √5
  assert.notEqual(formatExact(noisy), '√5');
  // 放宽后可以识别
  assert.equal(formatExact(noisy, { tolerance: 1e-6 }), '√5');
});

test('toFraction 在无理数上返回 null', () => {
  assert.equal(toFraction(Math.sqrt(2), 1000, 1e-9), null);
  assert.deepEqual(toFraction(0.75), { num: 3, den: 4 });
  assert.deepEqual(toFraction(-2.5), { num: -5, den: 2 });
});

test('simplifySquareRoot 提取完全平方因子', () => {
  assert.deepEqual(simplifySquareRoot(45), { coefficient: 3, radicand: 5 });
  assert.deepEqual(simplifySquareRoot(16), { coefficient: 4, radicand: 1 });
  assert.deepEqual(simplifySquareRoot(0), { coefficient: 0, radicand: 1 });
  // 超大数直接放弃化简，避免 O(√n) 试除拖慢实时刷新
  assert.deepEqual(simplifySquareRoot(1e9), { coefficient: 1, radicand: 1e9 });
});
