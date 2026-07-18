// migrate is the version-policy seam (persistence-spec §3.2): newer -> refuse, equal -> pass through,
// older-known -> run vN->vN+1 upgraders, malformed -> throw. MVP ships only v1 so there are no
// upgraders yet, but the dispatch table is present and an unknown older version is a hard error.

import { describe, test, expect } from "vitest";
import { migrate, SCHEMA_VERSION } from "./migrate.ts";
import { serialize } from "./serialize.ts";
import type { Tournament } from "../model/tournament.ts";

const sample: Tournament = {
  referees: [{ id: "r0", name: "Alice" }],
  courts: [{ id: "c0", name: "Center" }],
  days: [
    {
      index: 0,
      status: "draft",
      availableCourtIds: ["c0"],
      availability: { r0: null },
      rounds: [{ index: 0, matches: [] }],
      assignments: [],
    },
  ],
};

describe("migrate — schemaVersion dispatch", () => {
  test("app schema is v1 and a current envelope passes through", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(migrate(serialize(sample))).toEqual(sample);
  });

  test("refuses an envelope from a newer app version", () => {
    const env = { ...serialize(sample), schemaVersion: SCHEMA_VERSION + 1 };
    expect(() => migrate(env)).toThrow(/newer/i);
  });

  test("rejects a malformed / missing envelope", () => {
    expect(() => migrate(null)).toThrow();
    expect(() => migrate(42)).toThrow();
    expect(() => migrate({})).toThrow(); // no schemaVersion
    expect(() => migrate({ schemaVersion: "1", tournament: {} })).toThrow(); // non-numeric version
    expect(() => migrate({ schemaVersion: 1 })).toThrow(); // no tournament
  });

  test("throws for an older schema with no upgrader (seam present, table empty)", () => {
    const env = { ...serialize(sample), schemaVersion: 0 };
    expect(() => migrate(env)).toThrow(/migrat/i);
  });
});
