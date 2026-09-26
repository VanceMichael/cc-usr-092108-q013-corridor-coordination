import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseContext } from '../src/context.js';

const FIXTURE = new URL('../fixtures/context.json', import.meta.url);

async function loadRaw() {
  return readFile(FIXTURE, 'utf8');
}

async function loadCtx() {
  return parseContext(await loadRaw());
}

// 修改样例后应被拒绝的用例统一走这里。
async function expectReject(mutate, pattern) {
  const value = JSON.parse(await loadRaw());
  mutate(value);
  assert.throws(() => parseContext(JSON.stringify(value)), pattern);
}

test('样例资料可读取，领域标识与版本完整', async () => {
  const ctx = await loadCtx();
  assert.equal(ctx.domain, 'corridor-coordination');
  assert.ok(ctx.version >= 1);
  assert.ok(ctx.nodes.length > 0);
  assert.ok(ctx.edges.length > 0);
});

test('缺少必要字段被拒绝', async () => {
  await expectReject((v) => { delete v.nodes; }, /缺少必要字段 nodes/);
  await expectReject((v) => { delete v.commitments; }, /缺少必要字段 commitments/);
  await expectReject((v) => { v.domain = 'other'; }, /domain 必须为/);
});

test('悬空引用被拒绝', async () => {
  await expectReject((v) => { v.edges.push({ from: 'NOPE', to: 'SEC-1' }); }, /不存在的节点 NOPE/);
  await expectReject((v) => { v.commitments[0].affects = ['NOPE']; }, /不存在的节点 NOPE/);
  await expectReject((v) => { v.meetings[0].attendees.push('NOPE'); }, /不存在的参与者 NOPE/);
  await expectReject((v) => { v.plans[0].superseded_by = 'NOPE'; }, /不存在的计划 NOPE/);
});

test('依赖图有环被拒绝', async () => {
  await expectReject((v) => { v.edges.push({ from: 'SEC-4', to: 'PRM-LAND-1' }); }, /存在环/);
});

test('枚举与主键约束', async () => {
  await expectReject((v) => { v.nodes[0].status = 'weird'; }, /status 非法/);
  await expectReject((v) => { v.nodes.push({ ...v.nodes[0] }); }, /id 重复/);
  await expectReject((v) => { v.nodes.find((n) => n.id === 'SEC-1').category = 'land'; }, /category 仅允许出现在 permit/);
  await expectReject((v) => { delete v.nodes.find((n) => n.id === 'PRM-SEA-1').category; }, /必须带合法 category/);
});

test('计划谱系结构约束', async () => {
  await expectReject((v) => {
    const p = v.plans.find((q) => q.id === 'PLAN-SEC-1-1');
    delete p.superseded_by;
  }, /superseded 但缺少 superseded_by/);
});

test('承诺四要素缺失不被读取器拒绝（属语义问题，由分析器判定）', async () => {
  const ctx = await loadCtx();
  const cmt3 = ctx.commitments.find((c) => c.id === 'CMT-3');
  assert.equal(cmt3.basis, undefined); // 缺依据仍能读取
});
