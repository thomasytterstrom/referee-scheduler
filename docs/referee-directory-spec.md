# Persistent Referee Directory — Web Referee Scheduler

Resolves ticket [13 — Persistent referee directory](issues/13-referee-directory.md). Extends the
[domain model](domain-model.md) (Referee `{id, name}`) and [persistence spec](persistence-spec.md)
(adds a second, app-level IndexedDB store beside `tournaments`).

Status: **settled**.

---

## 0. Goal

Referee names persist **across tournaments** so a roster is reusable: in Setup you add an **existing**
referee (from the directory) or a **new** one. The directory is app-level state, independent of any
single tournament.

---

## 1. Identity — shared id, snapshot name

- A **directory entry** is `{ id, name }` — the same `Referee` shape as the domain model.
- Adding a directory referee to a tournament **copies `{ id, name }`** into that tournament's roster.
  - `id` is **shared** — the same person carries the same id into every tournament they're added to.
  - `name` is a **snapshot** taken at add-time. Later renames (in the directory or in another
    tournament) do **not** propagate to a tournament that already holds the copy.
- Carryover stays **per-tournament** (unchanged): a shared id never links carryover across
  tournaments — `carry.ts` only sums a tournament's own finalized days.
- The directory is **excluded** from a tournament's JSON export (§3 of persistence-spec). It is
  separate, local, app-level data.

## 2. Uniqueness — one name = one person

Directory names are **unique**. Typing an existing name in Setup **reuses** that entry (add-existing);
a name not present is created (add-new). Two real people cannot share a name in the directory — an
accepted trade for a simple picker.

### 2.1 Name matching

The uniqueness key is the name **trimmed, inner whitespace collapsed to single spaces, and
lower-cased** (locale-insensitive `toLowerCase`). So `"anna "`, `"Anna"`, `"ANNA"`, `"An na"` vs
`"An  na"` collapse where they should. The **stored display name** keeps the casing and spacing as
first entered (trim + collapse only, no case change).

## 3. Write path — auto-upsert on add

- Adding a referee to a tournament **upserts** it into the directory (create if the name-key is new;
  otherwise reuse the existing entry — no duplicate).
- **Removing** a referee from a tournament's roster **never** deletes the directory entry.

## 4. Curation — the Referees library screen

A dedicated screen lists every directory entry (sorted by name, case-insensitive) with:

- **Rename** — re-checked for uniqueness. A rename whose new key collides with a **different** entry
  is rejected with a message. A rename that only changes casing/spacing of the same entry is allowed
  (updates the display name).
- **Delete** — removes **only** the directory entry. Tournaments that already added that referee keep
  their snapshot `{ id, name }` copy, so past events never break. Confirm before delete.
- Neither rename nor delete propagates to existing tournaments (snapshot rule); they affect **future
  adds** only.

## 5. JSON import seeding (spec'd; not wired in the first slice)

When a tournament is imported via JSON, prompt **"add these N referees to your library?"**. On yes,
upsert its referees by the §2.1 name-key (existing names reuse; new names added). A name may already
exist under a **different** id than the imported snapshot — harmless: ids need only be stable *within*
a tournament, and the directory id is used only for future adds.

> Not built in the first slice — there is no tournament JSON import yet. Captured here so the import
> path implements it when it lands.

## 6. Persistence

- IndexedDB object store **`referees`**, keyed by `id`, value = `{ id, name }`, added to the existing
  `SchedulerDB` in `persistence/db.ts` (**version 1 → 2**; the guarded `createObjectStore` is
  idempotent for fresh and existing databases). Adding it never touches `tournaments` / `meta` records.
- The directory is loaded on launch by `DirectoryProvider` and held in app state; every mutation writes
  through (`putReferee` / `deleteReferee`) to IndexedDB.

## 7. Scope — integrates into the existing app

The wave 2–5 build already shipped the full app (Tournament model, persistence, wizard, Setup step),
so this feature **integrates**; it does not stand up new scaffolding:

- **Directory** (new): persisted `referees` store + pure core + `DirectoryProvider`.
- **Roster**: the real, already-persisted `Tournament.referees` — the existing Setup step's add field
  becomes the directory-aware picker (add existing/new). No in-memory demo roster.
- **Library manager**: rendered under the tournament picker (the app-level home), since the directory
  is shared across tournaments.

> Supersedes the original grilling answers Q7 ("build end-to-end from scratch") and Q8 ("in-memory demo
> roster"), which assumed a scaffold-only repo. The design decisions in §1–§5 are unchanged.

## 8. Module layout

| Module | Responsibility | Tested |
|---|---|---|
| `src/model/directory.ts` | **pure** logic over `Referee[]`: `normalizeName`, `nameKey`, `findByName`, `upsertNew`, `renameEntry`, `deleteEntry`, `sortByName` — DOM-free, id generator injected; reuses the model `Referee` | Vitest (TDD) |
| `src/persistence/db.ts` | adds the `referees` store (v2) + `loadDirectory` / `putReferee` / `deleteReferee` | — (browser idb) |
| `src/ui/state/directory.tsx` | `DirectoryProvider` / `useDirectory`: load, `addByName`, `rename`, `remove` (write-through) | — |
| `src/ui/wizard/SetupStep.tsx` | add field → directory-aware picker (datalist of existing; create-or-reuse on add) | — (visual) |
| `src/ui/picker/RefereeLibrary.tsx` | library manager under the picker: list · rename · delete | — (visual) |
| `src/ui/state/store.tsx` | `addReferee(ref)` adds a directory snapshot to the roster (dedup by id) | — |
| `src/App.tsx` | wraps the app in `DirectoryProvider` | — |

Pure logic is isolated in `model/directory.ts` (id generator injected) so uniqueness, matching, and
merge are unit-tested without a DOM or a real IndexedDB. Roster dedup-by-id lives in the store.
