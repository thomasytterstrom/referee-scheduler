// Persistent referee directory — pure, DOM-free logic over a Referee[] (docs/referee-directory-spec.md).
// Reuses the domain Referee (shared id, snapshot name); id generation is injected so this stays
// deterministic and testable. Names are unique by key (§2.1): trimmed, inner whitespace collapsed,
// case-insensitive; the stored display name keeps its first-entered casing.

import type { Referee } from "./tournament.ts";

/** Display form: trim, collapse inner whitespace runs to a single space. Casing untouched. */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Uniqueness key: display form, lower-cased. */
export function nameKey(raw: string): string {
  return normalizeName(raw).toLowerCase();
}

/** Find a directory entry whose name matches `raw` by uniqueness key. */
export function findByName(dir: Referee[], raw: string): Referee | undefined {
  const key = nameKey(raw);
  return dir.find((r) => nameKey(r.name) === key);
}

/**
 * Create the referee when its name-key is new, otherwise reuse the existing entry (no duplicate).
 * `mkId` is called only when a new entry is created.
 */
export function upsertNew(
  dir: Referee[],
  raw: string,
  mkId: () => string,
): { dir: Referee[]; ref: Referee; created: boolean } {
  const existing = findByName(dir, raw);
  if (existing) return { dir, ref: existing, created: false };
  const ref: Referee = { id: mkId(), name: normalizeName(raw) };
  return { dir: [...dir, ref], ref, created: true };
}

/**
 * Rename a directory entry, enforcing name uniqueness. A casing/spacing-only change to the same entry
 * is allowed. Returns `ok: false` with a reason (directory unchanged) on collision or unknown id.
 */
export function renameEntry(
  dir: Referee[],
  id: string,
  raw: string,
): { dir: Referee[]; ok: boolean; reason?: "duplicate" | "not-found" } {
  if (!dir.some((r) => r.id === id)) return { dir, ok: false, reason: "not-found" };
  const key = nameKey(raw);
  if (dir.some((r) => r.id !== id && nameKey(r.name) === key))
    return { dir, ok: false, reason: "duplicate" };
  const name = normalizeName(raw);
  return { dir: dir.map((r) => (r.id === id ? { ...r, name } : r)), ok: true };
}

/** Remove a directory entry by id (immutable). */
export function deleteEntry(dir: Referee[], id: string): Referee[] {
  return dir.filter((r) => r.id !== id);
}

/** Directory sorted by name, case-insensitively (immutable). */
export function sortByName(dir: Referee[]): Referee[] {
  return [...dir].sort((a, b) => nameKey(a.name).localeCompare(nameKey(b.name)));
}
