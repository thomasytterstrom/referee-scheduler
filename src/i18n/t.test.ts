// t() resolves a dotted key against en.json and substitutes {named} placeholders. Missing keys must
// stay visible (return the key itself) so a gap never crashes the UI.

import { describe, test, expect } from "vitest";
import { t } from "./t.ts";

describe("t — placeholder substitution", () => {
  test("substitutes a single named placeholder from params", () => {
    expect(t("common.day", { day: "1" })).toBe("Day 1");
  });

  test("substitutes several named placeholders in one string", () => {
    expect(
      t("warnings.blocker.tooManyDuties", { time: "14:00", demand: "3", available: "2" }),
    ).toBe(
      "Too many duties for the referees available at 14:00 — needs 3, have 2. Add a referee or availability there.",
    );
  });

  test("returns the key string on a miss", () => {
    expect(t("nope.does.not.exist")).toBe("nope.does.not.exist");
    expect(t("warnings.blocker.nope", { time: "14:00" })).toBe("warnings.blocker.nope");
  });

  test("a param not referenced by the string is ignored", () => {
    expect(t("common.generate", { unused: "x" })).toBe("Generate");
    expect(t("common.day", { day: "2", extra: "ignored" })).toBe("Day 2");
  });

  test("numeric params are stringified", () => {
    expect(t("common.day", { day: 1 })).toBe("Day 1");
    expect(t("warnings.minor.collapsed", { n: 3 })).toBe("Minor fairness notes (3)");
  });

  test("a placeholder with no matching param is left untouched", () => {
    expect(t("common.day")).toBe("Day {day}");
  });
});
