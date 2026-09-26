// 协同：多方同时更新的冲突判定，跨时区会议的本地时间换算。

// 检测并发写冲突：同一节点同一字段、基于同一资料版本、取值不同的多次更新。
// 采用最后写入者胜出（时间相同则按参与者 id 字典序），并保留全部写入备查。
export function detectConflicts(ctx) {
  const groups = new Map();
  for (const e of ctx.events ?? []) {
    const key = `${e.node}${e.field}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  const conflicts = [];
  for (const [key, events] of groups) {
    const byBase = new Map();
    for (const e of events) {
      const base = e.base_version ?? 0;
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(e);
    }
    for (const [base, writes] of byBase) {
      const values = new Set(writes.map((w) => JSON.stringify(w.value)));
      if (writes.length > 1 && values.size > 1) {
        const ordered = [...writes].sort((a, b) =>
          a.at.localeCompare(b.at) || a.actor.localeCompare(b.actor));
        const winner = ordered[ordered.length - 1];
        conflicts.push({
          node: winner.node,
          field: winner.field,
          base_version: base,
          resolution: 'last_writer_wins',
          winner: { event: winner.id, actor: winner.actor, at: winner.at, value: winner.value },
          superseded_writes: ordered.slice(0, -1).map((w) => ({
            event: w.id, actor: w.actor, at: w.at, value: w.value,
          })),
        });
      }
    }
  }
  return conflicts.sort((a, b) => a.node.localeCompare(b.node) || a.field.localeCompare(b.field));
}

// 应用事件账本后的有效值：同节点同字段按时间取最后写入。
export function effectiveField(ctx, nodeId, field) {
  const writes = (ctx.events ?? [])
    .filter((e) => e.node === nodeId && e.field === field)
    .sort((a, b) => a.at.localeCompare(b.at) || a.actor.localeCompare(b.actor));
  return writes.length ? writes[writes.length - 1].value : undefined;
}

// 跨时区会议：把 UTC 时刻换算成每位参会人的本地时间。
export function meetingLocalTimes(ctx, meetingId) {
  const meeting = (ctx.meetings ?? []).find((m) => m.id === meetingId);
  if (!meeting) throw new Error(`未知会议：${meetingId}`);
  const actors = new Map((ctx.actors ?? []).map((a) => [a.id, a]));

  const attendees = meeting.attendees.map((id) => {
    const actor = actors.get(id);
    const parts = new Intl.DateTimeFormat('zh-CN', {
      timeZone: actor.timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZoneName: 'short',
    }).formatToParts(new Date(meeting.held_at));
    const get = (type) => parts.find((p) => p.type === type)?.value;
    return {
      actor: id,
      name: actor.name,
      timezone: actor.timezone,
      local_time: `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} ${get('timeZoneName')}`,
    };
  });

  return {
    meeting: meetingId,
    utc: meeting.held_at,
    attendees,
    decisions: meeting.decisions,
  };
}
