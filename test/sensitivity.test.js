import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';
import { redactContext, findLeakedSensitiveFields, REDACTED } from '../src/sensitivity.js';

const ctx = parseContext(await readFile(new URL('../fixtures/context.json', import.meta.url), 'utf8'));

test('受限视图下敏感工程字段被脱敏', () => {
  const view = redactContext(ctx, { clearance: 'restricted' });
  const sec2 = view.nodes.find((n) => n.id === 'SEC-2');
  assert.equal(sec2.alignment_survey, REDACTED);
  assert.equal(sec2.geology_profile, REDACTED);
  const net1 = view.nodes.find((n) => n.id === 'NET-1');
  assert.equal(net1.cable_route, REDACTED);
  // 非敏感字段不受影响
  assert.equal(sec2.name, '临湾段');
});

test('完整权限视图保留原值', () => {
  const view = redactContext(ctx, { clearance: 'full' });
  const sec2 = view.nodes.find((n) => n.id === 'SEC-2');
  assert.match(sec2.alignment_survey, /K12\+300/);
});

test('脱敏不改动原始资料', () => {
  redactContext(ctx, { clearance: 'restricted' });
  const sec2 = ctx.nodes.find((n) => n.id === 'SEC-2');
  assert.match(sec2.alignment_survey, /K12\+300/);
});

test('泄漏审计：受限视图无敏感字段残留', () => {
  assert.deepEqual(findLeakedSensitiveFields(ctx, { clearance: 'restricted' }), []);
});
