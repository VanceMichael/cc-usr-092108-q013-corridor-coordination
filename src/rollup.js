// 区域汇总：只引用、不改写、不合并区段原始结论。
import { computeBlockages } from './graph.js';
import { commitmentValidity, isCommitmentOverdue, ELEMENT_LABELS } from './ledger.js';

// 按区域汇总节点状态、堵点根因、原始结论与承诺情况。
// 结论以深拷贝引用，矛盾结论并列保留；汇总结果不含任何改写后的结论。
export function rollupByRegion(ledger, { now } = {}) {
  const { blocked } = computeBlockages(ledger);
  const nodes = new Map(ledger.nodes.map((n) => [n.id, n]));
  const regions = new Map();

  const ensure = (region) => {
    if (!regions.has(region)) {
      regions.set(region, {
        region,
        nodes: { total: 0, byStatus: {} },
        blocked: [],
        rootCauses: new Map(),
        conclusions: [],
        commitments: { valid: 0, invalid: 0, fulfilled: 0, overdue: 0 }
      });
    }
    return regions.get(region);
  };

  for (const node of ledger.nodes) {
    const entry = ensure(node.region);
    entry.nodes.total += 1;
    entry.nodes.byStatus[node.status] = (entry.nodes.byStatus[node.status] ?? 0) + 1;
  }

  for (const [id, value] of blocked) {
    const entry = ensure(nodes.get(id).region);
    entry.blocked.push(id);
    for (const rootId of value.roots) {
      if (!entry.rootCauses.has(rootId)) {
        const root = nodes.get(rootId);
        entry.rootCauses.set(rootId, {
          node: rootId,
          name: root.name,
          element: root.element,
          label: ELEMENT_LABELS[root.element],
          region: root.region
        });
      }
    }
  }

  for (const conclusion of ledger.conclusions) {
    ensure(conclusion.region).conclusions.push(structuredClone(conclusion));
  }

  for (const commitment of ledger.commitments) {
    const validity = commitmentValidity(commitment);
    const targetRegions = new Set(
      (commitment.affected_nodes ?? [])
        .map((id) => nodes.get(id))
        .filter(Boolean)
        .map((node) => node.region)
    );
    // 无效承诺若缺受影响节点则无法归属区域，这本身即是数据质量问题。
    for (const region of targetRegions) {
      const entry = ensure(region);
      if (!validity.valid) {
        entry.commitments.invalid += 1;
        continue;
      }
      entry.commitments.valid += 1;
      if (commitment.status === 'fulfilled') {
        entry.commitments.fulfilled += 1;
      } else if (now && isCommitmentOverdue(commitment, now)) {
        entry.commitments.overdue += 1;
      }
    }
  }

  for (const entry of regions.values()) {
    entry.rootCauses = [...entry.rootCauses.values()];
  }
  return regions;
}
