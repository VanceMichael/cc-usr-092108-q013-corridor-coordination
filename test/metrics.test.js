import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import {
  clearanceRate, commitmentReliability, verifiedCompletion,
  complianceRate, serviceAvailability, effectiveness, EFFECTIVENESS_WEIGHTS,
} from '../src/metrics.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('依赖清零率按区段前置子图计算', () => {
  const c = clearanceRate(ctx, { asOf: AS_OF });
  assert.equal(c.per_section['SEC-1'].total, 5);
  assert.equal(c.per_section['SEC-1'].done, 4); // 法规已生效换版计入
  assert.equal(c.per_section['SEC-2'].done, 2);
  assert.ok(Math.abs(c.overall - 11 / 21) < 1e-9);
});

test('承诺可信度：兑现=1、在途=0.5、逾期=0，无效承诺不计入', () => {
  const r = commitmentReliability(ctx, { asOf: AS_OF });
  assert.equal(r.valid_count, 3);
  assert.equal(r.invalid_count, 1);
  assert.deepEqual(r.invalid_ids, ['CMT-3']);
  assert.ok(Math.abs(r.score - 0.5) < 1e-9); // (1 + 0.5 + 0) / 3
});

test('有据完工率只认证据链完整的区段', () => {
  const v = verifiedCompletion(ctx, { asOf: AS_OF });
  assert.deepEqual(v.supported.sort(), ['SEC-3', 'SEC-4']);
  assert.ok(Math.abs(v.rate - 0.5) < 1e-9);
});

test('标准法规符合率计入已生效换版', () => {
  const c = complianceRate(ctx, { asOf: AS_OF });
  assert.deepEqual(c.conformed, ['REG-SEA-1']);
  assert.deepEqual(c.pending, ['STD-LOCAL-1']);
  assert.ok(Math.abs(c.rate - 0.5) < 1e-9);
});

test('服务可用率：已恢复算可用，降级不算', () => {
  const s = serviceAvailability(ctx, { asOf: AS_OF });
  assert.deepEqual(s.up, ['SVC-1']);
  assert.deepEqual(s.down, ['SVC-2']);
  assert.ok(Math.abs(s.rate - 0.5) < 1e-9);
});

test('综合效能为五项分量加权和，权重公开', () => {
  const e = effectiveness(ctx, { asOf: AS_OF });
  const weightSum = Object.values(EFFECTIVENESS_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(weightSum - 1) < 1e-9);
  const expected =
    0.3 * (11 / 21) + 0.2 * 0.5 + 0.2 * 0.5 + 0.15 * 0.5 + 0.15 * 0.5;
  assert.ok(Math.abs(e.score - Math.round(expected * 1000) / 1000) < 1e-9);
  // 每个分量都能下钻
  assert.ok(e.components.clearance > 0 && e.components.clearance < 1);
});
