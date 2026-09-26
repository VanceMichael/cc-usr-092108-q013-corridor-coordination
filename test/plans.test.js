import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import {
  planHistory,
  activePlan,
  supersedePlan,
  rescheduleForDisaster,
  recordRecoveryStage,
  recoveryStatus
} from '../src/plans.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('被替换方案全部保留且可回溯', async () => {
  const ledger = await loadLedger();
  const history = planHistory(ledger, 'sec-a1');
  assert.deepEqual(
    history.map((p) => [p.id, p.status]),
    [
      ['plan-a1-v1', 'superseded'],
      ['plan-a1-v2', 'superseded'],
      ['plan-a1-v3', 'active']
    ]
  );
  assert.equal(history[0].supersede_reason, 'delay');
  assert.equal(history[1].supersede_reason, 'disaster-reschedule');
  assert.equal(history[1].disaster, 'dss-01');
});

test('替代路线与争议裁决保留原方案与裁决依据', async () => {
  const ledger = await loadLedger();
  const a2 = planHistory(ledger, 'sec-a2');
  assert.equal(a2[0].route, '东线桥位');
  assert.equal(a2[0].supersede_reason, 'alternative-route');
  const b1 = planHistory(ledger, 'sec-b1');
  assert.equal(b1[0].supersede_reason, 'dispute-ruling');
  assert.ok(b1[0].ruling.includes('协裁'));
  assert.equal(b1[1].route, '隧道方案');
});

test('争议裁决替换必须给出裁决依据', async () => {
  const ledger = await loadLedger();
  assert.throws(
    () =>
      supersedePlan(
        ledger,
        'plan-a1-v3',
        { id: 'plan-a1-v4', window: { start: '2026-11-01', end: '2027-05-31' } },
        { reason: 'dispute-ruling', decidedBy: 'dept-lead', at: '2026-09-26T10:00:00+08:00' }
      ),
    /裁决依据/
  );
});

test('延期替换生成新版本且旧版本保留，历史版本不能再次替换', async () => {
  const ledger = await loadLedger();
  const created = supersedePlan(
    ledger,
    'plan-a1-v3',
    { id: 'plan-a1-v4', window: { start: '2026-11-01', end: '2027-05-31' } },
    { reason: 'delay', decidedBy: 'dept-lead', at: '2026-09-26T10:00:00+08:00' }
  );
  assert.equal(created.version, 4);
  assert.equal(created.replaces, 'plan-a1-v3');
  assert.equal(planHistory(ledger, 'sec-a1').length, 4);
  assert.equal(ledger.plans.find((p) => p.id === 'plan-a1-v3').status, 'superseded');
  assert.equal(activePlan(ledger, 'sec-a1').id, 'plan-a1-v4');
  assert.throws(
    () =>
      supersedePlan(
        ledger,
        'plan-a1-v3',
        { id: 'plan-a1-v5', window: { start: '2026-12-01', end: '2027-06-30' } },
        { reason: 'delay', decidedBy: 'dept-lead', at: '2026-09-26T11:00:00+08:00' }
      ),
    /不在执行状态/
  );
  // 替换链保持完整，仍通过台账校验
  assert.doesNotThrow(() => parseLedger(ledger));
});

test('灾害引发计划重排并登记到灾害档案', async () => {
  const ledger = await loadLedger();
  const created = rescheduleForDisaster(
    ledger,
    'dss-02',
    { 'sec-b1': { start: '2026-12-01', end: '2027-10-31' } },
    { decidedBy: 'dept-lead', at: '2026-09-25T09:00:00+08:00' }
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].id, 'plan-b1-v3');
  const disaster = ledger.disasters.find((d) => d.id === 'dss-02');
  assert.deepEqual(disaster.triggered_reschedule, ['plan-b1-v3']);
  assert.equal(ledger.plans.find((p) => p.id === 'plan-b1-v2').supersede_reason, 'disaster-reschedule');
  assert.equal(activePlan(ledger, 'sec-b1').id, 'plan-b1-v3');
  assert.doesNotThrow(() => parseLedger(ledger));
});

test('重排范围外的节点被拒绝', async () => {
  const ledger = await loadLedger();
  assert.throws(
    () =>
      rescheduleForDisaster(
        ledger,
        'dss-02',
        { 'sec-a1': { start: '2026-12-01', end: '2027-06-30' } },
        { decidedBy: 'dept-lead', at: '2026-09-25T09:00:00+08:00' }
      ),
    /不在灾害 dss-02 的影响范围内/
  );
});

test('服务恢复按阶段推进，全部完成才标记恢复', async () => {
  const ledger = await loadLedger();
  // 台风灾害尚有进行中的恢复阶段
  const before = recoveryStatus(ledger, 'dss-01');
  assert.deepEqual([before.total, before.done, before.inProgress, before.restored], [2, 1, 1, false]);

  // 内涝灾害从空记录开始登记
  recordRecoveryStage(ledger, 'dss-02', { name: '抽排积水', status: 'in-progress' });
  recordRecoveryStage(ledger, 'dss-02', { name: '供电复测', status: 'done', at: '2026-09-25T20:00:00+08:00' });
  assert.equal(recoveryStatus(ledger, 'dss-02').restored, false);

  // 同名阶段推进为完成，全部完成后才标记恢复
  recordRecoveryStage(ledger, 'dss-02', { name: '抽排积水', status: 'done', at: '2026-09-26T09:00:00+08:00' });
  const after = recoveryStatus(ledger, 'dss-02');
  assert.equal(after.restored, true);
  assert.equal(after.restored_at, '2026-09-26T09:00:00+08:00');
});
