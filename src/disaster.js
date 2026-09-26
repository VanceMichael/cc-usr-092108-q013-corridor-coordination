// 灾害与服务恢复：灾害沿依赖图传播影响、触发计划重排，跟踪服务中断与恢复。
import { buildGraph, downstreamClosure } from './graph.js';

// 一次灾害的完整影响：直接受灾节点、沿依赖图传播的间接受阻节点、
// 受影响服务与触发的计划重排。
export function disasterImpact(ctx, disasterId) {
  const disaster = (ctx.disasters ?? []).find((d) => d.id === disasterId);
  if (!disaster) throw new Error(`未知灾害：${disasterId}`);

  const graph = buildGraph(ctx);
  const direct = new Set(disaster.affected_nodes);
  const propagated = new Set();
  for (const id of direct) {
    for (const down of downstreamClosure(graph, id)) propagated.add(down);
  }
  for (const id of direct) propagated.delete(id);

  const sections = ctx.nodes.filter((n) => n.kind === 'section').map((n) => n.id);
  const affectedServices = (ctx.services ?? []).filter(
    (s) => (s.nodes ?? []).some((id) => direct.has(id) || propagated.has(id)),
  );

  return {
    disaster: { id: disaster.id, name: disaster.name, occurred: disaster.occurred },
    direct_nodes: [...direct],
    propagated_nodes: [...propagated],
    affected_sections: [...direct, ...propagated].filter((id) => sections.includes(id)),
    affected_services: affectedServices.map((s) => s.id),
    replans: (disaster.replans ?? []).map((r) => ({ ...r })),
  };
}

// 服务恢复台账：中断时长、是否赶在恢复目标前。
export function recoveryStatus(ctx, { asOf } = {}) {
  const now = asOf ? Date.parse(`${asOf}T00:00:00Z`) : Date.now();
  return (ctx.services ?? []).map((s) => {
    const suspended = s.suspended_at ? Date.parse(s.suspended_at) : null;
    const restored = s.restored_at ? Date.parse(s.restored_at) : null;
    const end = restored ?? now;
    const downtimeHours = suspended ? Math.round(((end - suspended) / 3_600_000) * 10) / 10 : null;
    const target = s.recovery_target ? Date.parse(`${s.recovery_target}T23:59:59Z`) : null;
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      suspended_at: s.suspended_at ?? null,
      restored_at: s.restored_at ?? null,
      downtime_hours: downtimeHours,
      recovery_target: s.recovery_target ?? null,
      met_target: restored != null && target != null ? restored <= target : null,
    };
  });
}
