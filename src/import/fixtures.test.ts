// Import: federation fixtures -> Tournament (Courts/Days/Rounds/Matches, never referees), plus
// merge-on-re-import. Expectations hand-derived from the REAL artifact
// docs/reference/federation-export-sample.tsv (2 days, 3 courts, 38 matches) + persistence-spec.md §1.

import { describe, test, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseImport, mergeImport } from "./fixtures.ts";
import type { Match, Tournament } from "../model/tournament.ts";
// Real federation artifact as a raw string via Vite ?raw — avoids node:fs so the browser-app
// tsconfig typechecks cleanly (SAMPLE is typed string, not any).
import SAMPLE from "../../docs/reference/federation-export-sample.tsv?raw";

const allMatches = (t: Tournament): Match[] =>
  t.days.flatMap((d) => d.rounds.flatMap((r) => r.matches));
const byNo = (t: Tournament, no: string): Match | undefined =>
  allMatches(t).find((m) => m.matchNo === no);

// Sample bucketing (hand-counted from the TSV):
//   Saturday 2026-07-18: 9 rounds {09..17}; 24 matches. Round 0 (09:00) = CC+SC1+SC2 = 3.
//     11:00 = CC+SC1 = 2. Sunday 2026-07-19: 9 rounds; 14 matches; semis/finals are 1/round.
describe("parseImport — federation sample", () => {
  const { tournament: t, errors } = parseImport(SAMPLE);

  test("no referees, 3 courts (verbatim Spelplats), 2 days, 38 matches, no errors", () => {
    expect(t.referees).toEqual([]);
    expect(t.courts.map((c) => c.name)).toEqual(["Plan CC", "Plan SC1", "Plan SC2"]);
    expect(t.days).toHaveLength(2);
    expect(allMatches(t)).toHaveLength(38);
    expect(errors).toEqual([]);
  });

  test("Saturday rounds bucket by distinct Starttid (sorted -> 0-based round index)", () => {
    const sat = t.days[0];
    expect(sat.rounds).toHaveLength(9);
    expect(sat.rounds[0].startTime).toBe("09:00");
    expect(sat.rounds[0].matches).toHaveLength(3); // CC + SC1 + SC2
    expect(sat.rounds[2].startTime).toBe("11:00");
    expect(sat.rounds[2].matches).toHaveLength(2); // CC + SC1
    expect(sat.rounds[8].startTime).toBe("17:00");
    expect(allMatches({ ...t, days: [sat] } as Tournament)).toHaveLength(24);
  });

  test("Sunday collapses toward finals (14 matches, 1/round in semis+finals)", () => {
    const sun = t.days[1];
    expect(sun.rounds).toHaveLength(9);
    expect(allMatches({ ...t, days: [sun] } as Tournament)).toHaveLength(14);
    expect(sun.rounds[8].startTime).toBe("17:00");
    expect(sun.rounds[8].matches).toHaveLength(1); // Final (D)
  });

  test("Klass H -> M, D -> W", () => {
    expect(byNo(t, "1")?.gender).toBe("M"); // Klass H
    expect(byNo(t, "5")?.gender).toBe("W"); // Klass D
  });

  test("requiresAssistant defaults true; matchName only when Matchnamn present", () => {
    expect(allMatches(t).every((m) => m.requiresAssistant)).toBe(true);
    expect(byNo(t, "1")?.matchName).toBeUndefined(); // group stage, blank Matchnamn
    expect(byNo(t, "17")?.matchName).toBe("Åttondel 1"); // knockout label
  });

  test("every court selected on every day by default", () => {
    for (const day of t.days) {
      expect(day.availableCourtIds).toHaveLength(3);
      expect(new Set(day.availableCourtIds)).toEqual(new Set(t.courts.map((c) => c.id)));
    }
  });

  test(".xlsx (ArrayBuffer) path yields the same day/round structure", () => {
    const matrix = SAMPLE.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").map((l) => l.split("\t"));
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const xt = parseImport(buf).tournament;
    expect(xt.courts.map((c) => c.name)).toEqual(["Plan CC", "Plan SC1", "Plan SC2"]);
    expect(xt.days.map((d) => d.rounds.length)).toEqual([9, 9]);
    expect(allMatches(xt)).toHaveLength(38);
  });
});

describe("parseImport — row skipping & errors (§1.7)", () => {
  test("collects per-row error for unknown Klass without aborting", () => {
    const bad = [
      "Datum\tStarttid\tSpelplats\tKlass\tKamp Id",
      "Sat 2026-07-18\t09:00\tPlan CC\tX\t99",
    ].join("\n");
    const r = parseImport(bad);
    expect(r.errors.some((e) => /unknown Klass/.test(e))).toBe(true);
    expect(allMatches(r.tournament)).toHaveLength(0);
  });

  test("missing required column is a hard error naming it", () => {
    expect(() => parseImport("Datum\tStarttid\tSpelplats")).toThrow(/Klass/);
  });
});

