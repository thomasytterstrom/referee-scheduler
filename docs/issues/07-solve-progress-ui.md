# 07 — Solve-progress UI + Web Worker wiring

Type: prototype
Status: resolved
Blocked by: 05

## Question

The solver runs in a Web Worker with a wall-clock budget and emits periodic progress; the message
protocol is drafted in [solver-spec.md](../solver-spec.md) (`solve` / `progress` / `done` / `cancel`,
cooperative cancel returning best-so-far). Decide the **UI affordance** for a running solve, inside
the app shell from ticket 05:

- How progress surfaces — spinner vs progress bar vs live "best score so far / iterations" ticker.
- Where **Generate** / **Reshuffle** go while solving (disabled? show elapsed?) and how **Cancel**
  is presented (keep best-so-far vs discard).
- What the grid shows mid-solve — frozen previous result, live-updating best, or a blocking overlay.
- Failure/edge display: feasibility precheck hard-fail (before solve) vs budget-exhausted-still-bent
  (after solve → warnings panel).

Depends on the UI shell (05) for placement. Use `/prototype`. Output: progress-UX spec section +
the exact worker↔UI message wiring.

## Answer

**Decision: Variant B — a blocking modal over a dimmed, frozen Review grid.** Chosen from the
throwaway 3-variant mockup [prototype/progress-proto.html](../prototype/progress-proto.html)
(`bun run progress`; A inline solve screen · B modal · C non-blocking live grid; each variant a full
stance on all four questions; scenario selector exercises the precheck-fail and forced-bend edges).
Two refinements settled on top of B:

- **Cancel = keep best-so-far only** (a single Cancel button). Matches the solver contract (a solve
  never returns "nothing"): once you press Generate, the previous schedule is superseded — there is no
  "discard, restore previous" path. Simpler modal, no ambiguous second button.
- **Minimum modal display ≈ 600 ms**, then auto-close. Pure UI timing (no solver change): SA converges
  in ~100 ms under a ~1–2 s budget, so without a display floor the modal would blink or look "stuck" at
  a flat score. The floor makes a fast solve read as a deliberate, completed action.

### Progress-UX spec section (the four ticket questions)

1. **How progress surfaces.** A centered modal card over the Review step: **spinner + a live ticker**
   (best score / iterations / elapsed), fed by the worker's `progress` messages. Indeterminate spinner,
   not a determinate bar — the solve is time-boxed and usually finishes far inside budget, so a bar to
   "100%" would misrepresent it. The ticker is the honest signal of work happening.
2. **Where Generate / Reshuffle / Cancel go.** Generate and Reshuffle live on the Review toolbar; both
   open the **same** modal. Generate posts `warmStart:true` (incremental — pins held, repair around
   them); Reshuffle posts a new `seed` with `warmStart:false` (fresh variety). While the modal is open
   the toolbar sits behind the scrim (non-interactive). **Cancel** is a single button inside the modal
   (keep best-so-far, per above).
3. **What the grid shows mid-solve.** The Review grid stays **frozen and dimmed** behind the scrim
   (`filter` + `pointer-events:none`) showing the pre-solve schedule. It updates **once**, atomically,
   when the modal closes — no live cell churn (the rejected trade-off from Variant C, which flickered).
   Pin/override interactions are disabled for the duration.
4. **Failure / edge display.**
   - **Feasibility precheck hard-fail** (a round's `demand > available refs`): the precheck runs
     **synchronously on the main thread before any worker message is sent**. On fail, no `solve` is
     posted; the modal opens directly in an **error state** (red banner, names the round + the
     shortfall, single "Close & fix" button, no spinner). Blocking, so the organizer must acknowledge.
   - **Budget-exhausted-but-a-soft-rule-still-bent** (e.g. rest rule forced by short-staffed rounds):
     this is a normal `done`. Modal closes, grid updates, and a **warn banner** appears above the grid
     plus the bent constraint lands in the Warnings panel (ticket 09). Not an error — a valid schedule
     that bent a soft rule because it was physically forced to.

### Worker↔UI message wiring (exact)

The message protocol is the one drafted in [solver-spec.md](../solver-spec.md) §"Web Worker protocol";
ticket 07 finalizes the **UI-side** consumption. Concrete shapes:

```ts
// main → worker
type SolveReq  = { type: "solve"; problem: Problem; carry: Carry;
                   opts: { budgetMs: number; seed: number; warmStart?: boolean } };
type CancelReq = { type: "cancel" };

// worker → main
type Progress  = { type: "progress"; elapsedMs: number; bestScore: number; iters: number };
type Done      = { type: "done"; sol: Schedule; score: number;
                   breakdown: PenaltyBreakdown;            // per-constraint, drives the warn banner + panel
                   reason: "budget" | "cancelled" };
```

- `progress` is emitted on a **~120 ms cadence** (a time gate in the SA loop, not per-iteration). The UI
  updates the ticker **in place** (patch the three numbers) rather than re-rendering the modal, so a
  ~2 M-iteration run doesn't thrash the DOM.
- **Cancel** is cooperative: `postMessage({type:"cancel"})` sets a flag the SA loop checks between
  iteration batches; the worker then emits a final `done` with `reason:"cancelled"` carrying best-so-far.
  The UI has one close path for both `reason` values.

**UI state machine** (drives modal open/close + min-display):

```
idle
  └─(Generate│Reshuffle)→ precheck (main thread, synchronous)
        ├─ fail → modalError → (Close & fix) → idle           // no worker involved
        └─ ok   → solving { openedAt = now; postMessage(SolveReq) }
              ├─ on Progress → patch ticker in place
              ├─ on Cancel   → postMessage(CancelReq)          // still awaits the final Done
              └─ on Done(d)  → wait max(0, 600 − (now − openedAt)) ms,
                               then applyResult(d): swap grid to d.sol atomically, close modal,
                               if d.breakdown has bent soft rules → show warn banner + Warnings panel
                               → idle
```

`openedAt` is captured when the modal opens (not when `solve` is posted) so precheck time doesn't eat
into the display floor. `applyResult` is the single commit point — the frozen grid never partially
updates. The solver is untouched by this ticket: no early-stop, no protocol change beyond the `reason`
field on `done` (which `cancel` needs to distinguish its terminal message).

### Prototype (throwaway, primary source)

[prototype/progress-proto.html](../prototype/progress-proto.html) — three variants + scenario selector,
served by `bun run progress`. Headless render check: [prototype/verify-progress.ts](../prototype/verify-progress.ts).
Stays in `.scratch/` as the record of the exploration (same convention as tickets 04/05); the winning
combination is captured above.
