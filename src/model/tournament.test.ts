// Canonical Tournament graph is mostly declarative types (domain-model.md §Entities); the only
// runtime behavior is the id-mint helpers. Ids must be stable, unique, and prefixed by entity.

import { describe, test, expect } from "vitest";
import { newRefId, newCourtId, newMatchId } from "./tournament.ts";
import type { Tournament, Day } from "./tournament.ts";

describe("id-mint helpers", () => {
  test("each helper mints a prefixed, non-empty string", () => {
    expect(newRefId()).toMatch(/^ref-/);
    expect(newCourtId()).toMatch(/^court-/);
    expect(newMatchId()).toMatch(/^match-/);
  });

  test("minted ids are unique across many calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(newRefId());
      ids.add(newCourtId());
      ids.add(newMatchId());
    }
    expect(ids.size).toBe(3000);
  });
});

describe("Tournament graph shape (compile + invariants 4/8)", () => {
  test("assignments carry an always-present head and assistant iff requiresAssistant", () => {
    const day: Day = {
      index: 0,
      status: "draft",
      availableCourtIds: ["c0"],
      availability: { r0: null, r1: [0] }, // r1 restricted to round 0
      rounds: [
        {
          index: 0,
          matches: [
            { id: "mHeadOnly", courtId: "c0", gender: "M", requiresAssistant: false },
            { id: "mPair", courtId: "c0", gender: "W", requiresAssistant: true },
          ],
        },
      ],
      assignments: [
        { matchId: "mHeadOnly", head: { refId: null, pinned: false }, assistant: null },
        {
          matchId: "mPair",
          head: { refId: "r0", pinned: true },
          assistant: { refId: "r1", pinned: false },
        },
      ],
    };
    const t: Tournament = {
      referees: [
        { id: "r0", name: "Alice" },
        { id: "r1", name: "Bob" },
      ],
      courts: [{ id: "c0", name: "Center" }],
      days: [day],
    };

    expect(t.days[0].assignments[0].assistant).toBeNull(); // head-only match
    expect(t.days[0].assignments[1].assistant?.refId).toBe("r1");
    expect(t.days[0].assignments[1].head.pinned).toBe(true);
    expect(t.days[0].availability["r1"]).toEqual([0]);
  });
});
