# Persistence & Import/Export — Web Referee Scheduler

Resolves ticket [06 — Persistence & import/export format](issues/06-persistence-import-export.md).
Builds on the [domain model](domain-model.md) (all state is plain serializable data keyed by
stable ids; carryover recomputed, not persisted). Prior art: the Excel `Input` sheet and
`src/vba/mod_Input.bas` (header normalization, `ParseDayKey`, gender-from-competition).

Reference import artifact: a real two-day federation export lives at
[reference/federation-export-sample.tsv](reference/federation-export-sample.tsv) (group stage +
knockout bracket, three courts, Saturday+Sunday).

Status: **settled**.

---

## 0. One canonical shape

There is a single serializable `Tournament` object graph, reused verbatim across all three forms:

- **In-memory** — the `Tournament` object the UI and Web Worker operate on.
- **IndexedDB** — one record per tournament; value = that object (plus a small key/index envelope).
- **JSON export** — that object wrapped in a thin versioned envelope.

One `serialize` / `deserialize` pair, one migration path. No normalized/split storage, no per-form
schema. Carryover is **never** stored — recomputed live from finalized days on load (per the domain
model). UI-transient state (current wizard step, selection, solve-progress) is never persisted.

---

## 1. Import — fixtures only

An import builds **Courts, Days, Rounds, Matches**. It never carries referees — the referee roster
is entered separately (manual Setup step; an optional one-name-per-line paste is a separate,
trivial parser, out of scope for this spec). Federation exports are match lists and contain no
referee column.

### 1.1 Ingest formats

Accept, through one detector:

1. **`.xlsx` upload** — the real download, parsed client-side (SheetJS / `xlsx`). Primary path.
2. **Pasted text** — tab- or comma-delimited, from a spreadsheet copy.
3. **`.csv` / `.tsv` upload** — free once SheetJS is in.

Client-side only; no backend, no special hosting headers. MVP ships `.xlsx` + paste first;
csv/tsv file-drop follows for free.

### 1.2 Column mapping (Swedish federation headers)

| Source column | Maps to | Notes |
|---|---|---|
| `Datum` | Day | "Sat 2026-07-18" → day key `2026-07-18` (reuse `ParseDayKey`: extract `YYYY-MM-DD`) |
| `Starttid` | Round (via §1.3) + `Match.startTime` (display) | e.g. `09:00` |
| `Spelplats` | Court `name` (verbatim) | "Plan CC", "Plan SC1", … — do **not** strip "Plan " |
| `Klass` | `Match.gender` | `H` → M, `D` → W; any other value → row error |
| `Hemmalag` / `Bortalag` | `Match.homeTeam` / `awayTeam` | display only; may be blank/placeholder ("Winner match 1", "Segrare 17") |
| `Matchnamn` | `Match` label + `highlight` | non-empty → store label, set `highlight = true` (§1.5) |
| `Kamp nr` | `Match.matchNo` | display number (1..N) |
| `Kamp Id` | `Match` external key | stable merge key (§1.4) |
| `Arena`, `Grupp`, `Round`, `Omgångar`, `Tid per omgång` | — | ignored |

**Required columns:** `Datum`, `Starttid`, `Spelplats`, `Klass`. Missing any → hard error naming the
column (like `ReqHeader`). `Kamp Id` strongly preferred; if absent, fall back to the composite key
`(day, Starttid, Spelplats)` and warn. Unknown headers are ignored, never fatal. Header matching
normalizes whitespace/NBSP as `mod_Input.NormHeader` does.

### 1.3 Round derivation (the key rule)

The federation `Round` column is **not** the solver round — it holds bracket-stage codes
(`1`, `2` group; `800` R16 "Åttondel", `400` "Kvart", `200` "Semi", `100` "Final"). Ignore it for
solver logic.

The solver round is the **time slot** where each court hosts at most one match:

1. Per day, collect the distinct `Starttid` values.
2. Sort ascending; assign round index `1..R`.
3. Each match's round = rank of its `Starttid`.

**Exact-string bucketing, no fuzzy tolerance** — all observed exports align on the hour. A court
with no match at a given round is an idle cell (sparse grid, per domain model). Example: the
reference file's Saturday → rounds {09:00…17:00}; SC courts idle in later (finals) rounds.

### 1.4 Re-import — merge, never silently discard

Import is fast-fill over the existing model (manual or previously imported). Reconcile per match,
keyed on `Kamp Id` (composite `(day, Starttid, Spelplats)` when `Kamp Id` blank):

- **Same key exists** → update mutable fields (teams, `Matchnamn`, gender). If placement
  (day/round/court) is unchanged, keep Head/Assistant assignments and pins as-is.
- **Placement moved** for an existing match → update placement but **flag** the match (its
  assignment may now break a constraint); do not drop the referee.
- **New key** → add as an unassigned match.
- **Key vanished** from the new file → mark removed and **warn**; never auto-delete an assigned
  match without surfacing it.
