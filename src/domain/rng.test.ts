// Seedable PRNG contract: deterministic per seed, uniform-ish in [0,1), randInt in range.

import { describe, test, expect } from "vitest";
import { makeRng, randInt } from "./rng.ts";

describe("makeRng", () => {
  test("same seed yields an identical sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test("different seeds diverge", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toBe(b());
  });

  test("every draw is in [0, 1)", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("randInt", () => {
  test("stays within [0, n) and covers the whole range", () => {
    const r = makeRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = randInt(r, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    expect(seen.size).toBe(5); // all of 0..4 appear
  });
});
