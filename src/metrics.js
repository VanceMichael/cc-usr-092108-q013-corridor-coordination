// 可计算指标：堵点清零率、承诺可信度、有据完工率、标准法规符合率、
// 服务可用率，加权合成综合效能——替代模糊百分比。
import { buildGraph, sectionPrerequisites, effectiveStatus, isResolved } from './graph.js';
import { analyzeCommitments } from './commitments.js';
import { evaluateClaim } from './evidence.js';
import { recoveryStatus } from './disaster.js';

export const EFFECTIVENESS_WEIGHTS = {
  clearance: 0.3,
  commitment: 0.2,
  verified_completion: 0.2,
  compliance: 0.15,
  service: 0.15,
};

// 依赖清零率：每个区段自身前置（许可/标准/资金/前置/设施/网络/韧性）的完成占比。
// 只数本段前置子图，不把其他区段及其要素重复计入。
export function clearanceRate(ctx, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const graph = buildGraph(ctx);
  const perSection = {};
  let done = 0;
  let total = 0;
  for (const section of ctx.nodes.filter((n) => n.kind === 'section')) {
    const prereqs = [...sectionPrerequisites(graph, section.id)].map((id) => graph.nodes.get(id));
    const resolved = prereqs.filter((n) => isResolved(effectiveStatus(ctx, n, date)));
    perSection[section.id] = {
      total: prereqs.length,
      done: resolved.length,
      rate: prereqs.length ? resolved.length / prereqs.length : 1,
    };
    done += resolved.length;
    total += prereqs.length;
  }
  return { per_section: perSection, overall: total ? done / total : 1 };
}

// 承诺可信度：有效承诺中 兑现=1、在途=0.5、逾期/违约=0；四要素缺失的承诺不计入但单列。
export function commitmentReliability(ctx, opts = {}) {
  const analyzed = analyzeCommitments(ctx, opts);
  const valid = analyzed.filter((c) => c.valid);
  const invalid = analyzed.filter((c) => !c.valid);
  const scoreOf = (c) => {
    if (c.status === 'fulfilled') return 1;
    if (c.status === 'breached' || c.effective_status === 'overdue') return 0;
    if (c.status === 'withdrawn') return null; // 撤回不计
    return 0.5;
  };
  const scored = valid.map((c) => ({ id: c.id, score: scoreOf(c) })).filter((c) => c.score !== null);
  const score = scored.length ? scored.reduce((s, c) => s + c.score, 0) / scored.length : 1;
  return {
    score,
    valid_count: valid.length,
    invalid_count: invalid.length,
    invalid_ids: invalid.map((c) => c.id),
    detail: scored,
  };
}

// 有据完工率：声明 completed 且证据链完整的区段占比。
export function verifiedCompletion(ctx, opts = {}) {
  const sections = ctx.nodes.filter((n) => n.kind === 'section');
  const claims = sections.map((s) => evaluateClaim(ctx, s.id, opts));
  const supported = claims.filter((c) => c.supported).map((c) => c.node);
  const unsupported = claims.filter((c) => !c.supported).map((c) => c.node);
  return {
    rate: sections.length ? supported.length / sections.length : 1,
    supported,
    unsupported,
  };
}

// 标准法规符合率：standard/regulation 节点中已符合现行版本（含已生效换版）的占比。
export function complianceRate(ctx, { asOf } = {}) {
  const date = asOf ?? '9999-12-31';
  const targets = ctx.nodes.filter((n) => n.kind === 'standard' || n.kind === 'regulation');
  const conformed = targets.filter((n) => isResolved(effectiveStatus(ctx, n, date)));
  return {
    rate: targets.length ? conformed.length / targets.length : 1,
    conformed: conformed.map((n) => n.id),
    pending: targets.filter((n) => !conformed.includes(n)).map((n) => n.id),
  };
}

// 服务可用率：处于 operational/restored 的服务占比。
export function serviceAvailability(ctx, opts = {}) {
  const services = recoveryStatus(ctx, opts);
  const up = services.filter((s) => s.status === 'operational' || s.status === 'restored');
  return {
    rate: services.length ? up.length / services.length : 1,
    up: up.map((s) => s.id),
    down: services.filter((s) => !up.includes(s)).map((s) => s.id),
  };
}

// 综合效能：五项分量的加权和，分量与权重全部公开可下钻。
export function effectiveness(ctx, opts = {}) {
  const components = {
    clearance: clearanceRate(ctx, opts).overall,
    commitment: commitmentReliability(ctx, opts).score,
    verified_completion: verifiedCompletion(ctx, opts).rate,
    compliance: complianceRate(ctx, opts).rate,
    service: serviceAvailability(ctx, opts).rate,
  };
  const score = Object.entries(EFFECTIVENESS_WEIGHTS)
    .reduce((sum, [key, w]) => sum + w * components[key], 0);
  return {
    score: Math.round(score * 1000) / 1000,
    weights: { ...EFFECTIVENESS_WEIGHTS },
    components,
  };
}
