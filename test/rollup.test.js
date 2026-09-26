import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { rollupRegion, rollupCorridor } from '../src/rollup.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('区域汇总给出综合状态但不抹去原始结论', () => {
  const r = rollupRegion(ctx, 'RG-EAST', { asOf: AS_OF });
  assert.equal(r.composite_status, 'blocked'); // 澜东段受阻
  // 两个区段的原始结论逐条保留
  assert.equal(r.conclusions.length, 2);
  const sec1 = r.conclusions.find((c) => c.node === 'SEC-1');
  const sec3 = r.conclusions.find((c) => c.node === 'SEC-3');
  assert.match(sec1.conclusion, /受阻/);
  assert.match(sec1.conclusion, /用海/);
  assert.match(sec3.conclusion, /已完工，证据齐全/);
  // 区域承诺健康度一并呈现
  assert.ok(r.commitments.some((c) => c.id === 'CMT-4'));
});

test('通道汇总保留全部区段原始结论', () => {
  const c = rollupCorridor(ctx, 'COR-1', { asOf: AS_OF });
  assert.equal(c.composite_status, 'blocked');
  assert.equal(c.regions.length, 3);
  assert.equal(c.conclusions.length, 4); // 四个区段一条不少
  const nodes = c.conclusions.map((x) => x.node).sort();
  assert.deepEqual(nodes, ['SEC-1', 'SEC-2', 'SEC-3', 'SEC-4']);
});

test('区域综合状态推导：全部完工才 completed', () => {
  const north = rollupRegion(ctx, 'RG-NORTH', { asOf: AS_OF });
  // 北屿段虽完工，但仍有未解决上游（配套网络/韧性措施）→ 不算全绿
  assert.equal(north.composite_status, 'blocked');
});
