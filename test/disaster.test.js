import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { disasterImpact, recoveryStatus } from '../src/disaster.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('灾害影响沿依赖图传播到间接受阻节点', () => {
  const d = disasterImpact(ctx, 'DST-1');
  assert.deepEqual(d.direct_nodes.sort(), ['NET-1', 'RES-1', 'SEC-4']);
  // NET-1 中断 → 算力中心与联络段被波及
  assert.ok(d.propagated_nodes.includes('FAC-1'));
  assert.ok(d.propagated_nodes.includes('SEC-3'));
  assert.ok(d.affected_sections.includes('SEC-4'));
  assert.ok(d.affected_sections.includes('SEC-3'));
});

test('灾害触发计划重排并关联受影响服务', () => {
  const d = disasterImpact(ctx, 'DST-1');
  assert.deepEqual(d.replans, [{ node: 'SEC-4', new_plan: 'PLAN-SEC-4-2' }]);
  assert.deepEqual(d.affected_services.sort(), ['SVC-1', 'SVC-2']);
});

test('服务恢复台账：中断时长与恢复目标达成情况', () => {
  const services = Object.fromEntries(recoveryStatus(ctx, { asOf: AS_OF }).map((s) => [s.id, s]));
  // SVC-1 已恢复：09-11 02:00 → 09-14 06:00 = 76 小时，赶在 09-15 目标前
  assert.equal(services['SVC-1'].status, 'restored');
  assert.equal(services['SVC-1'].downtime_hours, 76);
  assert.equal(services['SVC-1'].met_target, true);
  // SVC-2 仍在降级运行，恢复时长统计到评估日
  assert.equal(services['SVC-2'].status, 'degraded');
  assert.equal(services['SVC-2'].restored_at, null);
  assert.equal(services['SVC-2'].met_target, null);
  assert.ok(services['SVC-2'].downtime_hours > 0);
});
