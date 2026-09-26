// 跨区域通道协同台账：读取、结构校验与承诺有效性判定。
// 契约见 contracts/corridor.schema.json，本模块负责检查必要字段与引用完整性。

export const NODE_KINDS = [
  'corridor-structure',
  'permit',
  'standard',
  'funding',
  'construction-prerequisite',
  'compute-data-facility',
  'resilience-measure'
];

export const ELEMENTS = [
  'corridor-structure',
  'land',
  'sea',
  'energy',
  'ecology',
  'construction-permit',
  'local-standard',
  'technical-standard',
  'regulation',
  'funding',
  'site',
  'supporting-network',
  'material',
  'compute-data',
  'resilience'
];

export const ELEMENT_LABELS = {
  'corridor-structure': '通道结构',
  land: '用地',
  sea: '用海',
  energy: '用能',
  ecology: '生态要求',
  'construction-permit': '施工许可',
  'local-standard': '地方标准',
  'technical-standard': '技术标准',
  regulation: '法规要求',
  funding: '资金',
  site: '施工场地',
  'supporting-network': '配套网络',
  material: '物料供应',
  'compute-data': '算力数据设施',
  resilience: '韧性措施'
};

export const NODE_STATUS = ['pending', 'in-progress', 'satisfied', 'failed', 'suspended'];

export const NODE_STATUS_LABELS = {
  pending: '待启动',
  'in-progress': '推进中',
  satisfied: '已满足',
  failed: '失败',
  suspended: '暂停'
};

export const SUPERSEDE_REASONS = ['delay', 'alternative-route', 'dispute-ruling', 'disaster-reschedule'];

const COLLECTIONS = [
  'departments',
  'nodes',
  'dependencies',
  'commitments',
  'changes',
  'plans',
  'meetings',
  'disasters',
  'claims',
  'conclusions'
];

const INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:\d{2}|Z)$/;

function fail(message) {
  throw new Error(`台账校验失败：${message}`);
}

function isDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isDateTime(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function ensureUniqueIds(items, collection) {
  const seen = new Set();
  for (const item of items) {
    if (!item.id || seen.has(item.id)) {
      fail(`集合 ${collection} 存在缺失或重复的 id：${item.id ?? '(缺失)'}`);
    }
    seen.add(item.id);
  }
}

// 读取并校验协同台账，raw 可以是 JSON 字符串或已解析的对象。
export function parseLedger(raw) {
  const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  validateLedger(value);
  return value;
}

function validateLedger(ledger) {
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
    fail('台账必须是对象');
  }
  if (ledger.domain !== 'corridor-coordination') {
    fail('domain 必须为 corridor-coordination');
  }
  if (ledger.product !== 'corridor-collaboration-ledger') {
    fail('product 必须为 corridor-collaboration-ledger');
  }
  if (!Number.isInteger(ledger.version) || ledger.version < 1) {
    fail('version 必须为不小于 1 的整数');
  }
  if (!ledger.sample_id) {
    fail('缺少 sample_id');
  }
  for (const key of COLLECTIONS) {
    if (!Array.isArray(ledger[key])) {
      fail(`缺少集合 ${key}`);
    }
  }
  if (!ledger.departments.length) {
    fail('departments 不能为空');
  }
  if (!ledger.nodes.length) {
    fail('nodes 不能为空');
  }
  for (const key of COLLECTIONS) {
    ensureUniqueIds(ledger[key], key);
  }

  const deptIds = new Set(ledger.departments.map((d) => d.id));
  for (const dept of ledger.departments) {
    if (!dept.name) {
      fail(`部门 ${dept.id} 缺少名称`);
    }
  }

  const nodeIds = new Set(ledger.nodes.map((n) => n.id));
  for (const node of ledger.nodes) {
    validateNode(node, deptIds);
  }

  const planIds = new Set(ledger.plans.map((p) => p.id));
  const disasterIds = new Set(ledger.disasters.map((d) => d.id));

  for (const edge of ledger.dependencies) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      fail(`依赖 ${edge.id} 引用了不存在的节点`);
    }
    if (edge.type !== 'prerequisite') {
      fail(`依赖 ${edge.id} 的 type 暂只支持 prerequisite`);
    }
    if (typeof edge.hard !== 'boolean') {
      fail(`依赖 ${edge.id} 缺少 hard 标记`);
    }
  }

  for (const commitment of ledger.commitments) {
    if (!deptIds.has(commitment.party)) {
      fail(`承诺 ${commitment.id} 的承诺方不存在`);
    }
    if (!['open', 'fulfilled'].includes(commitment.status)) {
      fail(`承诺 ${commitment.id} 状态非法：${commitment.status}`);
    }
    if (commitment.status === 'fulfilled' && !isDate(commitment.fulfilled_at)) {
      fail(`承诺 ${commitment.id} 已兑现但缺少兑现日期`);
    }
    if (commitment.deadline !== undefined && !isDate(commitment.deadline)) {
      fail(`承诺 ${commitment.id} 截止日格式非法`);
    }
    if (commitment.affected_nodes !== undefined) {
      if (!Array.isArray(commitment.affected_nodes)) {
        fail(`承诺 ${commitment.id} 的受影响节点必须是数组`);
      }
      for (const id of commitment.affected_nodes) {
        if (!nodeIds.has(id)) {
          fail(`承诺 ${commitment.id} 引用了不存在的节点 ${id}`);
        }
      }
    }
  }

  for (const change of ledger.changes) {
    if (!['standard-update', 'regulation-update'].includes(change.kind)) {
      fail(`变更 ${change.id} 类型非法：${change.kind}`);
    }
    if (!nodeIds.has(change.target)) {
      fail(`变更 ${change.id} 指向不存在的节点`);
    }
    if (!isDate(change.effective)) {
      fail(`变更 ${change.id} 生效日期非法`);
    }
    if (!deptIds.has(change.issued_by)) {
      fail(`变更 ${change.id} 发布方不存在`);
    }
    if (!change.summary) {
      fail(`变更 ${change.id} 缺少摘要`);
    }
  }

  for (const disaster of ledger.disasters) {
    validateDisaster(disaster, nodeIds, planIds);
  }

  for (const plan of ledger.plans) {
    validatePlan(plan, ledger, { nodeIds, planIds, disasterIds });
  }
  const activeByNode = new Map();
  for (const plan of ledger.plans) {
    if (plan.status !== 'active') {
      continue;
    }
    if (activeByNode.has(plan.node)) {
      fail(`节点 ${plan.node} 存在多个在执行方案：${activeByNode.get(plan.node)} 与 ${plan.id}`);
    }
    activeByNode.set(plan.node, plan.id);
  }

  for (const meeting of ledger.meetings) {
    if (!INSTANT_RE.test(meeting.held_at ?? '')) {
      fail(`会议 ${meeting.id} 的 held_at 必须带时区偏移`);
    }
    if (!meeting.timezone) {
      fail(`会议 ${meeting.id} 缺少时区名`);
    }
    if (!Array.isArray(meeting.participants) || meeting.participants.some((p) => !deptIds.has(p))) {
      fail(`会议 ${meeting.id} 参会方存在未知部门`);
    }
    if (!Array.isArray(meeting.decisions) || !meeting.decisions.length) {
      fail(`会议 ${meeting.id} 缺少决定`);
    }
  }

  for (const claim of ledger.claims) {
    validateClaim(claim, nodeIds, deptIds);
  }

  for (const conclusion of ledger.conclusions) {
    if (!nodeIds.has(conclusion.node)) {
      fail(`结论 ${conclusion.id} 指向不存在的节点`);
    }
    if (!conclusion.region || !conclusion.summary) {
      fail(`结论 ${conclusion.id} 缺少区域或内容`);
    }
    if (!deptIds.has(conclusion.recorded_by)) {
      fail(`结论 ${conclusion.id} 的记录方不存在`);
    }
    if (!isDateTime(conclusion.recorded_at)) {
      fail(`结论 ${conclusion.id} 的记录时间非法`);
    }
  }
}

