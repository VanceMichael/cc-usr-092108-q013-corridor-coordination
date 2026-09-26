// 区域汇总：给出区域/通道级结论的同时，逐条保留区段级原始结论，不得抹去。
import { analyzeBlockers } from './blockers.js';
import { evaluateClaim } from './evidence.js';
import { analyzeCommitments } from './commitments.js';

function sectionConclusion(ctx, section, asOf) {
  const blockers = analyzeBlockers(ctx, section.id, { asOf });
  const claim = evaluateClaim(ctx, section.id, { asOf });
  const roots = blockers.root_causes.map((r) => r.category);
  let text;
  if (section.status === 'completed' && claim.supported) {
    text = `${section.name}：已完工，证据齐全`;
  } else if (section.status === 'completed') {
    text = `${section.name}：声明完工但证据不足（缺 ${claim.missing.length} 项）`;
  } else if (blockers.blocked) {
    text = `${section.name}：受阻，根因 ${roots.length} 项（${roots.join('、')}）`;
  } else {
    text = `${section.name}：推进中，无未解决上游`;
  }
  return {
    node: section.id,
    name: section.name,
    status: section.status,
    blocked: blockers.blocked,
    root_causes: blockers.root_causes,
    claim_supported: claim.supported,
    conclusion: text,
  };
}

// 区域汇总：composite 由区段状态推导，conclusions 保留每条原始结论。
export function rollupRegion(ctx, regionId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const region = (ctx.regions ?? []).find((r) => r.id === regionId);
  if (!region) throw new Error(`未知区域：${regionId}`);

  const sections = ctx.nodes.filter((n) => n.kind === 'section' && n.region === regionId);
  const conclusions = sections.map((s) => sectionConclusion(ctx, s, date));

  const composite = conclusions.some((c) => c.blocked)
    ? 'blocked'
    : conclusions.length > 0 && conclusions.every((c) => c.status === 'completed')
      ? 'completed'
      : 'in_progress';

  const unitIds = new Set(ctx.units.filter((u) => u.region === regionId).map((u) => u.id));
  const commitments = analyzeCommitments(ctx, { asOf: date })
    .filter((c) => unitIds.has(c.unit))
    .map((c) => ({ id: c.id, effective_status: c.effective_status, valid: c.valid, overdue: c.overdue }));

  return {
    region: regionId,
    name: region.name,
    composite_status: composite,
    // 原始结论逐条保留，汇总不得抹去。
    conclusions,
    commitments,
  };
}

// 通道汇总：各区域汇总的并集，同样保留全部原始结论。
export function rollupCorridor(ctx, corridorId, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const corridor = (ctx.corridors ?? []).find((c) => c.id === corridorId);
  if (!corridor) throw new Error(`未知通道：${corridorId}`);

  const regions = corridor.regions.map((r) => rollupRegion(ctx, r, { asOf: date }));
  const conclusions = regions.flatMap((r) => r.conclusions);
  const composite = conclusions.some((c) => c.blocked)
    ? 'blocked'
    : conclusions.length > 0 && conclusions.every((c) => c.status === 'completed')
      ? 'completed'
      : 'in_progress';

  return {
    corridor: corridorId,
    name: corridor.name,
    composite_status: composite,
    regions,
    conclusions,
  };
}
