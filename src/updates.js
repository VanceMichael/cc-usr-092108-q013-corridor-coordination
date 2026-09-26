// 多方协同：乐观并发更新、跨时区会议排序、敏感工程字段遮蔽。
import { nodeById, NODE_STATUS } from './ledger.js';

export class ConflictError extends Error {
  constructor(nodeId, expected, got) {
    super(`节点 ${nodeId} 更新冲突：基线版本 ${got} 已过期，当前版本 ${expected}，请重新读取后提交`);
    this.name = 'ConflictError';
    this.nodeId = nodeId;
    this.expected = expected;
    this.got = got;
  }
}

const PATCHABLE_FIELDS = ['status', 'attrs', 'name', 'owner', 'region', 'sensitivity'];

// 多方同时更新同一节点时，只有基于最新版本的提交被接受；
// 过期基线抛出 ConflictError，提交方需重新读取后再写。
export function applyNodeUpdate(ledger, nodeId, patch, { actor, baseRevision, at } = {}) {
  const node = nodeById(ledger, nodeId);
  if (node.revision !== baseRevision) {
    throw new ConflictError(nodeId, node.revision, baseRevision);
  }
  for (const key of Object.keys(patch ?? {})) {
    if (!PATCHABLE_FIELDS.includes(key)) {
      throw new Error(`字段 ${key} 不允许直接更新`);
    }
  }
  if (patch.status !== undefined && !NODE_STATUS.includes(patch.status)) {
    throw new Error(`状态非法：${patch.status}`);
  }
  if (patch.attrs) {
    node.attrs = { ...(node.attrs ?? {}), ...patch.attrs };
  }
  for (const key of ['status', 'name', 'owner', 'region', 'sensitivity']) {
    if (patch[key] !== undefined) {
      node[key] = patch[key];
    }
  }
  node.revision += 1;
  node.updated_by = actor ?? node.updated_by;
  node.updated_at = at ?? node.updated_at;
  return node;
}

// 跨时区会议按真实瞬时（UTC）排序，而不是各地时钟读数。
export function orderMeetings(ledger) {
  return [...ledger.meetings].sort(
    (a, b) => Date.parse(a.held_at) - Date.parse(b.held_at) || a.id.localeCompare(b.id)
  );
}

export const CLEARANCE_LEVELS = { public: 0, internal: 1, sensitive: 2 };

// 按许可级别遮蔽敏感工程字段；返回遮蔽后的台账副本与被遮蔽字段清单，原台账不变。
export function redactLedger(ledger, clearance = 'public') {
  if (!(clearance in CLEARANCE_LEVELS)) {
    throw new Error(`未知许可级别：${clearance}`);
  }
  const level = CLEARANCE_LEVELS[clearance];
  const copy = structuredClone(ledger);
  const masked = [];
  for (const node of copy.nodes) {
    for (const [path, sensitivity] of Object.entries(node.sensitivity ?? {})) {
      if (level >= CLEARANCE_LEVELS[sensitivity]) {
        continue;
      }
      const key = path.slice('attrs.'.length);
      if (node.attrs && key in node.attrs) {
        node.attrs[key] = '[已遮蔽]';
        masked.push(`${node.id}:${path}`);
      }
    }
  }
  return { ledger: copy, masked };
}
