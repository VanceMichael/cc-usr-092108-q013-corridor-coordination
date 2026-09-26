import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { propagateChange, propagateAll } from '../src/propagation.js';
import { effectiveStatus, effectiveVersion, buildGraph } from '../src/graph.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('地方标准换版自动传播到区段与施工前置', () => {
  const p = propagateChange(ctx, 'CHG-1', { asOf: AS_OF });
  assert.equal(p.source.id, 'STD-LOCAL-1');
  assert.equal(p.change.effective_now, false); // 2026-10-01 才生效
  assert.deepEqual(p.impacted_sections.sort(), ['SEC-2', 'SEC-3', 'SEC-4']);
  assert.ok(p.impacted.some((i) => i.id === 'PRE-1'));
});

test('传播给出完整路径，可逐级下钻', () => {
  const p = propagateChange(ctx, 'CHG-1', { asOf: AS_OF });
  const sec4 = p.impacted.find((i) => i.id === 'SEC-4');
  assert.ok(sec4.paths.some((path) => path.join('>') === 'STD-LOCAL-1>PRE-1>SEC-4'));
  assert.ok(sec4.paths.some((path) => path.join('>') === 'STD-LOCAL-1>SEC-2>SEC-3>SEC-4'));
});

test('法规修订传播到用海批复并波及全部下游区段', () => {
  const p = propagateChange(ctx, 'CHG-2', { asOf: AS_OF });
  assert.equal(p.change.effective_now, true);
  assert.ok(p.impacted.some((i) => i.id === 'PRM-SEA-1'));
  assert.deepEqual(p.impacted_sections.sort(), ['SEC-1', 'SEC-2', 'SEC-3', 'SEC-4']);
  // 波及承诺：CMT-2 承诺的正是用海批复
  assert.ok(p.commitments_at_risk.includes('CMT-2'));
});

test('已生效变更使法规节点视为符合新版', () => {
  const graph = buildGraph(ctx);
  const reg = graph.nodes.get('REG-SEA-1');
  assert.equal(effectiveStatus(ctx, reg, AS_OF), 'completed');
  assert.equal(effectiveVersion(ctx, reg, AS_OF), '2026');
  // 生效日之前仍按原状态
  assert.equal(effectiveStatus(ctx, reg, '2026-08-31'), 'in_progress');
});

test('propagateAll 覆盖全部登记变更', () => {
  const all = propagateAll(ctx, { asOf: AS_OF });
  assert.deepEqual(all.map((p) => p.change.id).sort(), ['CHG-1', 'CHG-2']);
});
