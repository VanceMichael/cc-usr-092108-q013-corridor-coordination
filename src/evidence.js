// 完成声明的证据下钻：任何「已完工」都必须能下钻到许可、工程验收与联调证据。
import { buildGraph, sectionPrerequisites, effectiveStatus, isResolved } from './graph.js';

export const EVIDENCE_KIND_LABELS = {
  permit_grant: '许可批复',
  engineering_acceptance: '工程验收',
  joint_commissioning: '联调证明',
};

// 评估某区段的完成声明。
// 要求：自身前置子图中的许可全部完成且各有许可批复证据；本区段有工程验收与联调证明。
export function evaluateClaim(ctx, sectionId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const graph = buildGraph(ctx);
  const section = graph.nodes.get(sectionId);
  if (!section) throw new Error(`未知节点：${sectionId}`);

  const prereqs = sectionPrerequisites(graph, sectionId);
  const upstreamPermits = [...prereqs]
    .map((id) => graph.nodes.get(id))
    .filter((n) => n.kind === 'permit');

  const evidenceFor = (nodeId, kind) =>
    (ctx.evidence ?? []).filter((e) => e.node === nodeId && e.kind === kind);

  const required = [];
  const missing = [];

  for (const permit of upstreamPermits) {
    const status = effectiveStatus(ctx, permit, date);
    const grants = evidenceFor(permit.id, 'permit_grant');
    required.push({
      kind: 'permit_grant',
      kind_label: EVIDENCE_KIND_LABELS.permit_grant,
      node: permit.id,
      node_name: permit.name,
      permit_status: status,
      evidence: grants.map((e) => e.id),
    });
    if (!isResolved(status)) missing.push({ kind: 'permit_incomplete', node: permit.id, node_name: permit.name });
    else if (!grants.length) missing.push({ kind: 'permit_grant', node: permit.id, node_name: permit.name });
  }

  for (const kind of ['engineering_acceptance', 'joint_commissioning']) {
    const found = evidenceFor(sectionId, kind);
    required.push({
      kind,
      kind_label: EVIDENCE_KIND_LABELS[kind],
      node: sectionId,
      node_name: section.name,
      evidence: found.map((e) => e.id),
    });
    if (!found.length) missing.push({ kind, node: sectionId, node_name: section.name });
  }

  const supported = section.status === 'completed' && missing.length === 0;
  const drilldown = (ctx.evidence ?? []).filter(
    (e) => e.node === sectionId || upstreamPermits.some((p) => p.id === e.node),
  );

  return {
    node: sectionId,
    declared_status: section.status,
    supported,
    required,
    missing,
    evidence: drilldown,
  };
}

// 全库完成声明审计：所有声明 completed 的区段是否都有证据支撑。
export function auditClaims(ctx, opts = {}) {
  return ctx.nodes
    .filter((n) => n.kind === 'section')
    .map((n) => evaluateClaim(ctx, n.id, opts));
}
