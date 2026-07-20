# Split federation exports combine as an all-at-once multi-file union, not per-source

The federation sometimes splits one event's schedule into two competition files (men's + women's). Since a `Tournament` already spans genders (`Match.gender`) with one shared roster, court, and day grid, we combine them by letting a single fixtures import accept **multiple files**, concatenate their rows, and build/merge **one authoritative** schedule over the union — identical to importing the one combined file the federation can also produce. No per-source/per-competition concept is added to the model.

## Considered Options

- **Per-source additive import** — tag each match with its origin competition so files can be imported one at a time and a re-import of one file reconciles only its own matches. Rejected: adds a persisted "source" concept threaded through the model, merge, and UI to serve a workflow the single-combined-file case never needed. The federation can already export combined, so the union is the natural generalization.
- **All-at-once union (chosen)** — select all files together; the import is authoritative over their union. Keeps the existing mental model ("import = the current full schedule") and needs no schema change.

## Consequences

- Re-import is authoritative over **whatever files are passed that time**. Re-importing both together reconciles correctly (moves flagged, true cancellations flagged removed per §1.4). Re-importing only one file flags the *other* file's matches as removed and drops them — surfaced in the merge report, never silent. This is the same footgun as importing a partial file today; mitigated by a **per-file breakdown** in the report (each file → its match count), not by a source tag.
- Union dedupes incoming rows by `Kamp Id` (keep-first + warn on conflict) so a match present in both files cannot mint two Matches sharing one id (guards the identity invariant). Shared courts and time-slots already dedupe by name / `startTime`.
- Scope is the wizard fixtures import only. The picker's `<name>_<date>.json` envelope import (app round-trip) is untouched.
