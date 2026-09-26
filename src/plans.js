// 方案版本：延期、替代路线、争议裁决、灾害重排都生成新版本，被替换方案永久保留。
import { SUPERSEDE_REASONS } from './ledger.js';

export { SUPERSEDE_REASONS };

// 某节点的全部方案版本（含被替换的历史版本），按版本号排序。
export function planHistory(ledger, nodeId) {
  return ledger.plans.filter((p) => p.node === nodeId).sort((a, b) => a.version - b.version);
}

export function activePlan(ledger, nodeId) {
  return ledger.plans.find((p) => p.node === nodeId && p.status === 'active') ?? null;
}

// 用 replacement 替换在执行方案 planId；旧方案转为 superseded 并保留替换原因与依据。
export function supersedePlan(ledger, planId, replacement, { reason, decidedBy, at, ruling = null, disaster = null } = {}) {
  const plan = ledger.plans.find((p) => p.id === planId);
  if (!plan) {
    throw new Error(`方案不存在：${planId}`);
  }
  if (plan.status !== 'active') {
    throw new Error(`方案 ${planId} 不在执行状态，不能再次被替换（历史版本保留）`);
  }
  if (!SUPERSEDE_REASONS.includes(reason)) {
    throw new Error(`替换原因非法：${reason}`);
  }
  if (reason === 'dispute-ruling' && !ruling) {
    throw new Error('争议裁决替换必须提供裁决依据');
  }
  if (reason === 'disaster-reschedule' && !disaster) {
    throw new Error('灾害重排必须关联灾害记录');
  }
  if (!replacement || !replacement.id) {
    throw new Error('替换方案缺少 id');
  }
  if (ledger.plans.some((p) => p.id === replacement.id)) {
    throw new Error(`方案 id 已存在：${replacement.id}`);
  }
  if (!replacement.window || !(replacement.window.start <= replacement.window.end)) {
    throw new Error('替换方案窗口非法');
  }

  const created = {
    id: replacement.id,
    node: plan.node,
    version: plan.version + 1,
    status: 'active',
    window: replacement.window,
    replaces: plan.id,
    created_at: at ?? null,
    ...(replacement.route ? { route: replacement.route } : {}),
    ...(replacement.note ? { note: replacement.note } : {})
  };
  plan.status = 'superseded';
  plan.superseded_by = created.id;
  plan.supersede_reason = reason;
  plan.superseded_at = at ?? null;
  plan.supersede_decided_by = decidedBy ?? null;
  if (ruling) {
    plan.ruling = ruling;
  }
  if (disaster) {
    plan.disaster = disaster;
  }
  ledger.plans.push(created);
  return created;
}

// 灾害引发的计划重排：为受灾节点的在执行方案生成新版本，并登记到灾害档案。
// newWindows 形如 { 节点id: { start, end } }，节点必须在灾害影响范围内。
export function rescheduleForDisaster(ledger, disasterId, newWindows, { decidedBy, at } = {}) {
  const disaster = ledger.disasters.find((d) => d.id === disasterId);
  if (!disaster) {
    throw new Error(`灾害记录不存在：${disasterId}`);
  }
  const created = [];
  for (const [nodeId, window] of Object.entries(newWindows)) {
    if (!disaster.affected_nodes.includes(nodeId)) {
      throw new Error(`节点 ${nodeId} 不在灾害 ${disasterId} 的影响范围内`);
    }
    const current = activePlan(ledger, nodeId);
    if (!current) {
      throw new Error(`节点 ${nodeId} 没有在执行方案，无法重排`);
    }
    const base = current.id.replace(/-v\d+$/, '');
    const id = `${base}-v${current.version + 1}`;
    const plan = supersedePlan(
      ledger,
      current.id,
      { id, window, note: `因 ${disaster.name} 重排` },
      { reason: 'disaster-reschedule', decidedBy, at, disaster: disasterId }
    );
    if (!disaster.triggered_reschedule.includes(plan.id)) {
      disaster.triggered_reschedule.push(plan.id);
    }
    created.push(plan);
  }
  return created;
}

// 服务恢复按阶段登记；同名阶段视为状态推进。全部阶段完成才标记恢复完成。
export function recordRecoveryStage(ledger, disasterId, stage) {
  const disaster = ledger.disasters.find((d) => d.id === disasterId);
  if (!disaster) {
    throw new Error(`灾害记录不存在：${disasterId}`);
  }
  if (!stage?.name || !['pending', 'in-progress', 'done'].includes(stage.status)) {
    throw new Error(`灾害 ${disasterId} 的恢复阶段非法`);
  }
  const existing = disaster.recovery.stages.find((s) => s.name === stage.name);
  if (existing) {
    existing.status = stage.status;
    existing.at = stage.at ?? existing.at ?? null;
  } else {
    disaster.recovery.stages.push({ name: stage.name, status: stage.status, at: stage.at ?? null });
  }
  if (disaster.recovery.stages.every((s) => s.status === 'done') && !disaster.recovery.restored_at) {
    disaster.recovery.restored_at = stage.at ?? null;
  }
  return disaster.recovery;
}

export function recoveryStatus(ledger, disasterId) {
  const disaster = ledger.disasters.find((d) => d.id === disasterId);
  if (!disaster) {
    throw new Error(`灾害记录不存在：${disasterId}`);
  }
  const stages = disaster.recovery.stages;
  return {
    total: stages.length,
    done: stages.filter((s) => s.status === 'done').length,
    inProgress: stages.filter((s) => s.status === 'in-progress').length,
    pending: stages.filter((s) => s.status === 'pending').length,
    restored: disaster.recovery.restored_at != null,
    restored_at: disaster.recovery.restored_at
  };
}
