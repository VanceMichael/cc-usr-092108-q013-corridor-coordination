// 敏感工程字段：按视图权限脱敏，未授权视图拿到的是占位符而非真实数据。

export const REDACTED = '[已脱敏]';

// 返回按权限处理后的资料副本，不改动原对象。
// clearance='full' 原样返回；其他一律脱敏 sensitive_fields 列出的字段。
export function redactContext(ctx, { clearance = 'restricted' } = {}) {
  const copy = structuredClone(ctx);
  if (clearance === 'full') return copy;
  for (const node of copy.nodes ?? []) {
    for (const field of node.sensitive_fields ?? []) {
      if (field in node) node[field] = REDACTED;
    }
  }
  return copy;
}

// 检查某视图下是否还有敏感字段泄漏（用于测试与审计）。
export function findLeakedSensitiveFields(ctx, { clearance = 'restricted' } = {}) {
  const view = redactContext(ctx, { clearance });
  const leaked = [];
  for (const node of view.nodes ?? []) {
    for (const field of node.sensitive_fields ?? []) {
      if (field in node && node[field] !== REDACTED) leaked.push({ node: node.id, field });
    }
  }
  return leaked;
}
