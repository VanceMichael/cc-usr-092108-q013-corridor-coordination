import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import { verifyClaim, drillDown } from '../src/claims.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('完成声明须同时具备许可、工程与联调证据', async () => {
  const ledger = await loadLedger();
  assert.equal(verifyClaim(ledger, 'clm-01').complete, true);
  const result = verifyClaim(ledger, 'clm-02');
  assert.equal(result.complete, false);
  assert.deepEqual(result.missingKinds, ['permit', 'joint-commissioning']);
});

test('完成声明可下钻到证据及其关联节点', async () => {
  const ledger = await loadLedger();
  const detail = drillDown(ledger, 'clm-01');
  assert.equal(detail.node.id, 'sec-a0');
  assert.deepEqual(
    detail.evidence.map((e) => e.kind),
    ['permit', 'engineering', 'joint-commissioning']
  );
  assert.equal(detail.evidence[0].ref, '北自然资许〔2026〕11号（虚构）');
  assert.equal(detail.evidence[0].nodes[0].id, 'sec-a0');
});