function validateNode(node, deptIds) {
  if (!NODE_KINDS.includes(node.kind)) {
    fail(`节点 ${node.id} 类型非法：${node.kind}`);
  }
  if (!ELEMENTS.includes(node.element)) {
    fail(`节点 ${node.id} 要素类别非法：${node.element}`);
  }
  if (!node.name || !node.region) {
    fail(`节点 ${node.id} 缺少名称或区域`);
  }
  if (!deptIds.has(node.owner)) {
    fail(`节点 ${node.id} 的责任部门不存在`);
  }
  if (!NODE_STATUS.includes(node.status)) {
    fail(`节点 ${node.id} 状态非法：${node.status}`);
  }
  if (!Number.isInteger(node.revision) || node.revision < 1) {
    fail(`节点 ${node.id} 的 revision 必须为不小于 1 的整数`);
  }
  if (!deptIds.has(node.updated_by)) {
    fail(`节点 ${node.id} 的更新方不存在`);
  }
  if (!isDateTime(node.updated_at)) {
    fail(`节点 ${node.id} 的更新时间非法`);
  }
  if (node.attrs !== undefined && (typeof node.attrs !== 'object' || node.attrs === null || Array.isArray(node.attrs))) {
    fail(`节点 ${node.id} 的 attrs 必须是对象`);
  }
  if (node.sensitivity !== undefined) {
    for (const [path, level] of Object.entries(node.sensitivity)) {
      if (!path.startsWith('attrs.')) {
        fail(`节点 ${node.id} 的敏感标记仅支持 attrs.* 字段`);
      }
      if (!['internal', 'sensitive'].includes(level)) {
        fail(`节点 ${node.id} 的敏感级别非法：${level}`);
      }
    }
  }
}

function validateDisaster(disaster, nodeIds, planIds) {
  if (!['typhoon', 'flood', 'earthquake', 'other'].includes(disaster.kind)) {
    fail(`灾害 ${disaster.id} 类型非法：${disaster.kind}`);
  }
  if (!disaster.name || !isDateTime(disaster.occurred_at)) {
    fail(`灾害 ${disaster.id} 缺少名称或发生时间非法`);
  }
  for (const id of disaster.affected_nodes ?? []) {
    if (!nodeIds.has(id)) {
      fail(`灾害 ${disaster.id} 引用了不存在的节点 ${id}`);
    }
  }
  for (const id of disaster.triggered_reschedule ?? []) {
    if (!planIds.has(id)) {
      fail(`灾害 ${disaster.id} 引用了不存在的方案 ${id}`);
    }
  }
  if (!disaster.recovery || !Array.isArray(disaster.recovery.stages)) {
    fail(`灾害 ${disaster.id} 缺少恢复记录`);
  }
  for (const stage of disaster.recovery.stages) {
    if (!stage.name || !['pending', 'in-progress', 'done'].includes(stage.status)) {
      fail(`灾害 ${disaster.id} 的恢复阶段非法`);
    }
    if (stage.at != null && !isDateTime(stage.at)) {
      fail(`灾害 ${disaster.id} 的恢复阶段时间非法`);
    }
  }
  if (disaster.recovery.restored_at != null && !isDateTime(disaster.recovery.restored_at)) {
    fail(`灾害 ${disaster.id} 的恢复完成时间非法`);
  }
}

