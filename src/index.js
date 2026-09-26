// 管理者视图：一份资料 → 可计算的堵点、风险传播与综合效能。
export { parseContext } from './context.js';
export {
  buildGraph, upstreamClosure, downstreamClosure, findPaths,
  effectiveStatus, effectiveVersion, blockerCategory, BLOCKER_CATEGORIES,
} from './graph.js';
export { analyzeBlockers, interpretMonthlyReport } from './blockers.js';
export { analyzeCommitments, commitmentAlerts, COMMITMENT_REQUIRED_FIELDS } from './commitments.js';
export { propagateChange, propagateAll } from './propagation.js';
export { planLineage, supersededPlans, SUPERSEDE_REASON_LABELS } from './plans.js';
export { evaluateClaim, auditClaims, EVIDENCE_KIND_LABELS } from './evidence.js';
export { detectConflicts, effectiveField, meetingLocalTimes } from './collaboration.js';
export { disasterImpact, recoveryStatus } from './disaster.js';
export { redactContext, findLeakedSensitiveFields, REDACTED } from './sensitivity.js';
export { rollupRegion, rollupCorridor } from './rollup.js';
export {
  clearanceRate, commitmentReliability, verifiedCompletion,
  complianceRate, serviceAvailability, effectiveness, EFFECTIVENESS_WEIGHTS,
} from './metrics.js';

import { analyzeBlockers } from './blockers.js';
import { analyzeCommitments } from './commitments.js';
import { propagateAll } from './propagation.js';
import { evaluateClaim } from './evidence.js';
import { recoveryStatus } from './disaster.js';
import { effectiveness } from './metrics.js';

// 默认评估基准日：样例资料的「今天」。
export const DEFAULT_ASOF = '2026-09-26';

// 一键汇总：每个区段的堵点根因、承诺健康度、变更传播、服务恢复与综合效能。
export function summarize(ctx, { asOf = DEFAULT_ASOF } = {}) {
  const sections = ctx.nodes
    .filter((n) => n.kind === 'section')
    .map((n) => {
      const blockers = analyzeBlockers(ctx, n.id, { asOf });
      const claim = evaluateClaim(ctx, n.id, { asOf });
      return {
        id: n.id,
        name: n.name,
        status: n.status,
        blocked: blockers.blocked,
        root_causes: blockers.root_causes,
        claim_supported: claim.supported,
      };
    });

  const commitments = analyzeCommitments(ctx, { asOf });

  return {
    as_of: asOf,
    sections,
    commitments: {
      total: commitments.length,
      valid: commitments.filter((c) => c.valid).length,
      invalid: commitments.filter((c) => !c.valid).map((c) => c.id),
      overdue: commitments.filter((c) => c.overdue).map((c) => c.id),
    },
    changes: propagateAll(ctx, { asOf }).map((p) => ({
      change: p.change.id,
      source: p.source.id,
      impacted_sections: p.impacted_sections,
    })),
    services: recoveryStatus(ctx, { asOf }),
    effectiveness: effectiveness(ctx, { asOf }),
  };
}
