import type { Referee } from "../model/tournament.ts";

export interface DirectoryRecord extends Referee {
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DirectoryMergeResult {
  records: DirectoryRecord[];
  changed: boolean;
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

function nameKey(raw: string): string {
  return normalizeName(raw).toLowerCase();
}

function timeValue(iso: string | undefined): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function visibleReferees(records: DirectoryRecord[]): Referee[] {
  return records.filter((r) => !r.deletedAt).map(({ id, name }) => ({ id, name }));
}

export function mergeDirectoryRecords(
  local: DirectoryRecord[],
  remote: DirectoryRecord[],
): DirectoryMergeResult {
  const byId = new Map<string, DirectoryRecord>();
  let changed = false;

  for (const row of local) byId.set(row.id, { ...row, deletedAt: row.deletedAt ?? null });

  for (const row of remote) {
    const next = { ...row, deletedAt: row.deletedAt ?? null };
    const prev = byId.get(next.id);
    if (!prev) {
      byId.set(next.id, next);
      changed = true;
      continue;
    }
    if (timeValue(next.updatedAt) > timeValue(prev.updatedAt)) {
      byId.set(next.id, next);
      changed = true;
    } else if (
      timeValue(next.updatedAt) < timeValue(prev.updatedAt) ||
      next.name !== prev.name ||
      (next.deletedAt ?? null) !== (prev.deletedAt ?? null)
    ) {
      changed = true;
    }
  }

  const merged = [...byId.values()];
  const nowIso = new Date().toISOString();
  const liveByName = new Map<string, DirectoryRecord>();
  for (const row of merged) {
    if (row.deletedAt) continue;
    const key = nameKey(row.name);
    const existing = liveByName.get(key);
    if (!existing) {
      liveByName.set(key, row);
      continue;
    }

    const currentTs = timeValue(row.updatedAt);
    const existingTs = timeValue(existing.updatedAt);
    const winner =
      currentTs > existingTs ||
      (currentTs === existingTs && row.id.localeCompare(existing.id) < 0)
        ? row
        : existing;
    const loser = winner === row ? existing : row;
    const deletedAt =
      timeValue(nowIso) > timeValue(winner.updatedAt) ? nowIso : winner.updatedAt;
    if (loser.deletedAt !== deletedAt || loser.updatedAt !== deletedAt) {
      loser.deletedAt = deletedAt;
      loser.updatedAt = deletedAt;
      changed = true;
    }
    liveByName.set(key, winner);
  }

  return {
    records: merged.sort((a, b) => a.id.localeCompare(b.id)),
    changed,
  };
}
