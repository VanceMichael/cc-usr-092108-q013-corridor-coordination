import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { detectConflicts, effectiveField, meetingLocalTimes } from '../src/collaboration.js';

const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('多方同时更新同一字段：检出冲突并保留全部写入', () => {
  const conflicts = detectConflicts(ctx);
  assert.equal(conflicts.length, 1);
  const c = conflicts[0];
  assert.equal(c.node, 'NET-1');
  assert.equal(c.field, 'planned_ready_date');
  // 最后写入者胜出，但被覆盖的写入保留备查
  assert.equal(c.winner.event, 'EVT-005');
  assert.equal(c.winner.value, '2026-11-30');
  assert.equal(c.superseded_writes.length, 1);
  assert.equal(c.superseded_writes[0].event, 'EVT-004');
  assert.equal(c.superseded_writes[0].value, '2026-12-31');
});

test('基于不同版本的顺序更新不算冲突', () => {
  const conflicts = detectConflicts(ctx);
  assert.ok(!conflicts.some((c) => c.node === 'PRE-1'));
});

test('有效值取最后写入', () => {
  assert.equal(effectiveField(ctx, 'NET-1', 'planned_ready_date'), '2026-11-30');
  assert.equal(effectiveField(ctx, 'PRE-1', 'status'), 'in_progress');
});

test('跨时区会议：UTC 时刻换算到每位参会人本地时间', () => {
  const m = meetingLocalTimes(ctx, 'MTG-1');
  assert.equal(m.utc, '2026-06-18T13:00:00Z');
  assert.equal(m.attendees.length, 5);
  for (const a of m.attendees) {
    assert.equal(a.local_time, '2026-06-18 21:00 GMT+8');
  }
});

test('会议决定可追溯到承诺与计划', () => {
  const m = meetingLocalTimes(ctx, 'MTG-1');
  const [d1, d2] = m.decisions;
  assert.equal(d1.plan, 'PLAN-SEC-2-2');
  assert.equal(d2.commitment, 'CMT-2');
});
