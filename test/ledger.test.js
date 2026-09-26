import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger, validCommitments, invalidCommitments } from '../src/ledger.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('协同台账样例可读取且标识完整', async () => {
  const ledger = await loadLedger();
  assert.equal(ledger.domain, 'corridor-coordination');
  assert.equal(ledger.product, 'corridor-collaboration-ledger');
  assert.ok(ledger.nodes.length >= 10);
  assert.ok(ledger.dependencies.length > 0);
});

test('地方承诺四要素齐全才算有效', async () => {
  const ledger = await loadLedger();
  assert.deepEqual(
    validCommitments(ledger).map((c) => c.id),
    ['cmt-01', 'cmt-03', 'cmt-04']
  );
  // 口头承诺缺截止日与受影响节点，按无效处理
  assert.deepEqual(invalidCommitments(ledger), [
    { id: 'cmt-02', party: 'dept-north-land', missing: ['截止日', '受影响节点'] }
  ]);
});

test('依赖引用不存在的节点时拒绝读取', async () => {
  const ledger = await loadLedger();
  ledger.dependencies[0].from = 'ghost-node';
  assert.throws(() => parseLedger(ledger), /依赖 dep-01/);
});

test('承诺引用的受影响节点必须存在', async () => {
  const ledger = await loadLedger();
  ledger.commitments[0].affected_nodes = ['ghost-node'];
  assert.throws(() => parseLedger(ledger), /承诺 cmt-01/);
});

test('争议裁决替换的方案必须保留裁决依据', async () => {
  const ledger = await loadLedger();
  const plan = ledger.plans.find((p) => p.id === 'plan-b1-v1');
  delete plan.ruling;
  assert.throws(() => parseLedger(ledger), /裁决依据/);
});

test('灾害重排结果必须登记在灾害档案中', async () => {
  const ledger = await loadLedger();
  const disaster = ledger.disasters.find((d) => d.id === 'dss-01');
  disaster.triggered_reschedule = [];
  assert.throws(() => parseLedger(ledger), /未登记在灾害 dss-01/);
});
