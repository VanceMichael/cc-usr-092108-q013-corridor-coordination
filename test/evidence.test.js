import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { evaluateClaim, auditClaims } from '../src/evidence.js';

const AS_OF = '2026-09-26';
const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('完工声明可下钻到许可、工程验收与联调证据', () => {
  const claim = evaluateClaim(ctx, 'SEC-3', { asOf: AS_OF });
  assert.equal(claim.supported, true);
  const kinds = claim.required.map((r) => r.kind);
  assert.ok(kinds.includes('permit_grant'));
  assert.ok(kinds.includes('engineering_acceptance'));
  assert.ok(kinds.includes('joint_commissioning'));
  // 每类证据都能拿出具体凭据
  const evIds = claim.evidence.map((e) => e.id);
  for (const id of ['EV-1', 'EV-3', 'EV-4']) assert.ok(evIds.includes(id), `缺 ${id}`);
});

test('许可未完成时完工声明不成立', () => {
  const claim = evaluateClaim(ctx, 'SEC-1', { asOf: AS_OF });
  assert.equal(claim.supported, false);
  assert.ok(claim.missing.some((m) => m.kind === 'permit_incomplete' && m.node === 'PRM-SEA-1'));
  assert.ok(claim.missing.some((m) => m.kind === 'engineering_acceptance'));
  assert.ok(claim.missing.some((m) => m.kind === 'joint_commissioning'));
});

test('别段的许可问题不算本段证据缺口（堵点归堵点分析）', () => {
  // SEC-3 下游依赖 SEC-1/SEC-2，但其完工声明只核自身前置子图
  const claim = evaluateClaim(ctx, 'SEC-3', { asOf: AS_OF });
  assert.ok(!claim.missing.some((m) => m.node === 'PRM-SEA-1'));
});

test('许可完成但缺批复证据同样不成立', () => {
  const broken = structuredClone(ctx);
  broken.evidence = broken.evidence.filter((e) => e.id !== 'EV-1');
  const claim = evaluateClaim(broken, 'SEC-3', { asOf: AS_OF });
  assert.equal(claim.supported, false);
  assert.ok(claim.missing.some((m) => m.kind === 'permit_grant' && m.node === 'PRM-LAND-1'));
});

test('全库完工审计：两段有据、两段无据', () => {
  const audit = auditClaims(ctx, { asOf: AS_OF });
  const supported = audit.filter((c) => c.supported).map((c) => c.node).sort();
  assert.deepEqual(supported, ['SEC-3', 'SEC-4']);
});
