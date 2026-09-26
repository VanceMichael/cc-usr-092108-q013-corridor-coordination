// 依赖图：堵点计算与影响传播。
// 硬前置参与阻断判定；风险传播沿所有依赖边进行（软关联不阻断但会传导风险）。
import { ELEMENT_LABELS } from './ledger.js';

// 建立双向索引：prereqsOf（谁卡我）与 dependentsOf（我卡谁）。
export function buildGraph(ledger) {
  const prereqsOf = new Map();
  const dependentsOf = new Map();
  for (const edge of ledger.dependencies) {
    if (!prereqsOf.has(edge.to)) {
      prereqsOf.set(edge.to, []);
    }
    prereqsOf.get(edge.to).push({ edge, from: edge.from });
    if (!dependentsOf.has(edge.from)) {
      dependentsOf.set(edge.from, []);
    }
    dependentsOf.get(edge.from).push({ edge, to: edge.to });
  }
  return { prereqsOf, dependentsOf };
}

// 堵点：存在未满足硬前置的未满足节点即被卡住；
// 根因是本身未满足、且没有未满足硬前置的节点——真正卡住的资源要素。
export function computeBlockages(ledger) {
  const { prereqsOf } = buildGraph(ledger);
  const nodes = new Map(ledger.nodes.map((n) => [n.id, n]));
  const isUnsatisfied = (id) => nodes.get(id).status !== 'satisfied';

  const blockedIds = new Set();
  const directById = new Map();
  for (const node of ledger.nodes) {
    if (!isUnsatisfied(node.id)) {
      continue;
    }
    const direct = (prereqsOf.get(node.id) ?? [])
      .filter(({ edge, from }) => edge.hard && isUnsatisfied(from))
      .map(({ from }) => from);
    if (direct.length) {
      blockedIds.add(node.id);
      directById.set(node.id, direct);
    }
  }

  const rootsOf = (startId) => {
    const roots = new Set();
    const seen = new Set([startId]);
    const stack = [startId];
    while (stack.length) {
      const current = stack.pop();
      for (const { edge, from } of prereqsOf.get(current) ?? []) {
        if (!edge.hard || !isUnsatisfied(from)) {
          continue;
        }
        if (blockedIds.has(from)) {
          if (!seen.has(from)) {
            seen.add(from);
            stack.push(from);
          }
        } else {
          roots.add(from);
        }
      }
    }
    return [...roots].sort();
  };

  const blocked = new Map();
  const rootSet = new Set();
  for (const id of blockedIds) {
    const roots = rootsOf(id);
    for (const root of roots) {
      rootSet.add(root);
    }
    blocked.set(id, { direct: [...directById.get(id)].sort(), roots });
  }

  // 按资源要素归类根因，直接回答"卡住的是用地、用海、用能、生态、地方标准还是配套网络"。
  const byElement = new Map();
  for (const node of ledger.nodes) {
    if (!rootSet.has(node.id)) {
      continue;
    }
    if (!byElement.has(node.element)) {
      byElement.set(node.element, []);
    }
    byElement.get(node.element).push(node.id);
  }

  return { blocked, roots: [...rootSet].sort(), byElement };
}

// 面向月报的堵点视图：带上名称与要素中文标签。
export function blockageReport(ledger) {
  const { blocked, roots, byElement } = computeBlockages(ledger);
  const nodes = new Map(ledger.nodes.map((n) => [n.id, n]));
  const label = (id) => ELEMENT_LABELS[nodes.get(id).element];
  return {
    blocked: [...blocked.entries()].map(([id, value]) => ({
      node: id,
      name: nodes.get(id).name,
      direct: value.direct,
      roots: value.roots
    })),
    roots: roots.map((id) => ({ node: id, name: nodes.get(id).name, element: nodes.get(id).element, label: label(id) })),
    byElement: [...byElement.entries()].map(([element, ids]) => ({
      element,
      label: ELEMENT_LABELS[element],
      nodes: ids
    }))
  };
}

// 从任一节点出发沿依赖方向广度优先传播，返回受影响节点、最短深度与一条传播路径。
export function propagateFrom(ledger, sourceId) {
  const { dependentsOf } = buildGraph(ledger);
  const visited = new Set([sourceId]);
  const affected = [];
  const queue = [[sourceId, 0, [sourceId]]];
  while (queue.length) {
    const [id, depth, path] = queue.shift();
    for (const { to } of dependentsOf.get(id) ?? []) {
      if (visited.has(to)) {
        continue;
      }
      visited.add(to);
      const nextPath = [...path, to];
      affected.push({ node: to, depth: depth + 1, path: nextPath });
      queue.push([to, depth + 1, nextPath]);
    }
  }
  return affected;
}

// 法规或技术标准变化：以变更目标为源头自动传播，列出全部受影响节点。
export function propagateChange(ledger, changeId) {
  const change = ledger.changes.find((c) => c.id === changeId);
  if (!change) {
    throw new Error(`变更不存在：${changeId}`);
  }
  return { change, affected: propagateFrom(ledger, change.target) };
}
