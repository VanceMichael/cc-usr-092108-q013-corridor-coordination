import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { analyzeCommitments, commitmentAlerts } from '../src/commitments.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));
const analyzed = analyzeCommitments(ctx, { asOf: AS_OF });
const byId = Object.fromEntries(analyzed.map((c) => [c.id, c]));

test('四要素齐全才算有效承诺', () => {
  assert.equal(byId['CMT-1'].valid, true);
  assert.deepEqual(byId['CMT-1'].missing_fields, []);
  // CMT-3 缺依据（basis），四要素不齐 → 无效
  assert.equal(byId['CMT-3'].valid, false);
  assert.deepEqual(byId['CMT-3'].missing_fields, ['basis']);
  assert.equal(byId['CMT-3'].effective_status, 'invalid');
});

test('截止日已过仍未兑现 → 逾期', () => {
  assert.equal(byId['CMT-2'].valid, true);
  assert.equal(byId['CMT-2'].overdue, true);
  assert.equal(byId['CMT-2'].effective_status, 'overdue');
  // 未到截止日的在途承诺不算逾期
  assert.equal(byId['CMT-1'].overdue, false);
});

test('已兑现承诺保持有效且不计逾期', () => {
  assert.equal(byId['CMT-4'].effective_status, 'fulfilled');
  assert.equal(byId['CMT-4'].overdue, false);
});

test('承诺可追溯到受影响区段', () => {
  // CMT-2 影响用海批复 → 下游区段都被拖住
  assert.ok(byId['CMT-2'].affected_sections.includes('SEC-1'));
  assert.ok(byId['CMT-2'].affected_sections.includes('SEC-2'));
});

test('告警只含需要跟进的承诺：无效与逾期', () => {
  const alerts = commitmentAlerts(ctx, { asOf: AS_OF }).map((c) => c.id).sort();
  assert.deepEqual(alerts, ['CMT-2', 'CMT-3']);
});
