# Solver prototype — THROWAWAY

Wayfinder ticket [04 — Solver approach decision + prototype](../issues/04-solver-decision-prototype.md).

## The question

Does a **pure-TypeScript greedy-seed + simulated-annealing** solver (the recommendation from the
[solver survey](../research/02-solver-approaches.md)) actually:

1. produce **hard-valid** schedules (1 duty/ref/round, availability, head≠asst, pins);
2. **minimize** the weighted soft penalty from the [constraint spec](../constraint-spec.md), rest
   rule first;
3. run inside a plausible **in-browser (Web Worker)** time budget at realistic sizes
   (N=8–12 refs, M=4–8 courts, 8–12 rounds/day, 2 days with carryover);
4. support **incremental re-solve** around pinned slots; and
5. support **reshuffle** (new seed → a different but equally good schedule)?

## Run

Requires [Bun](https://bun.sh) (this repo has 1.3.x). Zero dependencies — pure TS.

```
bun run bench    # measurement sweep: validity / penalty / timing / incremental / reshuffle
bun run tui      # interactive: drive Generate / Reshuffle / pin / override / finalize-day by hand
```

The **`bun run tui`** shell is throwaway. The **`src/` modules are portable** — `score.ts`,
`solver.ts`, `validate.ts`, `carry.ts`, `types.ts` lift into the real app almost verbatim; only the
`tui.ts` / `bench.ts` harnesses stay behind. Default TUI size is rest-saturated (M≈N/2, every court
busy every round → rest can't be satisfied); type `c 12 4 10 2` for a rest-feasible layout where the
rest penalty drops to ~0.

## Verdict

**Confirmed — greedy + SA is the approach.** See the ticket's `## Answer` and
[solver-spec.md](../solver-spec.md). Headlines from `bun run bench`:

- **Valid** in every case (hard constraints enforced by construction).
- **1.4M–2.3M SA iterations in 2 s**, pure TS; converges within **<100 ms** at these sizes (budget
  scaling 100ms→2000ms barely moves the score) — the 2 s budget is enormous headroom.
- **Incremental**: pins always held, schedule stays valid.
- **Reshuffle**: 82–94 % of slots differ between seeds at near-identical score → real variety.
- **Rest-first**: where rest is physically satisfiable (`wide N12 M4`), SA drives it to ~0 and
  improves the greedy seed 87 %; where it's forced (M≈N/2), the feasibility precheck **warns** and
  rest is what's left over — exactly the intended "bend only when forced" behavior.
