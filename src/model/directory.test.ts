// Pure referee-directory logic (referee-directory-spec.md §2-4). Expected values are known-good
// literals, independent of the implementation.

import { describe, test, expect } from "vitest";
import {
  normalizeName,
  nameKey,
  findByName,
  upsertNew,
  renameEntry,
  deleteEntry,
  sortByName,
} from "./directory.ts";
import type { Referee } from "./tournament.ts";

describe("normalizeName — display form (trim + collapse, casing kept)", () => {
  test("trims leading/trailing whitespace", () => {
    expect(normalizeName("  Anna  ")).toBe("Anna");
  });
  test("collapses inner whitespace runs to a single space", () => {
    expect(normalizeName("An  na")).toBe("An na");
    expect(normalizeName("An\t\nna")).toBe("An na");
  });
  test("preserves original casing", () => {
    expect(normalizeName("ANNA")).toBe("ANNA");
    expect(normalizeName(" McRae ")).toBe("McRae");
  });
});

describe("nameKey — uniqueness key (normalized + lower-cased)", () => {
  test("collapses case and whitespace variants to one key", () => {
    const k = nameKey("Anna");
    expect(nameKey("anna ")).toBe(k);
    expect(nameKey(" ANNA ")).toBe(k);
    expect(k).toBe("anna");
  });
  test("keeps genuinely different names distinct", () => {
    expect(nameKey("An na")).not.toBe(nameKey("Anna"));
    expect(nameKey("An  na")).toBe(nameKey("An na"));
  });
});

describe("findByName — locate by name key", () => {
  const dir: Referee[] = [
    { id: "1", name: "Anna" },
    { id: "2", name: "Bo" },
  ];
  test("matches case-insensitively", () => {
    expect(findByName(dir, "ANNA")?.id).toBe("1");
    expect(findByName(dir, "  bo ")?.id).toBe("2");
  });
  test("returns undefined when absent", () => {
    expect(findByName(dir, "Cara")).toBeUndefined();
  });
});

describe("upsertNew — create-or-reuse by unique name", () => {
  test("creates a new entry when the name-key is absent", () => {
    const { dir, ref, created } = upsertNew([], "  Anna  ", () => "x");
    expect(created).toBe(true);
    expect(ref).toEqual({ id: "x", name: "Anna" });
    expect(dir).toHaveLength(1);
  });
  test("reuses the existing entry when the name-key matches (no duplicate, no id minted)", () => {
    const start: Referee[] = [{ id: "1", name: "Anna" }];
    let mints = 0;
    const { dir, ref, created } = upsertNew(start, "ANNA ", () => {
      mints++;
      return "new";
    });
    expect(created).toBe(false);
    expect(ref.id).toBe("1");
    expect(ref.name).toBe("Anna"); // existing display name unchanged
    expect(dir).toHaveLength(1);
    expect(mints).toBe(0);
  });
  test("stores the normalized display name on create", () => {
    const { ref } = upsertNew([{ id: "1", name: "Anna" }], "  Bo  Jones ", () => "x");
    expect(ref.name).toBe("Bo Jones");
  });
  test("does not mutate the input array", () => {
    const start: Referee[] = [{ id: "1", name: "Anna" }];
    upsertNew(start, "Bo", () => "x");
    expect(start).toHaveLength(1);
  });
});

describe("renameEntry — uniqueness-checked rename", () => {
  const base = (): Referee[] => [
    { id: "1", name: "Anna" },
    { id: "2", name: "Bo" },
  ];
  test("renames to a free name", () => {
    const { dir, ok } = renameEntry(base(), "2", "Cara");
    expect(ok).toBe(true);
    expect(dir.find((r) => r.id === "2")?.name).toBe("Cara");
  });
  test("normalizes the new display name", () => {
    const { dir } = renameEntry(base(), "2", "  Cara  Lee ");
    expect(dir.find((r) => r.id === "2")?.name).toBe("Cara Lee");
  });
  test("rejects a collision with a different entry, leaving the directory unchanged", () => {
    const { dir, ok, reason } = renameEntry(base(), "2", "anna");
    expect(ok).toBe(false);
    expect(reason).toBe("duplicate");
    expect(dir.find((r) => r.id === "2")?.name).toBe("Bo");
  });
  test("allows a casing/spacing-only rename of the same entry", () => {
    const { dir, ok } = renameEntry(base(), "1", "ANNA");
    expect(ok).toBe(true);
    expect(dir.find((r) => r.id === "1")?.name).toBe("ANNA");
  });
  test("reports not-found for an unknown id", () => {
    const { ok, reason } = renameEntry(base(), "x", "Zed");
    expect(ok).toBe(false);
    expect(reason).toBe("not-found");
  });
});

describe("deleteEntry — remove by id (immutable)", () => {
  test("removes the matching entry", () => {
    const start: Referee[] = [
      { id: "1", name: "Anna" },
      { id: "2", name: "Bo" },
    ];
    const out = deleteEntry(start, "1");
    expect(out.map((r) => r.id)).toEqual(["2"]);
    expect(start).toHaveLength(2);
  });
});

describe("sortByName — case-insensitive by name", () => {
  test("orders entries by name key", () => {
    const dir: Referee[] = [
      { id: "1", name: "Bo" },
      { id: "2", name: "anna" },
      { id: "3", name: "Cara" },
    ];
    expect(sortByName(dir).map((r) => r.name)).toEqual(["anna", "Bo", "Cara"]);
  });
});
