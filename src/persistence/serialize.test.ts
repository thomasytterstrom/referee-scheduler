// serialize/deserialize are pure — the canonical Tournament <-> v1 JSON envelope (persistence-spec
// §0, §3). Round-trip is identity on the tournament payload (exportedAt is envelope-only); a bad
// envelope never half-loads.

import { describe, test, expect } from "vitest";
import { serialize, deserialize, APP_VERSION } from "./serialize.ts";
import type { Tournament } from "../model/tournament.ts";

const sample: Tournament = {
  referees: [
    { id: "r0", name: "Alice" },
    { id: "r1", name: "Bob" },
  ],
  courts: [{ id: "c0", name: "Center" }],
  days: [
    {
      index: 0,
      status: "draft",
      availableCourtIds: ["c0"],
      availability: { r0: null, r1: [0] },
      rounds: [
        {
          index: 0,
          startTime: "09:00",
          matches: [
            { id: "m0", courtId: "c0", gender: "W", requiresAssistant: true, startTime: "09:00" },
          ],
        },
      ],
      assignments: [
        {
          matchId: "m0",
          head: { refId: "r0", pinned: true },
          assistant: { refId: "r1", pinned: false },
        },
      ],
    },
  ],
};

describe("serialize / deserialize envelope", () => {
  test("serialize stamps a v1 envelope with ISO exportedAt + appVersion", () => {
    const env = serialize(sample);
    expect(env.schemaVersion).toBe(1);
    expect(env.appVersion).toBe(APP_VERSION);
    expect(env.tournament).toBe(sample);
    expect(env.exportedAt).toBe(new Date(env.exportedAt).toISOString());
  });

  test("round-trip serialize -> deserialize is identity (in-memory + JSON)", () => {
    expect(deserialize(serialize(sample))).toEqual(sample);
    const json = JSON.parse(JSON.stringify(serialize(sample)));
    expect(deserialize(json)).toEqual(sample);
  });

  test("deserialize rejects a missing / garbage envelope (never half-load)", () => {
    expect(() => deserialize(null)).toThrow();
    expect(() => deserialize("garbage")).toThrow();
    expect(() => deserialize({})).toThrow();
    expect(() => deserialize({ schemaVersion: 1 })).toThrow(); // no tournament
    expect(() => deserialize({ schemaVersion: 1, tournament: {} })).toThrow(); // no ref/court/day arrays
  });
});
