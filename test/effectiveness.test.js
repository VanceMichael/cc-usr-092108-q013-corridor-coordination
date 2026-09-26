import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import { computeEffectiveness } from '../src/effectiveness.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('综合效能可计算且口径透明', async () => {
  const ledger = await loadLedger();
  const eff = computeEffectiveness(ledger, { now: '2026-09-26' });

  // 16 个节点中 4 个已满足
  assert.equal(eff.nodes.satisfactionRate, 0.25);
  // 4 个被卡节点、8 个根因要素，用能不在其中
  assert.equal(eff.blockage.blockedCount, 4);
  assert.equal(eff.blockage.rootCount, 8);
  assert.equal(eff.blockage.byElement.land, 1);
  assert.equal(eff.blockage.byElement.energy, undefined);

  // 3 条有效承诺：1 条兑现、1 条逾期；1 条口头承诺无效
  assert.deepEqual(
    [eff.commitments.valid, eff.commitments.invalid, eff.commitments.fulfilled, eff.commitments.overdue],
    [3, 1, 1, 1]
  );
  assert.equal(eff.commitments.fulfillmentRate, 0.3333);

  // 2 条完成声明中 1 条证据齐全
  assert.equal(eff.claims.evidenceRate, 0.5);

  // 综合效能 =（0.25 + 1/3 + 0.5）/ 3
  assert.equal(eff.composite, 0.3611);
});
