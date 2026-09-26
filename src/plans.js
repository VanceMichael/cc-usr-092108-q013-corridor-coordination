// 计划谱系：延期、替代路线、争议裁决、灾害重排都会替换计划，
// 被替换方案必须保留并可追溯替换原因。

export const SUPERSEDE_REASON_LABELS = {
  delay: '延期',
  alternative_route: '替代路线',
  dispute_ruling: '争议裁决',
  disaster: '灾害重排',
};

// 某节点的完整计划谱系：版本链 + 每次替换的原因/延期/裁决。
export function planLineage(ctx, nodeId) {
  const plans = (ctx.plans ?? [])
    .filter((p) => p.node === nodeId)
    .sort((a, b) => a.version - b.version);
  if (!plans.length) throw new Error(`节点 ${nodeId} 没有任何计划`);

  const delays = (ctx.delays ?? []).filter((d) => d.node === nodeId);
  const rulings = (ctx.rulings ?? []).filter(
    (r) => plans.some((p) => (r.superseded_plans ?? []).includes(p.id)) ||
      plans.some((p) => p.id === r.adopted_plan),
  );

  const chain = plans.map((p) => ({
    ...p,
    supersede_reason_label: p.supersede_reason ? SUPERSEDE_REASON_LABELS[p.supersede_reason] : null,
    delays: delays.filter((d) => d.plan === p.id).map((d) => d.id),
    ruling: rulings.find((r) => (r.superseded_plans ?? []).includes(p.id))?.id ?? null,
  }));

  return {
    node: nodeId,
    active_plan: plans.find((p) => p.status === 'active')?.id ?? null,
    chain,
    // 被替换方案完整保留，不随替换丢弃。
    superseded: chain.filter((p) => p.status === 'superseded'),
    delays,
    rulings,
  };
}

// 全库被替换方案清单（审计入口）。
export function supersededPlans(ctx) {
  return (ctx.plans ?? []).filter((p) => p.status === 'superseded');
}
