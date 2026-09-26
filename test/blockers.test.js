import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { analyzeBlockers, interpretMonthlyReport } from '../src/blockers.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('澜东段的真正堵点是用海批复，而非模糊的推进中', () => {
  const r = analyzeBlockers(ctx, 'SEC-1', { asOf: AS_OF });
  assert.equal(r.blocked, true);
  assert.deepEqual(r.root_causes.map((c) => c.id), ['PRM-SEA-1']);
  assert.equal(r.root_causes[0].category, '用海');
  assert.equal(r.root_causes[0].owner_unit, 'UNIT-WEST-NR');
});

test('临湾段堵点按要素分类：用海、生态要求、地方标准', () => {
  const r = analyzeBlockers(ctx, 'SEC-2', { asOf: AS_OF });
  const categories = r.root_causes.map((c) => c.category).sort();
  assert.deepEqual(categories, ['地方标准', '生态要求', '用海'].sort());
  const keys = r.by_category.map((c) => c.key).sort();
  assert.deepEqual(keys, ['ecology', 'local_standard', 'sea'].sort());
});

test('根因链可下钻：法规修订卡在用海批复上游', () => {
  const r = analyzeBlockers(ctx, 'SEC-1', { asOf: AS_OF });
  // REG-SEA-1 已生效换版视为已解决，根因收敛到 PRM-SEA-1 本身
  const chain = r.blocking_chains.find((c) => c.root === 'PRM-SEA-1');
  assert.ok(chain.paths.some((p) => p.join('>') === 'PRM-SEA-1>SEC-1'));
});

test('根因影响面：用海批复同时卡住多个区段', () => {
  const r = analyzeBlockers(ctx, 'SEC-2', { asOf: AS_OF });
  const sea = r.root_impact.find((i) => i.root === 'PRM-SEA-1');
  assert.ok(sea.blocked_sections.includes('SEC-1'));
  assert.ok(sea.blocked_sections.includes('SEC-2'));
  assert.ok(sea.blocked_sections.includes('SEC-3'));
});

test('月报解释器把「推进中」换算成具体堵点与待生效变更', () => {
  const r = interpretMonthlyReport(ctx, 'SEC-2', { asOf: AS_OF });
  assert.equal(r.summary, '推进中');
  assert.equal(r.vague, true);
  assert.equal(r.blocked, true);
  assert.equal(r.root_causes.length, 3);
  // 地方标准换版尚未生效、法规修订已生效，都要列出
  const chg1 = r.pending_changes.find((c) => c.id === 'CHG-1');
  const chg2 = r.pending_changes.find((c) => c.id === 'CHG-2');
  assert.equal(chg1.effective_now, false);
  assert.equal(chg2.effective_now, true);
});
