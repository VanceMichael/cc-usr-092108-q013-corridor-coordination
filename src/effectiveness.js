// 综合效能：全部指标可复算，替代模糊的进度百分比。
import { computeBlockages } from './graph.js';
import { validCommitments, invalidCommitments, isCommitmentOverdue } from './ledger.js';
import { verifyClaim } from './claims.js';

const round4 = (x) => Math.round(x * 10000) / 10000;

// 综合效能 =（节点满足率 + 承诺兑现率 + 证据完备率）/ 3，三个分量均可独立复算。
// 逾期判定需要显式传入基准日 now（YYYY-MM-DD）。
export function computeEffectiveness(ledger, { now } = {}) {
  const total = ledger.nodes.length;
  const satisfied = ledger.nodes.filter((n) => n.status === 'satisfied').length;
  const satisfactionRate = total ? satisfied / total : 0;

  const { blocked, roots, byElement } = computeBlockages(ledger);

  const valid = validCommitments(ledger);
  const fulfilled = valid.filter((c) => c.status === 'fulfilled');
  const overdue = now ? valid.filter((c) => isCommitmentOverdue(c, now)) : [];
  const fulfillmentRate = valid.length ? fulfilled.length / valid.length : 1;

  const claimResults = ledger.claims.map((c) => verifyClaim(ledger, c.id));
  const evidenceComplete = claimResults.filter((r) => r.complete).length;
  const evidenceRate = claimResults.length ? evidenceComplete / claimResults.length : 1;

  return {
    nodes: { total, satisfied, satisfactionRate: round4(satisfactionRate) },
    blockage: {
      blockedCount: blocked.size,
      rootCount: roots.length,
      byElement: Object.fromEntries([...byElement.entries()].map(([element, ids]) => [element, ids.length]))
    },
    commitments: {
      valid: valid.length,
      invalid: invalidCommitments(ledger).length,
      fulfilled: fulfilled.length,
      overdue: overdue.length,
      fulfillmentRate: round4(fulfillmentRate)
    },
    claims: {
      total: claimResults.length,
      evidenceComplete,
      evidenceRate: round4(evidenceRate)
    },
    composite: round4((satisfactionRate + fulfillmentRate + evidenceRate) / 3)
  };
}
