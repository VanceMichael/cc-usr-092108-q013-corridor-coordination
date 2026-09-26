// 读取并检查项目共享的跨区域通道协同领域资料。
// 结构问题（缺字段、悬空引用、环图、枚举非法等）直接拒绝；
// 承诺四要素缺失、证据不足等业务语义问题不在此拒绝，由分析器判定。

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;
const NODE_KINDS = new Set([
  'section', 'permit', 'standard', 'regulation', 'funding',
  'precondition', 'facility', 'network', 'resilience',
]);
const NODE_STATUS = new Set(['pending', 'in_progress', 'completed', 'suspended']);
const PERMIT_CATEGORIES = new Set(['land', 'sea', 'energy', 'ecology']);
const COMMITMENT_STATUS = new Set(['open', 'fulfilled', 'breached', 'withdrawn']);
const PLAN_STATUS = new Set(['active', 'superseded', 'completed']);
const SUPERSEDE_REASONS = new Set(['delay', 'alternative_route', 'dispute_ruling', 'disaster']);
const EVENT_TYPES = new Set([
  'node_update', 'commitment_update', 'meeting_decision',
  'delay_declared', 'disaster_declared', 'service_update',
]);
const EVIDENCE_KINDS = new Set(['permit_grant', 'engineering_acceptance', 'joint_commissioning']);
const SERVICE_STATUS = new Set(['operational', 'degraded', 'suspended', 'restored']);

