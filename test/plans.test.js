import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { planLineage, supersededPlans } from '../src/plans.js';

const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('延期与替代路线：被替换方案完整保留并标注原因', () => {
  const l = planLineage(ctx, 'SEC-1');
  assert.equal(l.active_plan, 'PLAN-SEC-1-3');
  assert.deepEqual(l.chain.map((p) => p.id), ['PLAN-SEC-1-1', 'PLAN-SEC-1-2', 'PLAN-SEC-1-3']);
  assert.equal(l.chain[0].supersede_reason, 'delay');
  assert.equal(l.chain[0].supersede_reason_label, '延期');
  assert.equal(l.chain[1].supersede_reason, 'alternative_route');
  // 被替换方案内容仍在，不随替换丢弃
  assert.equal(l.superseded.length, 2);
  assert.ok(l.superseded[0].milestones.length > 0);
  // 延期记录挂在对应计划上
  assert.deepEqual(l.chain[0].delays, ['DLY-1']);
});

test('争议裁决：原方案作废但保留，裁决与采纳方案互相关联', () => {
  const l = planLineage(ctx, 'SEC-2');
  assert.equal(l.active_plan, 'PLAN-SEC-2-2');
  const killed = l.chain.find((p) => p.id === 'PLAN-SEC-2-1');
  assert.equal(killed.status, 'superseded');
  assert.equal(killed.supersede_reason, 'dispute_ruling');
  assert.equal(killed.ruling, 'RUL-1');
  const ruling = l.rulings.find((r) => r.id === 'RUL-1');
  assert.equal(ruling.adopted_plan, 'PLAN-SEC-2-2');
  assert.deepEqual(ruling.superseded_plans, ['PLAN-SEC-2-1']);
});

test('灾害重排：北屿段恢复计划进入谱系', () => {
  const l = planLineage(ctx, 'SEC-4');
  assert.equal(l.active_plan, 'PLAN-SEC-4-2');
  assert.ok(l.chain.some((p) => p.id === 'PLAN-SEC-4-1' && p.status === 'completed'));
});

test('全库被替换方案可审计', () => {
  const ids = supersededPlans(ctx).map((p) => p.id).sort();
  assert.deepEqual(ids, ['PLAN-SEC-1-1', 'PLAN-SEC-1-2', 'PLAN-SEC-2-1']);
});
