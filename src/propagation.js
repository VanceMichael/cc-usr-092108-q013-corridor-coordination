// 变更传播：法规或技术标准变化沿依赖图自动传播到受影响节点与区段。
import {
  buildGraph, downstreamClosure, findPaths, effectiveStatus, blockerCategory,
} from './graph.js';

// 一次标准/法规变更的完整影响面。
export function propagateChange(ctx, changeId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const change = (ctx.standard_changes ?? []).find((c) => c.id === changeId);
  if (!change) throw new Error(`未知标准变更：${changeId}`);

  const graph = buildGraph(ctx);
  const source = graph.nodes.get(change.node);
  const impactedIds = [...downstreamClosure(graph, change.node)];
  const sections = ctx.nodes.filter((n) => n.kind === 'section').map((n) => n.id);

  const impacted = impactedIds.map((id) => {
    const n = graph.nodes.get(id);
    return {
      id,
      name: n.name,
      kind: n.kind,
      category: blockerCategory(n).label,
      status: effectiveStatus(ctx, n, date),
      paths: findPaths(graph, change.node, id),
    };
  });

  const impactedSet = new Set(impactedIds);
  const commitmentsAtRisk = (ctx.commitments ?? [])
    .filter((c) => Array.isArray(c.affects) && c.affects.some((id) => impactedSet.has(id) || id === change.node))
    .map((c) => c.id);

  return {
    change: { ...change, effective_now: change.effective <= date },
    source: { id: source.id, name: source.name, kind: source.kind },
    impacted,
    impacted_sections: impactedIds.filter((id) => sections.includes(id)),
    commitments_at_risk: commitmentsAtRisk,
  };
}

// 全部已登记变更的传播结果汇总（法规/标准变化自动传播）。
export function propagateAll(ctx, opts = {}) {
  return (ctx.standard_changes ?? []).map((c) => propagateChange(ctx, c.id, opts));
}
