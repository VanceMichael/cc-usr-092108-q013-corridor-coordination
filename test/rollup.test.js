import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import { rollupByRegion } from '../src/rollup.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('区域汇总保留原始结论且可追溯到堵点根因', async () => {
  const ledger = await loadLedger();
  const rollup = rollupByRegion(ledger, { now: '2026-09-26' });
  const north = rollup.get('region-north');
  assert.deepEqual(north.blocked, ['sec-a1', 'sec-a2']);
  // 北湾两条原始结论并列保留，不合并
  assert.equal(north.conclusions.length, 2);
  assert.ok(north.conclusions.some((c) => c.summary.includes('用地批复未落地')));
  const landCause = north.rootCauses.find((r) => r.node === 'permit-land-a1');
  assert.equal(landCause.label, '用地');
});

test('汇总不抹去也不改写原始结论', async () => {
  const ledger = await loadLedger();
  const rollup = rollupByRegion(ledger, { now: '2026-09-26' });
  const south = rollup.get('region-south');
  assert.equal(south.conclusions.length, 1);
  // 篡改汇总结果不影响台账原件
  south.conclusions[0].summary = '被篡改';
  const original = ledger.conclusions.find((c) => c.id === 'ccl-03');
  assert.notEqual(original.summary, '被篡改');
});

test('承诺按受影响节点归属区域并识别逾期', async () => {
  const ledger = await loadLedger();
  const rollup = rollupByRegion(ledger, { now: '2026-09-26' });
  // 青屿：用能承诺已兑现，配套电网承诺已逾期
  assert.deepEqual(rollup.get('region-south').commitments, { valid: 2, invalid: 0, fulfilled: 1, overdue: 1 });
  // 北湾：用地承诺尚未到期
  assert.deepEqual(rollup.get('region-north').commitments, { valid: 1, invalid: 0, fulfilled: 0, overdue: 0 });
});