- **Manually-added matches** (no `Kamp Id`) are keyed by `(day, round, court)` and left untouched by
  import.

Rationale: over a live two-day event the federation re-exports repeatedly (bracket teams resolve,
times shift, Sunday knockout firms up). Assignments and pins must survive re-import.

### 1.5 Assistant requirement & highlight

- `requiresAssistant` defaults to **true** for every imported match (the Excel tool always assigns
  Head + Assistant on CC). No column in the export sets it.
  - Bulk editors let the user flip a whole **round** or a whole **court** to head-only
    (writes `requiresAssistant = false` down to each affected match).
  - Per-match override on the grid for exceptions.
  - Domain model stays per-match (source of truth); bulk controls are just editors.
- `highlight` = true when `Matchnamn` is non-empty (knockout/finals). Display-only; no solver effect.
  User can toggle manually. No dedicated "finals" concept (per standing decision — finals are
  handled by generic pinning).

### 1.6 Court selection (per day)

Every distinct `Spelplats` becomes a Court in the tournament roster. Which courts actually get
referees is chosen **per day** via `Day.availableCourtIds`:

- On import, default: all imported courts selected on every day.
- A convenience "apply to all days" action.
- Matches on an **unselected** court stay imported (gender, time, teams intact) but are **excluded
  from the round×court grid and the solver** — shown in a muted "not refereed" area, not deleted.
  Toggling a court back on re-includes its matches with no re-import.

Real motivation: Saturday runs CC/SC1/SC2; Sunday's semis and final collapse onto CC.

### 1.7 Row skipping & errors

- Skip a row when `Kamp Id` **and** both teams **and** `Matchnamn` are all blank (trailing empties).
- Keep a row that has a time/court but blank teams (bracket TBD is a valid match).
- Row-level errors (unknown `Klass`, unparseable `Datum`) are collected and reported per row
  ("row N: …"); a bad row does not abort the whole import silently.

---

## 2. Local persistence (IndexedDB)

### 2.1 Structure

- Object store **`tournaments`**, keyed by tournament `id` — a **library of N tournaments**.
- A tiny **`meta`** store (or single record) holding `lastOpenedId`.
- Record value = the canonical `Tournament` object + envelope fields `{ id, name, updatedAt }` for
  the picker (name and updatedAt duplicated out for listing without deserializing every record).

Rationale for a library (not a single record): IndexedDB is a keyed store — N costs the same code as
one, and it removes the footgun of "New tournament" wiping a previous event. JSON export remains the
off-machine backup path.

### 2.2 Autosave & reload

- **Debounced autosave** (~500 ms after the last change): every edit — import, court selection, pin,
  override, solve result, rename — writes the whole object back under its `id` and bumps `updatedAt`.
- **No Save button.**
- On launch: read `lastOpenedId`, reload that tournament exactly where the user left off; otherwise
  show the tournament picker.
- **Partial multi-day** state needs nothing special: day 1 `finalized`, day 2 `draft` is just
  `Day.status` inside the persisted object. Carryover is recomputed live on load (never stored), so
  re-opening a finalized day and its dependents' possibly-stale flags all fall out of the domain
  model, not persistence.

---

## 3. JSON export / import

### 3.1 Envelope

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-07-18T14:32:00.000Z",
  "appVersion": "0.1.0",
  "tournament": { /* canonical Tournament object */ }
}
```

Carryover excluded (recomputed). UI-transient state excluded.
Export filename: `<tournament-name>_<date>.json`.

### 3.2 Version policy

On import, read `schemaVersion`:

- **older, known** → run migrations `vN → vN+1` in sequence, then load.
- **equal to app** → load directly.
- **newer than the app** → refuse with a clear message ("exported by a newer version — update the
  app"). Do not attempt to load.
- **malformed / missing envelope** → error; never half-load.

MVP ships only **v1**, so there are zero upgraders yet — but the migration **seam** exists from day
one (a `migrate(obj): Tournament` dispatching on `schemaVersion`) so old backups never become
unreadable as the schema evolves.

### 3.3 Import target

A JSON import lands in the IndexedDB library:

- **New `id`** → add.
- **Existing `id`** → prompt: **overwrite** vs **import as copy** (mint a fresh `id`).

---

## 4. Downstream / build notes

- SheetJS (`xlsx`) is the only new dependency introduced here; client-side, static-hosting-safe (no
  COOP/COEP), consistent with the GitHub Pages host decision (ticket 08).
- `serialize` / `deserialize` / `migrate` form one small module; the IndexedDB layer (`idb` or raw)
  and the import parser sit above it. Solver in the Web Worker receives the deserialized object; it
  neither reads IndexedDB nor parses files.
- Everything persisted is keyed by stable ids (Referee/Court/Match/Day). Renames never break
  storage, carryover, or pair history.
