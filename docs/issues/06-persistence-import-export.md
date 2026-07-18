# 06 — Persistence & import/export format

Type: grilling
Status: resolved
Blocked by: 01

## Question

Define how tournament state is stored and moved:

- **Local persistence** — IndexedDB structure keyed to the domain model (ticket 01). Autosave
  behavior. How a **partially-solved, multi-day** tournament (day 1 finalized, day 2 pending) is
  stored and reloaded across sessions.
- **JSON export/import** — a **versioned** schema for backup + moving between machines.
- **Tournament import format** — exact columns for paste/upload (carrying **court names**,
  **referee names**, **gender**, **day**, **round/start time**); parsing rules (gender W/M
  derivation; snapping start times to synchronized rounds). How the manual builder and import
  **compose** (import as fast-fill over the manual model).

Reference the current Excel `Input` sheet columns (`src/workbook-spec.json`, `mod_Input.bas`) as
prior art for import fields. Use `/grilling`. Output: persistence + import/export spec section.

## Answer

Full spec: [persistence-spec.md](../persistence-spec.md). Grounded on a real two-day federation
export ([reference/federation-export-sample.tsv](../reference/federation-export-sample.tsv)).

Decisions:

- **One canonical `Tournament` shape** across in-memory / IndexedDB / JSON; one serialize/deserialize
  pair; carryover and UI-transient state never persisted.
- **Import = fixtures only** (no referees; roster entered separately). Ingest `.xlsx` + paste via
  SheetJS (csv/tsv free), MVP-first.
- **Round = rank of distinct `Starttid` per day**; federation `Round` column ignored (bracket
  codes 1/2/800/400/200/100). Exact-string time bucketing, no tolerance.
- **Columns:** `Spelplats`→Court verbatim; `Klass` H→M / D→W (else row error); `Datum`→day key;
  `Matchnamn`→label + `highlight`; `Kamp Id`→stable merge key; `Kamp nr`→display no. Required:
  `Datum/Starttid/Spelplats/Klass`. Ignore `Arena/Grupp/Round/Omgångar/Tid per omgång`.
- **Re-import merges by `Kamp Id`** (fallback `(day,Starttid,Spelplats)`): update mutable fields,
  keep assignments/pins, flag moved placements, add new, warn on vanished — never silent discard.
- **`requiresAssistant` default true**; bulk toggle per round & per court (head-only), per-match
  override; domain stays per-match.
- **Court selection per day** (`Day.availableCourtIds`, default all, "apply to all days");
  unselected courts' matches kept but excluded from grid + solver.
- **IndexedDB library of N tournaments** keyed by `id` + `lastOpenedId`; debounced autosave (~500ms),
  whole-object write, reload-where-you-left-off. Partial multi-day = `Day.status`; carryover
  recomputed on load.
- **JSON envelope** `{ schemaVersion:1, exportedAt, appVersion, tournament }`; migration seam from
  v1 (refuse newer, migrate older, error on malformed); import → library (add / prompt
  overwrite-vs-copy); filename `<name>_<date>.json`.
