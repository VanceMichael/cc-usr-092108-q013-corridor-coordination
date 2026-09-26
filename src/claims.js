// 完成声明：许可、工程、联调三类证据齐全才成立，且可逐条下钻。

export const EVIDENCE_KINDS = ['permit', 'engineering', 'joint-commissioning'];

export const EVIDENCE_KIND_LABELS = {
  permit: '许可证据',
  engineering: '工程证据',
  'joint-commissioning': '联调证据'
};

const EVIDENCE_REQUIRED_FIELDS = ['title', 'ref', 'issued_by', 'issued_at'];

function claimById(ledger, claimId) {
  const claim = ledger.claims.find((c) => c.id === claimId);
  if (!claim) {
    throw new Error(`完成声明不存在：${claimId}`);
  }
  return claim;
}

// 核验声明：三类证据是否齐全、每条证据要素是否完整。
export function verifyClaim(ledger, claimId) {
  const claim = claimById(ledger, claimId);
  const missingKinds = EVIDENCE_KINDS.filter((kind) => !claim.evidence.some((e) => e.kind === kind));
  const incompleteEvidence = claim.evidence
    .filter(
      (e) =>
        EVIDENCE_REQUIRED_FIELDS.some((field) => !e[field]) ||
        !Array.isArray(e.nodes) ||
        e.nodes.length === 0
    )
    .map((e) => e.id);
  return {
    claim: claimId,
    complete: missingKinds.length === 0 && incompleteEvidence.length === 0,
    missingKinds,
    incompleteEvidence
  };
}

// 下钻：声明 → 证据条目 → 关联节点，任何完成声明都能落到许可、工程与联调证据。
export function drillDown(ledger, claimId) {
  const claim = claimById(ledger, claimId);
  const nodes = new Map(ledger.nodes.map((n) => [n.id, n]));
  return {
    claim,
    node: nodes.get(claim.node),
    evidence: claim.evidence.map((e) => ({
      ...e,
      nodes: (e.nodes ?? []).map((id) => nodes.get(id))
    }))
  };
}
