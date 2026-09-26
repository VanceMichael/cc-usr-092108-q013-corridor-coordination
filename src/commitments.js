// 地方承诺：责任人、截止日、依据、受影响节点四要素齐全才算有效。
import { buildGraph, downstreamClosure } from './graph.js';

export const COMMITMENT_REQUIRED_FIELDS = ['responsible', 'deadline', 'basis', 'affects'];

function missingFields(c) {
  const missing = [];
  for (const f of COMMITMENT_REQUIRED_FIELDS) {
    const v = c[f];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      missing.push(f);
    }
  }
  return missing;
}

// 逐条判定承诺：有效性、逾期、受影响区段。
export function analyzeCommitments(ctx, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const graph = buildGraph(ctx);
  const sections = ctx.nodes.filter((n) => n.kind === 'section').map((n) => n.id);

  return (ctx.commitments ?? []).map((c) => {
    const missing = missingFields(c);
    const valid = missing.length === 0;
    const overdue = valid && c.status === 'open' && c.deadline < date;
    let effective = c.status;
    if (!valid) effective = 'invalid';
    else if (overdue) effective = 'overdue';

    const affectedSections = valid
      ? [...new Set(c.affects.flatMap((id) => [...downstreamClosure(graph, id)]))]
        .filter((id) => sections.includes(id))
      : [];

    return {
      id: c.id,
      unit: c.unit,
      text: c.text,
      status: c.status,
      effective_status: effective,
      valid,
      missing_fields: missing,
      overdue,
      deadline: c.deadline ?? null,
      affects: c.affects ?? [],
      affected_sections: affectedSections,
    };
  });
}

// 只取会拖住工程的有效承诺问题：无效承诺 + 逾期未兑现。
export function commitmentAlerts(ctx, opts = {}) {
  return analyzeCommitments(ctx, opts).filter(
    (c) => !c.valid || c.overdue || c.status === 'breached',
  );
}
