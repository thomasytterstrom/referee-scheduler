# 13 — Persistent referee directory

**Type:** feature · **Status:** in progress · **Spec:** [referee-directory-spec.md](../referee-directory-spec.md)

## Problem

Referee names live only inside a single tournament. Running a new event means re-typing the whole
roster. Referees should **persist across tournaments** so a name can be reused: add an **existing**
referee or a **new** one in Setup.

## Decisions (from grilling)

1. **Shared id, snapshot name** — directory entry `{ id, name }`; adding copies both; `id` shared,
   `name` snapshotted. Directory excluded from tournament JSON export; carryover stays per-tournament.
2. **Auto-upsert on add** — adding a referee writes it to the directory; removing from a tournament
   never deletes the directory entry.
3. **Unique names** — one name = one person; typing an existing name reuses its entry.
4. **Matching** — trim + collapse inner whitespace + case-insensitive; display keeps first casing.
5. **Curation** — Referees-library screen: rename (uniqueness-checked) + delete; no propagation;
   snapshots survive; affects future adds only.
6. **JSON import** — prompt "add these N referees to your library?" *(spec'd, not wired this slice)*.
7. **Scope** — integrate into the existing app (the wave 2–5 build already shipped model/persistence/UI).
8. **Roster** — directory persisted (new `referees` store, db.ts v2); roster is the real
   `Tournament.referees` via the existing Setup step. *(Supersedes the original "in-memory demo" answer,
   which assumed a scaffold-only repo.)*

## Acceptance

- Pure core (`model/directory.ts`) unit-tested: normalize, name-key matching, unique upsert,
  uniqueness-checked rename (incl. casing-only rename allowed, cross-entry collision rejected),
  delete, sort. Roster dedup-by-id lives in the store.
- Directory persists in IndexedDB store `referees` (keyed by `id`); survives reload.
- Setup picker: add existing (reuse) / add new (create + upsert); remove from roster leaves directory
  intact.
- Library screen: list (sorted), rename with collision message, delete with confirm.
- `npm test`, `tsc --noEmit`, `npm run build` all green.

## Out of scope (this slice)

Tournament persistence, JSON import wiring, full wizard/grid/solver UI.
