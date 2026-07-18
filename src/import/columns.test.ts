// Column mapping for Swedish federation exports. Expectations hand-derived from the real header row
// of docs/reference/federation-export-sample.tsv and persistence-spec.md section 1.2.

import { describe, test, expect } from "vitest";
import { normHeader, mapColumns } from "./columns.ts";

const NBSP = " ";
const ZWSP = "​";
const BOM = "﻿";

// Real federation header order (0-based): Round=0 Datum=1 Starttid=2 Arena=3 Spelplats=4 Klass=5
// Hemmalag=6 Grupp=7 Bortalag=8 Matchnamn=9 Kamp nr=10 Omgangar=11 Tid per omgang=12 Kamp Id=13
const HEADER = [
  "Round", "Datum", "Starttid", "Arena", "Spelplats", "Klass", "Hemmalag", "Grupp",
  "Bortalag", "Matchnamn", "Kamp nr", "Omgangar", "Tid per omgang", "Kamp Id",
];

describe("normHeader", () => {
  test("strips NBSP, zero-width, BOM, tabs/CR/LF and trims", () => {
    expect(normHeader(BOM + "Kamp" + NBSP + "Id")).toBe("Kamp Id"); // BOM removed, NBSP -> space
    expect(normHeader("Datum\t")).toBe("Datum");
    expect(normHeader(ZWSP + "Klass")).toBe("Klass"); // zero-width space removed
    expect(normHeader("  Spelplats  ")).toBe("Spelplats");
  });
});

describe("mapColumns", () => {
  test("maps required + optional columns to indices (real federation header)", () => {
    expect(mapColumns(HEADER)).toEqual({
      datum: 1, starttid: 2, spelplats: 4, klass: 5,
      kampNr: 10, kampId: 13, matchnamn: 9, hemmalag: 6, bortalag: 8,
    });
  });

  test("absent optional columns -> null", () => {
    const c = mapColumns(["Datum", "Starttid", "Spelplats", "Klass"]);
    expect(c.kampId).toBeNull();
    expect(c.matchnamn).toBeNull();
    expect(c.kampNr).toBeNull();
    expect(c.hemmalag).toBeNull();
    expect(c.bortalag).toBeNull();
  });

  test("missing required column throws naming it", () => {
    expect(() => mapColumns(["Datum", "Starttid", "Spelplats"])).toThrow(/Klass/);
    expect(() => mapColumns(["Starttid", "Spelplats", "Klass"])).toThrow(/Datum/);
  });

  test("normalizes NBSP in header when matching", () => {
    const c = mapColumns(["Datum", "Starttid", "Spelplats", "Klass", "Kamp" + NBSP + "Id"]);
    expect(c.kampId).toBe(4);
  });
});
