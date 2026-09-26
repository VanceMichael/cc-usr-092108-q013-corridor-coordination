// 依赖图与节点状态语义。
// 边方向：from 为上游（前置条件），to 为下游（被阻塞方）。
// 即「下游 to 依赖上游 from」，上游未解决时下游受阻。

export const BLOCKER_CATEGORIES = {
  land: '用地',
  sea: '用海',
  energy: '用能',
  ecology: '生态要求',
  local_standard: '地方标准',
  national_standard: '国家标准',
  regulation: '法规要求',
  funding: '资金',
  precondition: '施工前置',
  facility: '算力数据设施',
  network: '配套网络',
  resilience: '韧性措施',
  section: '工程进度',
};

export function buildGraph(ctx) {
  const nodes = new Map(ctx.nodes.map((n) => [n.id, n]));
  const out = new Map(ctx.nodes.map((n) => [n.id, []]));
  const inn = new Map(ctx.nodes.map((n) => [n.id, []]));
  for (const e of ctx.edges) {
    out.get(e.from).push(e.to);
    inn.get(e.to).push(e.from);
  }
  return { nodes, out, inn };
}

// 上游闭包：id 直接/间接依赖的全部节点（不含 id 本身）。
export function upstreamClosure(graph, id) {
  return closure(graph.inn, id);
}

// 下游闭包：直接/间接被 id 阻塞的全部节点（不含 id 本身）。
export function downstreamClosure(graph, id) {
  return closure(graph.out, id);
}

// 区段自身的前置子图：向上游遍历但不穿越其他区段节点。
// 堵点分析可以跨区段追溯根因；但完成声明、清零率只认本段的直接前置要素。
export function sectionPrerequisites(graph, sectionId) {
  const seen = new Set();
  const queue = [...(graph.inn.get(sectionId) ?? [])];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    const node = graph.nodes.get(cur);
    if (node && node.kind === 'section') continue; // 其他区段不计入本段前置，也不穿越
    seen.add(cur);
    queue.push(...(graph.inn.get(cur) ?? []));
  }
  return seen;
}

function closure(adj, id) {
  const seen = new Set();
  const queue = [...(adj.get(id) ?? [])];
  while (queue.length) {
    const cur = queue.shift();
    if (seen.has(cur)) continue;
    seen.add(cur);
    queue.push(...(adj.get(cur) ?? []));
  }
  return seen;
}

// from 到 to 的全部简单路径（沿依赖方向），每条路径为节点 id 序列。
export function findPaths(graph, from, to, limit = 64) {
  const paths = [];
  const walk = (cur, trail, seen) => {
    if (paths.length >= limit) return;
    if (cur === to) {
      paths.push(trail);
      return;
    }
    for (const nxt of graph.out.get(cur) ?? []) {
      if (seen.has(nxt)) continue;
      seen.add(nxt);
      walk(nxt, [...trail, nxt], seen);
      seen.delete(nxt);
    }
  };
  walk(from, [from], new Set([from]));
  return paths;
}

// 生效状态：standard/regulation 节点在变更生效日后视为已换版（completed）。
export function effectiveStatus(ctx, node, asOf) {
  if (node.kind === 'standard' || node.kind === 'regulation') {
    const applied = (ctx.standard_changes ?? [])
      .filter((c) => c.node === node.id && c.effective <= asOf)
      .sort((a, b) => a.effective.localeCompare(b.effective));
    if (applied.length) return 'completed';
  }
  return node.status;
}

// 生效版本：已生效变更把 standard/regulation 推到 to_version。
export function effectiveVersion(ctx, node, asOf) {
  if (node.kind === 'standard' || node.kind === 'regulation') {
    const applied = (ctx.standard_changes ?? [])
      .filter((c) => c.node === node.id && c.effective <= asOf)
      .sort((a, b) => a.effective.localeCompare(b.effective));
    if (applied.length) return applied[applied.length - 1].to_version;
  }
  return node.version ?? null;
}

export function isResolved(status) {
  return status === 'completed';
}

// 节点的堵点类别：未解决时它卡在哪一类要素上。
export function blockerCategory(node) {
  switch (node.kind) {
    case 'permit':
      return { key: node.category, label: BLOCKER_CATEGORIES[node.category] };
    case 'standard':
      return node.scope === 'local'
        ? { key: 'local_standard', label: BLOCKER_CATEGORIES.local_standard }
        : { key: 'national_standard', label: BLOCKER_CATEGORIES.national_standard };
    case 'regulation':
      return { key: 'regulation', label: BLOCKER_CATEGORIES.regulation };
    case 'funding':
      return { key: 'funding', label: BLOCKER_CATEGORIES.funding };
    case 'precondition':
      return { key: 'precondition', label: BLOCKER_CATEGORIES.precondition };
    case 'facility':
      return { key: 'facility', label: BLOCKER_CATEGORIES.facility };
    case 'network':
      return { key: 'network', label: BLOCKER_CATEGORIES.network };
    case 'resilience':
      return { key: 'resilience', label: BLOCKER_CATEGORIES.resilience };
    default:
      return { key: 'section', label: BLOCKER_CATEGORIES.section };
  }
}
