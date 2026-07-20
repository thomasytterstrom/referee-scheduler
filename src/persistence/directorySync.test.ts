import { describe, expect, test } from "vitest";
import { mergeDirectoryRecords, visibleReferees } from "./directorySync.ts";
import type { DirectoryRecord } from "./directorySync.ts";

const row = (
  id: string,
  name: string,
  updatedAt: string,
  deletedAt: string | null = null,
): DirectoryRecord => ({ id, name, updatedAt, deletedAt });

describe("mergeDirectoryRecords", () => {
  test("keeps the newest row by id", () => {
    const merged = mergeDirectoryRecords(
      [row("ref-1", "Anna", "2026-01-01T10:00:00.000Z")],
      [row("ref-1", "Anna Bell", "2026-01-01T11:00:00.000Z")],
    );

    expect(merged.records).toEqual([row("ref-1", "Anna Bell", "2026-01-01T11:00:00.000Z")]);
    expect(merged.changed).toBe(true);
  });

  test("preserves local updates newer than remote rows", () => {
    const merged = mergeDirectoryRecords(
      [row("ref-1", "Anna Local", "2026-01-01T11:00:00.000Z")],
      [row("ref-1", "Anna Remote", "2026-01-01T10:00:00.000Z")],
    );

    expect(merged.records).toEqual([row("ref-1", "Anna Local", "2026-01-01T11:00:00.000Z")]);
    expect(merged.changed).toBe(true);
  });

  test("uses tombstones to keep deleted referees hidden", () => {
    const deleted = row(
      "ref-1",
      "Anna",
      "2026-01-01T12:00:00.000Z",
      "2026-01-01T12:00:00.000Z",
    );
    const merged = mergeDirectoryRecords(
      [row("ref-1", "Anna", "2026-01-01T10:00:00.000Z")],
      [deleted],
    );

    expect(merged.records).toEqual([deleted]);
    expect(visibleReferees(merged.records)).toEqual([]);
  });

  test("adds rows that exist on only one side", () => {
    const merged = mergeDirectoryRecords(
      [row("ref-1", "Anna", "2026-01-01T10:00:00.000Z")],
      [row("ref-2", "Bo", "2026-01-01T10:00:00.000Z")],
    );

    expect(merged.records.map((r) => r.id)).toEqual(["ref-1", "ref-2"]);
  });

  test("dedupes colliding live names by key and tombstones the older row", () => {
    const merged = mergeDirectoryRecords(
      [row("ref-1", "Anna", "2026-01-01T10:00:00.000Z")],
      [row("ref-2", "  anna  ", "2026-01-01T11:00:00.000Z")],
    );

    const winner = merged.records.find((r) => r.id === "ref-2");
    const loser = merged.records.find((r) => r.id === "ref-1");

    expect(winner?.deletedAt).toBeNull();
    expect(loser?.deletedAt).toBeTruthy();
    expect(loser?.updatedAt).toBe(loser?.deletedAt);
    expect(visibleReferees(merged.records)).toEqual([{ id: "ref-2", name: "  anna  " }]);
    expect(merged.changed).toBe(true);
  });

  test("breaks updatedAt ties deterministically by id", () => {
    const merged = mergeDirectoryRecords(
      [row("ref-2", "Anna", "2026-01-01T10:00:00.000Z")],
      [row("ref-1", "ANNA", "2026-01-01T10:00:00.000Z")],
    );

    expect(visibleReferees(merged.records)).toEqual([{ id: "ref-1", name: "ANNA" }]);
    expect(merged.records.find((r) => r.id === "ref-2")?.deletedAt).toBeTruthy();
  });
});
