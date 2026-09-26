// 堵点计算：把「推进中」换算成可计算的堵点、根因链与受影响面。
import {
  buildGraph, upstreamClosure, downstreamClosure, findPaths,
  effectiveStatus, isResolved, blockerCategory,
} from './graph.js';

// 分析某个节点（通常为区段）被什么卡住。
// 返回未解决上游、根因（自身上游已全部解决的未解决节点）、按类别归组、阻塞链。
export function analyzeBlockers(ctx, nodeId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const graph = buildGraph(ctx);
  const node = graph.nodes.get(nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);

  const upstream = [...upstreamClosure(graph, nodeId)];
  const unresolved = upstream
    .map((id) => graph.nodes.get(id))
    .filter((n) => !isResolved(effectiveStatus(ctx, n, date)));

  const unresolvedIds = new Set(unresolved.map((n) => n.id));
  const rootCauses = unresolved.filter((n) => {
    const own = upstreamClosure(graph, n.id);
    return ![...own].some((id) => unresolvedIds.has(id));
  });

  const byCategory = new Map();
  for (const n of unresolved) {
    const cat = blockerCategory(n);
    if (!byCategory.has(cat.key)) byCategory.set(cat.key, { key: cat.key, label: cat.label, nodes: [] });
    byCategory.get(cat.key).nodes.push(n.id);
  }

  const chains = rootCauses.map((root) => ({
    root: root.id,
    category: blockerCategory(root).label,
    paths: findPaths(graph, root.id, nodeId),
  }));

  // 每个根因的受影响面：除本节点外还堵住哪些区段。
  const sections = ctx.nodes.filter((n) => n.kind === 'section').map((n) => n.id);
  const rootImpact = rootCauses.map((root) => ({
    root: root.id,
    category: blockerCategory(root).label,
    blocked_sections: sections.filter((s) => downstreamClosure(graph, root.id).has(s)),
  }));

  return {
    node: nodeId,
    blocked: unresolved.length > 0,
    unresolved_count: unresolved.length,
    unresolved: unresolved.map((n) => ({
      id: n.id,
      name: n.name,
      kind: n.kind,
      category: blockerCategory(n).label,
      status: effectiveStatus(ctx, n, date),
      owner_unit: n.owner_unit,
    })),
    root_causes: rootCauses.map((n) => ({
      id: n.id,
      name: n.name,
      category: blockerCategory(n).label,
      owner_unit: n.owner_unit,
    })),
    by_category: [...byCategory.values()],
    blocking_chains: chains,
    root_impact: rootImpact,
  };
}

// 解释区段月报：模糊措辞（如「推进中」）→ 真实堵点与待生效变更。
export function interpretMonthlyReport(ctx, nodeId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const reports = (ctx.monthly_reports ?? [])
    .filter((r) => r.node === nodeId)
    .sort((a, b) => b.month.localeCompare(a.month));
  const report = reports[0] ?? null;
  const analysis = analyzeBlockers(ctx, nodeId, { asOf: date });

  // 影响本区段上游的已登记变更（生效与否都列出，便于提前应对）。
  const graph = buildGraph(ctx);
  const upstream = upstreamClosure(graph, nodeId);
  const changes = (ctx.standard_changes ?? [])
    .filter((c) => upstream.has(c.node))
    .map((c) => ({
      id: c.id,
      node: c.node,
      from_version: c.from_version,
      to_version: c.to_version,
      effective: c.effective,
      effective_now: c.effective <= date,
      summary: c.summary,
    }));

  return {
    node: nodeId,
    month: report?.month ?? null,
    progress: report?.progress ?? null,
    summary: report?.summary ?? null,
    vague: report ? report.summary.trim().length <= 4 : null,
    blocked: analysis.blocked,
    root_causes: analysis.root_causes,
    by_category: analysis.by_category,
    blocking_chains: analysis.blocking_chains,
    pending_changes: changes,
  };
}