function isDate(v) {
  return typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

function isIsoDateTime(v) {
  if (typeof v !== 'string') return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && v.includes('T');
}

export function parseContext(raw) {
  let value;
  try {
    value = typeof raw === 'string' ? JSON.parse(raw) : structuredClone(raw);
  } catch (err) {
    throw new Error(`领域资料不是合法 JSON：${err.message}`);
  }

  const errors = [];
  const fail = (msg) => errors.push(msg);
  const require = (obj, key, where) => {
    if (obj[key] === undefined || obj[key] === null) fail(`${where} 缺少必要字段 ${key}`);
  };

  // ---- 顶层 ----
  for (const key of [
    'domain', 'version', 'sample_id', 'corridors', 'regions', 'units', 'actors',
    'nodes', 'edges', 'standard_changes', 'commitments', 'plans', 'delays',
    'rulings', 'meetings', 'events', 'disasters', 'services', 'evidence',
    'monthly_reports',
  ]) {
    require(value, key, '领域资料');
  }
  if (errors.length) throw new Error(errors.join('；'));

  if (value.domain !== 'corridor-coordination') fail('domain 必须为 corridor-coordination');
  if (!Number.isInteger(value.version) || value.version < 1) fail('version 必须为不小于 1 的整数');
  if (typeof value.sample_id !== 'string' || !value.sample_id) fail('sample_id 必须为非空字符串');

  const arr = (key) => {
    if (!Array.isArray(value[key])) {
      fail(`${key} 必须为数组`);
      value[key] = [];
    }
    return value[key];
  };
  const corridors = arr('corridors');
  const regions = arr('regions');
  const units = arr('units');
  const actors = arr('actors');
  const nodes = arr('nodes');
  const edges = arr('edges');
  const changes = arr('standard_changes');
  const commitments = arr('commitments');
  const plans = arr('plans');
  const delays = arr('delays');
  const rulings = arr('rulings');
  const meetings = arr('meetings');
  const events = arr('events');
  const disasters = arr('disasters');
  const services = arr('services');
  const evidence = arr('evidence');
  const reports = arr('monthly_reports');

  if (errors.length) throw new Error(errors.join('；'));

  // ---- 主键唯一（全局命名空间，避免引用歧义） ----
  const index = new Map();
  const register = (id, where) => {
    if (typeof id !== 'string' || !id) {
      fail(`${where} 缺少有效 id`);
      return;
    }
    if (index.has(id)) fail(`id 重复：${id}（${where} 与 ${index.get(id)}）`);
    else index.set(id, where);
  };
  corridors.forEach((c, i) => { register(c.id, `corridors[${i}]`); });
  regions.forEach((r, i) => { register(r.id, `regions[${i}]`); });
  units.forEach((u, i) => { register(u.id, `units[${i}]`); });
  actors.forEach((a, i) => { register(a.id, `actors[${i}]`); });
  nodes.forEach((n, i) => { register(n.id, `nodes[${i}]`); });
  changes.forEach((c, i) => { register(c.id, `standard_changes[${i}]`); });
  commitments.forEach((c, i) => { register(c.id, `commitments[${i}]`); });
  plans.forEach((p, i) => { register(p.id, `plans[${i}]`); });
  delays.forEach((d, i) => { register(d.id, `delays[${i}]`); });
  rulings.forEach((r, i) => { register(r.id, `rulings[${i}]`); });
  meetings.forEach((m, i) => { register(m.id, `meetings[${i}]`); });
  events.forEach((e, i) => { register(e.id, `events[${i}]`); });
  disasters.forEach((d, i) => { register(d.id, `disasters[${i}]`); });
  services.forEach((s, i) => { register(s.id, `services[${i}]`); });
  evidence.forEach((e, i) => { register(e.id, `evidence[${i}]`); });

  const regionIds = new Set(regions.map((r) => r.id));
  const unitIds = new Set(units.map((u) => u.id));
  const actorIds = new Set(actors.map((a) => a.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const planIds = new Set(plans.map((p) => p.id));
  const commitmentIds = new Set(commitments.map((c) => c.id));
  const refNode = (id, where) => { if (!nodeIds.has(id)) fail(`${where} 引用了不存在的节点 ${id}`); };
  const refUnit = (id, where) => { if (!unitIds.has(id)) fail(`${where} 引用了不存在的单位 ${id}`); };
  const refActor = (id, where) => { if (!actorIds.has(id)) fail(`${where} 引用了不存在的参与者 ${id}`); };
  const refPlan = (id, where) => { if (!planIds.has(id)) fail(`${where} 引用了不存在的计划 ${id}`); };

  // ---- 区域 / 单位 / 参与者 ----
  if (!regions.length) fail('regions 至少包含一个区域');
  for (const r of regions) {
    require(r, 'name', `区域 ${r.id ?? '?'}`);
  }
  for (const u of units) {
    const w = `单位 ${u.id ?? '?'}`;
    require(u, 'name', w);
    if (u.region && !regionIds.has(u.region)) fail(`${w} 引用了不存在的区域 ${u.region}`);
  }
  for (const a of actors) {
    const w = `参与者 ${a.id ?? '?'}`;
    for (const k of ['name', 'role', 'unit', 'timezone']) require(a, k, w);
    if (a.unit && !unitIds.has(a.unit)) fail(`${w} 引用了不存在的单位 ${a.unit}`);
    if (a.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: a.timezone });
      } catch {
        fail(`${w} 时区非法：${a.timezone}`);
      }
    }
  }

  // ---- 节点 ----
  if (!nodes.length) fail('nodes 至少包含一个节点');
  for (const n of nodes) {
    const w = `节点 ${n.id ?? '?'}`;
    for (const k of ['kind', 'name', 'region', 'owner_unit', 'status']) require(n, k, w);
    if (n.kind !== undefined && !NODE_KINDS.has(n.kind)) fail(`${w} kind 非法：${n.kind}`);
    if (n.status !== undefined && !NODE_STATUS.has(n.status)) fail(`${w} status 非法：${n.status}`);
    if (n.region && !regionIds.has(n.region)) fail(`${w} 引用了不存在的区域 ${n.region}`);
    if (n.owner_unit && !unitIds.has(n.owner_unit)) fail(`${w} 引用了不存在的单位 ${n.owner_unit}`);
    if (n.kind === 'permit') {
      if (!n.category || !PERMIT_CATEGORIES.has(n.category)) fail(`${w} 为 permit，必须带合法 category（land/sea/energy/ecology）`);
    } else if (n.category !== undefined) {
      fail(`${w} 的 category 仅允许出现在 permit 节点`);
    }
    if (n.kind === 'standard') {
      if (n.scope !== 'national' && n.scope !== 'local') fail(`${w} 为 standard，必须带 scope=national|local`);
      if (!n.version) fail(`${w} 为 standard，必须带现行 version`);
    }
    if (n.kind === 'regulation' && !n.version) fail(`${w} 为 regulation，必须带现行 version`);
    if (n.kind === 'funding' && typeof n.amount_wan !== 'number') fail(`${w} 为 funding，必须带数值 amount_wan`);
    if (n.kind === 'facility' && n.facility_type !== 'compute' && n.facility_type !== 'data') {
      fail(`${w} 为 facility，必须带 facility_type=compute|data`);
    }
    if (n.sensitive_fields !== undefined && !Array.isArray(n.sensitive_fields)) fail(`${w} sensitive_fields 必须为数组`);
  }

  // ---- 依赖边：引用完整 + 无环 ----
  const adjacency = new Map(nodes.map((n) => [n.id, []]));
  for (const [i, e] of edges.entries()) {
    const w = `edges[${i}]`;
    require(e, 'from', w);
    require(e, 'to', w);
    if (e.from === e.to) fail(`${w} 不允许自环（${e.from}）`);
    refNode(e.from, w);
    refNode(e.to, w);
    if (e.rel !== undefined && !['depends_on', 'supplies', 'protects'].includes(e.rel)) {
      fail(`${w} rel 非法：${e.rel}`);
    }
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) adjacency.get(e.from).push(e.to);
  }
  if (!errors.some((m) => m.includes('引用了不存在的节点'))) {
    const cycle = findCycle(adjacency);
    if (cycle) fail(`依赖图存在环：${cycle.join(' -> ')}`);
  }

  // ---- 标准/法规变更 ----
  for (const ch of changes) {
    const w = `标准变更 ${ch.id ?? '?'}`;
    for (const k of ['node', 'from_version', 'to_version', 'effective']) require(ch, k, w);
    refNode(ch.node, w);
    const target = nodes.find((n) => n.id === ch.node);
    if (target && !['standard', 'regulation'].includes(target.kind)) fail(`${w} 只能作用于 standard/regulation 节点`);
    if (ch.from_version !== undefined && ch.from_version === ch.to_version) fail(`${w} from_version 与 to_version 不能相同`);
    if (ch.effective && !isDate(ch.effective)) fail(`${w} effective 必须为 YYYY-MM-DD`);
  }

  // ---- 承诺（四要素缺失属语义问题，这里只查引用与枚举） ----
  for (const c of commitments) {
    const w = `承诺 ${c.id ?? '?'}`;
    for (const k of ['unit', 'text', 'status']) require(c, k, w);
    refUnit(c.unit, w);
    if (c.status && !COMMITMENT_STATUS.has(c.status)) fail(`${w} status 非法：${c.status}`);
    if (c.deadline !== undefined && !isDate(c.deadline)) fail(`${w} deadline 必须为 YYYY-MM-DD`);
    if (c.affects !== undefined) {
      if (!Array.isArray(c.affects)) fail(`${w} affects 必须为数组`);
      else c.affects.forEach((id) => refNode(id, w));
    }
    if (c.fulfilled_on !== undefined && !isDate(c.fulfilled_on)) fail(`${w} fulfilled_on 必须为 YYYY-MM-DD`);
    if (c.status === 'fulfilled' && !c.fulfilled_on) fail(`${w} status=fulfilled 必须带 fulfilled_on`);
  }

  // ---- 计划谱系 ----
  const plansByNode = new Map();
  for (const p of plans) {
    const w = `计划 ${p.id ?? '?'}`;
    for (const k of ['node', 'version', 'status', 'created']) require(p, k, w);
    refNode(p.node, w);
    if (!Number.isInteger(p.version) || p.version < 1) fail(`${w} version 必须为正整数`);
    if (!PLAN_STATUS.has(p.status)) fail(`${w} status 非法：${p.status}`);
    if (p.created && !isDate(p.created)) fail(`${w} created 必须为 YYYY-MM-DD`);
    if (p.supersede_reason !== undefined && !SUPERSEDE_REASONS.has(p.supersede_reason)) {
      fail(`${w} supersede_reason 非法：${p.supersede_reason}`);
    }
    if (p.superseded_by !== undefined) refPlan(p.superseded_by, w);
    const list = plansByNode.get(p.node) ?? [];
    if (list.some((q) => q.version === p.version)) fail(`${w} 与同节点计划版本号重复（${p.node} v${p.version}）`);
    list.push(p);
    plansByNode.set(p.node, list);
    if (p.milestones !== undefined) {
      if (!Array.isArray(p.milestones)) fail(`${w} milestones 必须为数组`);
      else for (const m of p.milestones) {
        if (!m.name || !isDate(m.date)) fail(`${w} 里程碑必须含 name 与合法 date`);
      }
    }
  }
  for (const p of plans) {
    if (p.superseded_by) {
      const next = plans.find((q) => q.id === p.superseded_by);
      if (next && next.node !== p.node) fail(`计划 ${p.id} 被非同节点计划 ${next.id} 替换`);
    }
    if (p.status === 'superseded' && !p.superseded_by) fail(`计划 ${p.id} 状态为 superseded 但缺少 superseded_by（被替换方案须可追溯）`);
  }
  for (const [nodeId, list] of plansByNode) {
    if (list.filter((p) => p.status === 'active').length > 1) fail(`节点 ${nodeId} 同时存在多个 active 计划`);
  }

  // ---- 延期 / 裁决 ----
  for (const d of delays) {
    const w = `延期 ${d.id ?? '?'}`;
    for (const k of ['node', 'plan', 'announced', 'days', 'cause']) require(d, k, w);
    refNode(d.node, w);
    refPlan(d.plan, w);
    const p = plans.find((q) => q.id === d.plan);
    if (p && p.node !== d.node) fail(`${w} 计划 ${d.plan} 不属于节点 ${d.node}`);
    if (!Number.isInteger(d.days) || d.days < 1) fail(`${w} days 必须为正整数`);
    if (d.announced && !isDate(d.announced)) fail(`${w} announced 必须为 YYYY-MM-DD`);
  }
  for (const r of rulings) {
    const w = `裁决 ${r.id ?? '?'}`;
    for (const k of ['issue', 'decided_by', 'date', 'decision']) require(r, k, w);
    if (r.date && !isDate(r.date)) fail(`${w} date 必须为 YYYY-MM-DD`);
    (r.superseded_plans ?? []).forEach((id) => refPlan(id, w));
    if (r.adopted_plan) refPlan(r.adopted_plan, w);
  }

  // ---- 会议（UTC 时刻） ----
  for (const m of meetings) {
    const w = `会议 ${m.id ?? '?'}`;
    for (const k of ['held_at', 'attendees', 'decisions']) require(m, k, w);
    if (m.held_at && !isIsoDateTime(m.held_at)) fail(`${w} held_at 必须为带时区的 ISO 8601 时刻`);
    if (!Array.isArray(m.attendees)) fail(`${w} attendees 必须为数组`);
    else m.attendees.forEach((id) => refActor(id, w));
    if (!Array.isArray(m.decisions)) fail(`${w} decisions 必须为数组`);
    else for (const d of m.decisions) {
      if (!d.text) fail(`${w} 会议决定缺少 text`);
      if (d.commitment && !commitmentIds.has(d.commitment)) fail(`${w} 引用了不存在的承诺 ${d.commitment}`);
      if (d.plan) refPlan(d.plan, w);
    }
  }

  // ---- 并发事件账本 ----
  for (const e of events) {
    const w = `事件 ${e.id ?? '?'}`;
    for (const k of ['at', 'actor', 'type', 'node', 'field', 'value']) require(e, k, w);
    if (e.at && !isIsoDateTime(e.at)) fail(`${w} at 必须为带时区的 ISO 8601 时刻`);
    refActor(e.actor, w);
    refNode(e.node, w);
    if (e.type && !EVENT_TYPES.has(e.type)) fail(`${w} type 非法：${e.type}`);
    if (e.base_version !== undefined && (!Number.isInteger(e.base_version) || e.base_version < 1)) {
      fail(`${w} base_version 必须为正整数`);
    }
  }

  // ---- 灾害重排 ----
  for (const d of disasters) {
    const w = `灾害 ${d.id ?? '?'}`;
    for (const k of ['name', 'occurred', 'affected_nodes']) require(d, k, w);
    if (d.occurred && !isDate(d.occurred)) fail(`${w} occurred 必须为 YYYY-MM-DD`);
    (d.affected_nodes ?? []).forEach((id) => refNode(id, w));
    for (const rp of d.replans ?? []) {
      refNode(rp.node, w);
      refPlan(rp.new_plan, `${w} 重排`);
      const p = plans.find((q) => q.id === rp.new_plan);
      if (p && p.node !== rp.node) fail(`${w} 重排计划 ${rp.new_plan} 不属于节点 ${rp.node}`);
    }
  }

  // ---- 服务恢复 ----
  for (const s of services) {
    const w = `服务 ${s.id ?? '?'}`;
    for (const k of ['name', 'nodes', 'status']) require(s, k, w);
    if (s.status && !SERVICE_STATUS.has(s.status)) fail(`${w} status 非法：${s.status}`);
    (s.nodes ?? []).forEach((id) => refNode(id, w));
    if (s.suspended_at && !isIsoDateTime(s.suspended_at)) fail(`${w} suspended_at 必须为 ISO 8601 时刻`);
    if (s.restored_at && !isIsoDateTime(s.restored_at)) fail(`${w} restored_at 必须为 ISO 8601 时刻`);
    if (s.recovery_target && !isDate(s.recovery_target)) fail(`${w} recovery_target 必须为 YYYY-MM-DD`);
    if (s.status === 'restored' && !s.restored_at) fail(`${w} status=restored 必须带 restored_at`);
  }

  // ---- 证据 ----
  for (const e of evidence) {
    const w = `证据 ${e.id ?? '?'}`;
    for (const k of ['node', 'kind', 'title', 'issued_by', 'date']) require(e, k, w);
    refNode(e.node, w);
    if (e.kind && !EVIDENCE_KINDS.has(e.kind)) fail(`${w} kind 非法：${e.kind}`);
    if (e.date && !isDate(e.date)) fail(`${w} date 必须为 YYYY-MM-DD`);
  }

  // ---- 月报 ----
  for (const r of reports) {
    const w = `月报（${r.node ?? '?'} ${r.month ?? '?'}）`;
    for (const k of ['node', 'month', 'progress', 'summary']) require(r, k, w);
    refNode(r.node, w);
    if (r.month && !MONTH.test(r.month)) fail(`${w} month 必须为 YYYY-MM`);
    if (typeof r.progress !== 'number' || r.progress < 0 || r.progress > 100) fail(`${w} progress 必须在 0~100`);
  }

  if (errors.length) throw new Error(errors.join('；'));
  return value;
}

// 深度优先找环，返回形成环的节点序列（含回到起点）。
function findCycle(adjacency) {
  const state = new Map(); // 0=未访问 1=在栈中 2=完成
  const stack = [];
  const dfs = (u) => {
    state.set(u, 1);
    stack.push(u);
    for (const v of adjacency.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1) return [...stack.slice(stack.indexOf(v)), v];
      if (s === 0) {
        const found = dfs(v);
        if (found) return found;
      }
    }
    stack.pop();
    state.set(u, 2);
    return null;
  };
  for (const u of adjacency.keys()) {
    if ((state.get(u) ?? 0) === 0) {
      const found = dfs(u);
      if (found) return found;
    }
  }
  return null;
}