function validatePlan(plan, ledger, { nodeIds, planIds, disasterIds }) {
  if (!nodeIds.has(plan.node)) {
    fail(`方案 ${plan.id} 指向不存在的节点`);
  }
  if (!Number.isInteger(plan.version) || plan.version < 1) {
    fail(`方案 ${plan.id} 版本号非法`);
  }
  if (!['active', 'superseded', 'completed'].includes(plan.status)) {
    fail(`方案 ${plan.id} 状态非法：${plan.status}`);
  }
  if (!plan.window || !isDate(plan.window.start) || !isDate(plan.window.end) || plan.window.start > plan.window.end) {
    fail(`方案 ${plan.id} 窗口非法`);
  }
  if (plan.replaces !== undefined && !planIds.has(plan.replaces)) {
    fail(`方案 ${plan.id} 的 replaces 指向不存在的方案`);
  }
  if (plan.status !== 'superseded') {
    return;
  }
  // 被替换方案必须保留完整的替换链：谁替换了它、为什么、依据是什么。
  if (!planIds.has(plan.superseded_by)) {
    fail(`方案 ${plan.id} 缺少被替换指向`);
  }
  if (!SUPERSEDE_REASONS.includes(plan.supersede_reason)) {
    fail(`方案 ${plan.id} 缺少替换原因`);
  }
  if (plan.supersede_reason === 'dispute-ruling' && !plan.ruling) {
    fail(`方案 ${plan.id} 为争议裁决替换，缺少裁决依据`);
  }
  if (plan.supersede_reason === 'disaster-reschedule') {
    if (!disasterIds.has(plan.disaster)) {
      fail(`方案 ${plan.id} 为灾害重排，缺少灾害引用`);
    }
    const disaster = ledger.disasters.find((d) => d.id === plan.disaster);
    if (!(disaster.triggered_reschedule ?? []).includes(plan.superseded_by)) {
      fail(`方案 ${plan.id} 的重排结果未登记在灾害 ${plan.disaster} 中`);
    }
  }
  const replacement = ledger.plans.find((p) => p.id === plan.superseded_by);
  if (replacement.replaces !== plan.id) {
    fail(`方案 ${plan.id} 与 ${plan.superseded_by} 的替换关系不一致`);
  }
}

function validateClaim(claim, nodeIds, deptIds) {
  if (!nodeIds.has(claim.node)) {
    fail(`完成声明 ${claim.id} 指向不存在的节点`);
  }
  if (!claim.statement) {
    fail(`完成声明 ${claim.id} 缺少声明内容`);
  }
  if (!deptIds.has(claim.declared_by)) {
    fail(`完成声明 ${claim.id} 的声明方不存在`);
  }
  if (!isDateTime(claim.declared_at)) {
    fail(`完成声明 ${claim.id} 的声明时间非法`);
  }
  if (!Array.isArray(claim.evidence)) {
    fail(`完成声明 ${claim.id} 的 evidence 必须是数组`);
  }
  const evidenceIds = new Set();
  for (const evidence of claim.evidence) {
    if (!evidence.id || evidenceIds.has(evidence.id)) {
      fail(`完成声明 ${claim.id} 的证据 id 缺失或重复`);
    }
    evidenceIds.add(evidence.id);
    if (!['permit', 'engineering', 'joint-commissioning'].includes(evidence.kind)) {
      fail(`证据 ${evidence.id} 类型非法：${evidence.kind}`);
    }
    if (evidence.issued_by !== undefined && !deptIds.has(evidence.issued_by)) {
      fail(`证据 ${evidence.id} 的出具方不存在`);
    }
    for (const id of evidence.nodes ?? []) {
      if (!nodeIds.has(id)) {
        fail(`证据 ${evidence.id} 引用了不存在的节点 ${id}`);
      }
    }
  }
}

export function nodeById(ledger, id) {
  const node = ledger.nodes.find((n) => n.id === id);
  if (!node) {
    throw new Error(`节点不存在：${id}`);
  }
  return node;
}

// 地方承诺四要素：责任人、截止日、依据、受影响节点，齐全才算有效。
export function commitmentValidity(commitment) {
  const missing = [];
  if (!commitment.owner_person) {
    missing.push('责任人');
  }
  if (!commitment.deadline) {
    missing.push('截止日');
  }
  if (!commitment.basis) {
    missing.push('依据');
  }
  if (!Array.isArray(commitment.affected_nodes) || commitment.affected_nodes.length === 0) {
    missing.push('受影响节点');
  }
  return { valid: missing.length === 0, missing };
}

export function validCommitments(ledger) {
  return ledger.commitments.filter((c) => commitmentValidity(c).valid);
}

export function invalidCommitments(ledger) {
  return ledger.commitments
    .filter((c) => !commitmentValidity(c).valid)
    .map((c) => ({ id: c.id, party: c.party, missing: commitmentValidity(c).missing }));
}

// 逾期判定需要显式传入基准日（YYYY-MM-DD），避免结果随运行时间漂移。
export function isCommitmentOverdue(commitment, now) {
  return commitment.status === 'open' && Boolean(commitment.deadline) && commitment.deadline < now;
}