describe("mergeImport — re-import reconciliation (§1.4)", () => {
  function withPinnedHead(): Tournament {
    const t = parseImport(SAMPLE).tournament;
    t.referees.push({ id: "ref-x", name: "Zoe" });
    t.days[0].assignments.push({
      matchId: "match-fed-32721757", // Saturday 09:00 Plan CC
      head: { refId: "ref-x", pinned: true },
      assistant: { refId: null, pinned: false },
    });
    return t;
  }

  test("preserves a pinned Head assignment on an UNCHANGED match; not flagged moved", () => {
    const merged = mergeImport(withPinnedHead(), SAMPLE);
    const asg = merged.tournament.days[0].assignments.find((a) => a.matchId === "match-fed-32721757");
    expect(asg?.head.refId).toBe("ref-x");
    expect(asg?.head.pinned).toBe(true);
    expect(merged.moved).not.toContain("match-fed-32721757");
    expect(merged.tournament.referees).toHaveLength(1); // roster preserved
  });

  test("flags a match whose Starttid moved but keeps its assignment", () => {
    const movedText = SAMPLE.split(/\r\n|\r|\n/)
      .map((l) => (l.includes("32721757") ? l.replace("09:00", "10:00") : l))
      .join("\n");
    const merged = mergeImport(withPinnedHead(), movedText);
    expect(merged.moved).toContain("match-fed-32721757");
    const asg = merged.tournament.days[0].assignments.find((a) => a.matchId === "match-fed-32721757");
    expect(asg?.head.refId).toBe("ref-x");
  });

  test("adds new matches and warns on vanished ones", () => {
    const withoutFinal = SAMPLE.split(/\r\n|\r|\n/).filter((l) => !l.includes("32721794")).join("\n");

    const added = mergeImport(parseImport(withoutFinal).tournament, SAMPLE);
    expect(added.added).toContain("match-fed-32721794");

    const removed = mergeImport(parseImport(SAMPLE).tournament, withoutFinal);
    expect(removed.removed).toContain("match-fed-32721794");
    expect(removed.warnings.length).toBeGreaterThan(0);
  });

  test("leaves a manually-added match (no Kamp Id) untouched", () => {
    const base = parseImport(SAMPLE).tournament;
    base.referees.push({ id: "ref-y", name: "Manual" });
    const manualId = "match-" + crypto.randomUUID(); // newMatchId() shape; not import-keyed
    base.days[0].rounds[0].matches.push({
      id: manualId, courtId: base.courts[0].id, gender: "M", requiresAssistant: true, startTime: "09:00",
    });
    base.days[0].assignments.push({
      matchId: manualId, head: { refId: "ref-y", pinned: false }, assistant: { refId: null, pinned: false },
    });

    const merged = mergeImport(base, SAMPLE);
    const ids = merged.tournament.days.flatMap((d) => d.rounds.flatMap((r) => r.matches.map((m) => m.id)));
    expect(ids).toContain(manualId);
    expect(merged.removed).not.toContain(manualId);
    const asg = merged.tournament.days[0].assignments.find((a) => a.matchId === manualId);
    expect(asg?.head.refId).toBe("ref-y");
  });
});

describe("mergeImport — multi-file union import", () => {
  const sampleLines = SAMPLE.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "");
  const sampleHeader = sampleLines[0];
  const sampleBody = sampleLines.slice(1);
  const classCol = sampleHeader.split("\t").indexOf("Klass");

  function byClass(klass: "H" | "D"): string {
    return [
      sampleHeader,
      ...sampleBody.filter((line) => line.split("\t")[classCol] === klass),
    ].join("\n");
  }

  test("combines disjoint men's + women's files into one tournament with per-file counts", () => {
    const men = byClass("H");
    const women = byClass("D");
    const empty = parseImport(sampleHeader).tournament;

    const merged = mergeImport(empty, [
      { name: "mens.tsv", input: men },
      { name: "womens.tsv", input: women },
    ]);

    expect(allMatches(merged.tournament)).toHaveLength(38);
    expect(merged.fileCounts).toEqual([
      { fileName: "mens.tsv", matchCount: 19 },
      { fileName: "womens.tsv", matchCount: 19 },
    ]);
    expect(merged.errors).toEqual([]);
  });

  test("dedupes duplicate Kamp Id across files (keep-first) and warns on conflict", () => {
    const header = "Datum\tStarttid\tSpelplats\tKlass\tKamp Id";
    const first = [header, "Sat 2026-07-18\t09:00\tPlan CC\tH\t1"].join("\n");
    const second = [header, "Sat 2026-07-18\t10:00\tPlan CC\tH\t1"].join("\n");
    const empty = parseImport(header).tournament;

    const merged = mergeImport(empty, [
      { name: "first.tsv", input: first },
      { name: "second.tsv", input: second },
    ]);

    const ids = merged.tournament.days.flatMap((d) => d.rounds.flatMap((r) => r.matches.map((m) => m.id)));
    expect(ids).toEqual(["match-fed-1"]);
    expect(merged.tournament.days[0].rounds[0].startTime).toBe("09:00");
    expect(merged.warnings.some((w) => /Kamp Id 1 has conflicting rows/.test(w))).toBe(true);
    expect(merged.fileCounts).toEqual([
      { fileName: "first.tsv", matchCount: 1 },
      { fileName: "second.tsv", matchCount: 1 },
    ]);
  });

  test("collapses shared court and round when different files share slot coordinates", () => {
    const header = "Datum\tStarttid\tSpelplats\tKlass\tKamp Id";
    const men = [header, "Sat 2026-07-18\t09:00\tPlan CC\tH\t10"].join("\n");
    const women = [header, "Sat 2026-07-18\t09:00\tPlan CC\tD\t20"].join("\n");
    const empty = parseImport(header).tournament;

    const merged = mergeImport(empty, [
      { name: "men.tsv", input: men },
      { name: "women.tsv", input: women },
    ]);

    expect(merged.tournament.courts.map((c) => c.name)).toEqual(["Plan CC"]);
    expect(merged.tournament.days).toHaveLength(1);
    expect(merged.tournament.days[0].rounds).toHaveLength(1);
    expect(merged.tournament.days[0].rounds[0].matches).toHaveLength(2);
  });
});
