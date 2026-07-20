import type { Referee } from "../model/tournament.ts";

export interface DirectoryRecord extends Referee {
  updatedAt: string;
  deletedAt?: string | null;
}

export interface DirectoryMergeResult {
  records: DirectoryRecord[];
  changed: boolean;
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

  return {
    records: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)),
    changed,
  };
}
