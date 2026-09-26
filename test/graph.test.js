import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import { computeBlockages, propagateFrom, propagateChange } from '../src/graph.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('堵点定位到具体节点而不是模糊进度', async () => {
  const ledger = await loadLedger();
  const { blocked } = computeBlockages(ledger);
  assert.deepEqual([...blocked.keys()], ['sec-a1', 'sec-a2', 'sec-b1', 'dc-b1']);
  assert.deepEqual(blocked.get('sec-a1').direct, ['permit-land-a1', 'pre-site-a1']);
});

test('堵点根因沿依赖链穿透到资源要素', async () => {
  const ledger = await loadLedger();
  const { blocked, roots, byElement } = computeBlockages(ledger);
  // 跨海段的根因包含北湾用地批复：区段间传导可见
  assert.ok(blocked.get('sec-a2').roots.includes('permit-land-a1'));
  assert.deepEqual(blocked.get('sec-b1').roots, ['net-power-b1', 'std-local-south']);
  assert.deepEqual(roots, [
    'fund-a2',
    'net-power-b1',
    'permit-eco-a2',
    'permit-land-a1',
    'permit-sea-a2',
    'pre-site-a1',
    'res-a2',
    'std-local-south'
  ]);
  // 按要素归类：用地、用海、生态、地方标准、配套网络各就其位
  assert.deepEqual(byElement.get('land'), ['permit-land-a1']);
  assert.deepEqual(byElement.get('sea'), ['permit-sea-a2']);
  assert.deepEqual(byElement.get('local-standard'), ['std-local-south']);
  assert.deepEqual(byElement.get('supporting-network'), ['net-power-b1']);
  // 用能指标已落实，不再是堵点
  assert.equal(byElement.get('energy'), undefined);
});

test('算力数据设施本身被配套网络卡住', async () => {
  const ledger = await loadLedger();
  const { blocked } = computeBlockages(ledger);
  assert.deepEqual(blocked.get('dc-b1').roots, ['net-power-b1']);
});

test('技术标准变化自动传播到受影响节点', async () => {
  const ledger = await loadLedger();
  const { change, affected } = propagateChange(ledger, 'chg-01');
  assert.equal(change.target, 'std-local-south');
  assert.deepEqual(
    affected.map((a) => a.node),
    ['sec-b1', 'dc-b1']
  );
});

test('法规变化沿许可传播到通道结构', async () => {
  const ledger = await loadLedger();
  const { affected } = propagateChange(ledger, 'chg-02');
  assert.deepEqual(
    affected.map((a) => a.node),
    ['permit-sea-a2', 'sec-a2']
  );
  assert.deepEqual(affected[1].path, ['reg-sea', 'permit-sea-a2', 'sec-a2']);
});

test('要素延期的影响沿依赖图逐层传播', async () => {
  const ledger = await loadLedger();
  const affected = propagateFrom(ledger, 'permit-land-a1');
  assert.deepEqual(
    affected.map((a) => [a.node, a.depth]),
    [
      ['sec-a1', 1],
      ['sec-a2', 2]
    ]
  );
});
