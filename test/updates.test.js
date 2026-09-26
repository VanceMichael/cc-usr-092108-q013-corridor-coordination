import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLedger } from '../src/ledger.js';
import { applyNodeUpdate, orderMeetings, redactLedger, ConflictError } from '../src/updates.js';

async function loadLedger() {
  const raw = await readFile(new URL('../fixtures/corridor.json', import.meta.url), 'utf8');
  return parseLedger(raw);
}

test('多方同时更新时后提交的旧基线被拒绝', async () => {
  const ledger = await loadLedger();
  assert.equal(ledger.nodes.find((n) => n.id === 'permit-land-a1').revision, 2);

  // 甲方基于版本 2 更新成功
  applyNodeUpdate(
    ledger,
    'permit-land-a1',
    { status: 'in-progress' },
    { actor: 'dept-north-land', baseRevision: 2, at: '2026-09-26T10:00:00+08:00' }
  );
  assert.equal(ledger.nodes.find((n) => n.id === 'permit-land-a1').revision, 3);

  // 乙方仍基于版本 2 提交，发生冲突
  assert.throws(
    () =>
      applyNodeUpdate(
        ledger,
        'permit-land-a1',
        { status: 'satisfied' },
        { actor: 'dept-lead', baseRevision: 2, at: '2026-09-26T10:05:00+08:00' }
      ),
    ConflictError
  );

  // 乙方重新读取后基于版本 3 提交，成功
  applyNodeUpdate(
    ledger,
    'permit-land-a1',
    { status: 'satisfied' },
    { actor: 'dept-lead', baseRevision: 3, at: '2026-09-26T10:06:00+08:00' }
  );
  const node = ledger.nodes.find((n) => n.id === 'permit-land-a1');
  assert.equal(node.status, 'satisfied');
  assert.equal(node.updated_by, 'dept-lead');
});

test('标识与版本字段不允许直接改写', async () => {
  const ledger = await loadLedger();
  assert.throws(
    () => applyNodeUpdate(ledger, 'sec-a1', { revision: 99 }, { actor: 'dept-lead', baseRevision: 3 }),
    /不允许直接更新/
  );
});

test('跨时区会议按真实时刻而非当地时钟排序', async () => {
  const ledger = await loadLedger();
  // 北京 19:00（UTC 11:00）早于圣保罗 08:30（UTC 11:30），尽管后者时钟读数更小
  const ordered = orderMeetings(ledger);
  assert.deepEqual(
    ordered.map((m) => m.id),
    ['mtg-01', 'mtg-02']
  );
});

test('敏感工程字段按许可级别遮蔽且原台账不变', async () => {
  const ledger = await loadLedger();

  const asPublic = redactLedger(ledger, 'public');
  assert.equal(asPublic.ledger.nodes.find((n) => n.id === 'sec-a2').attrs.geology_survey, '[已遮蔽]');
  assert.equal(asPublic.ledger.nodes.find((n) => n.id === 'fund-a2').attrs.budget_breakdown, '[已遮蔽]');
  assert.deepEqual(asPublic.masked.sort(), ['fund-a2:attrs.budget_breakdown', 'sec-a2:attrs.geology_survey']);

  const asInternal = redactLedger(ledger, 'internal');
  assert.equal(asInternal.ledger.nodes.find((n) => n.id === 'sec-a2').attrs.geology_survey, '[已遮蔽]');
  assert.notEqual(asInternal.ledger.nodes.find((n) => n.id === 'fund-a2').attrs.budget_breakdown, '[已遮蔽]');

  const asSensitive = redactLedger(ledger, 'sensitive');
  assert.equal(asSensitive.masked.length, 0);

  // 原台账不受影响
  assert.notEqual(ledger.nodes.find((n) => n.id === 'sec-a2').attrs.geology_survey, '[已遮蔽]');
});
