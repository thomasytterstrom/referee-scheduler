// Import detector: .xlsx (ArrayBuffer via SheetJS), pasted tab/comma text, or .csv/.tsv -> a
// Tournament (Courts/Days/Rounds/Matches; NEVER referees) + merge-on-re-import. persistence-spec.md §1.
//
// The domain Match has no field for the federation Kamp Id, yet §1.4 keys the re-import merge on it
// and it must survive persistence. So imported matches encode their key in the stable Match.id:
//   `match-fed-<Kamp Id>` when Kamp Id present, else `match-imp-<uuid>` (composite-key fallback).
// A plain `match-<uuid>` (newMatchId) marks a manually-added match, left untouched by import.

import * as XLSX from "xlsx";
import type { Tournament, Day, Round, Match, Assignment, Gender } from "../model/tournament.ts";
import { newCourtId } from "../model/tournament.ts";
import { normHeader, mapColumns } from "./columns.ts";

export type ImportInput = string | ArrayBuffer | Uint8Array;

export interface ImportResult {
  tournament: Tournament;
  errors: string[]; // per-row problems (§1.7); a bad row never aborts the import
  warnings: string[];
}

export interface MergeResult extends ImportResult {
  added: string[]; // new match ids
  moved: string[]; // matched match ids whose day/round/court moved
  removed: string[]; // existing imported match ids absent from the new file
}

const FED = "match-fed-";
const IMP = "match-imp-";
const fedId = (kampId: string): string => FED + kampId;
const impId = (): string => IMP + crypto.randomUUID();
const isImported = (id: string): boolean => id.startsWith(FED) || id.startsWith(IMP);

// merge key: Kamp Id when present (placement-independent -> detects moves), else composite placement.
function keyOf(id: string, dayIndex: number, startTime: string, court: string): string {
  if (id.startsWith(FED)) return "fed:" + id.slice(FED.length);
  return `cmp:${dayIndex}|${startTime}|${court}`;
}

// Extract YYYY-MM-DD from a Date-ish string like "Sat 2026-07-18" (reuse of mod_Input.ParseDayKey).
function parseDayKey(v: string): string {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : "";
}

// --- ingest -> row matrix ---------------------------------------------------

function toMatrix(input: ImportInput): string[][] {
  if (typeof input === "string") return textMatrix(input);
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const wb = XLSX.read(bytes, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: false, defval: "" }) as unknown[][];
  return aoa.map((r) => r.map((c) => (c == null ? "" : String(c))));
}

function textMatrix(text: string): string[][] {
  const lines = text.split(/\r\n|\r|\n/);
  while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
  if (!lines.length) return [];
  const delim = lines[0].includes("\t") ? "\t" : ",";
  return lines.map((l) => l.split(delim));
}

// --- rows -------------------------------------------------------------------

interface Row {
  dayKey: string;
  startTime: string;
  courtName: string;
  gender: Gender;
  kampId?: string;
  matchNo?: string;
  homeTeam?: string;
  awayTeam?: string;
  matchnamn?: string;
}

function parseRows(input: ImportInput): { rows: Row[]; errors: string[]; warnings: string[] } {
  const matrix = toMatrix(input);
  if (matrix.length === 0) throw new Error("Empty import: no header row");
  const cols = mapColumns(matrix[0]);
  const rows: Row[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i];
    const cell = (c: number | null): string => (c === null ? "" : normHeader(String(raw[c] ?? "")));
    if (raw.every((v) => normHeader(String(v ?? "")) === "")) continue; // fully blank line

    const kampId = cell(cols.kampId);
    const homeTeam = cell(cols.hemmalag);
    const awayTeam = cell(cols.bortalag);
    const matchnamn = cell(cols.matchnamn);
    if (!kampId && !homeTeam && !awayTeam && !matchnamn) continue; // §1.7 trailing empties

    const rowNo = i + 1;
    const dayKey = parseDayKey(cell(cols.datum));
    if (!dayKey) { errors.push(`row ${rowNo}: unparseable Datum "${cell(cols.datum)}"`); continue; }
    const startTime = cell(cols.starttid);
    if (!startTime) { errors.push(`row ${rowNo}: missing Starttid`); continue; }
    const courtName = cell(cols.spelplats);
    if (!courtName) { errors.push(`row ${rowNo}: missing Spelplats`); continue; }
    const klass = cell(cols.klass).toUpperCase();
    const gender: Gender | null = klass === "H" ? "M" : klass === "D" ? "W" : null;
    if (!gender) { errors.push(`row ${rowNo}: unknown Klass "${cell(cols.klass)}"`); continue; }
    if (!kampId) warnings.push(`row ${rowNo}: missing Kamp Id, keyed on (day, time, court)`);

    rows.push({
      dayKey, startTime, courtName, gender,
      kampId: kampId || undefined,
      matchNo: cell(cols.kampNr) || undefined,
      homeTeam: homeTeam || undefined,
      awayTeam: awayTeam || undefined,
      matchnamn: matchnamn || undefined,
    });
  }
  return { rows, errors, warnings };
}

// --- rows -> Tournament -----------------------------------------------------

function buildTournament(rows: Row[]): Tournament {
  const courtId = new Map<string, string>();
  const courts: Tournament["courts"] = [];
  for (const r of rows) {
    if (courtId.has(r.courtName)) continue;
    const id = newCourtId();
    courtId.set(r.courtName, id);
    courts.push({ id, name: r.courtName });
  }
  const allCourtIds = courts.map((c) => c.id);

  const dayKeys = [...new Set(rows.map((r) => r.dayKey))].sort();
  const days: Day[] = dayKeys.map((dk, di) => {
    const dayRows = rows.filter((r) => r.dayKey === dk);
    const times = [...new Set(dayRows.map((r) => r.startTime))].sort();
    const rounds: Round[] = times.map((t, ri) => ({ index: ri, startTime: t, matches: [] }));
    const roundByTime = new Map(times.map((t, ri) => [t, rounds[ri]]));
    for (const r of dayRows) {
      const m: Match = {
        id: r.kampId ? fedId(r.kampId) : impId(),
        courtId: courtId.get(r.courtName)!,
        gender: r.gender,
        requiresAssistant: true,
        startTime: r.startTime,
      };
      if (r.matchNo) m.matchNo = r.matchNo;
      if (r.homeTeam) m.homeTeam = r.homeTeam;
      if (r.awayTeam) m.awayTeam = r.awayTeam;
      if (r.matchnamn) m.highlight = true; // §1.5 (label itself has no field on Match)
      roundByTime.get(r.startTime)!.matches.push(m);
    }
    return { index: di, availableCourtIds: [...allCourtIds], availability: {}, rounds, assignments: [] };
  });

  return { referees: [], courts, days };
}

export function parseImport(input: ImportInput): ImportResult {
  const { rows, errors, warnings } = parseRows(input);
  return { tournament: buildTournament(rows), errors, warnings };
}

// --- re-import merge (§1.4) -------------------------------------------------

const courtNameOf = (courts: Tournament["courts"], id: string): string =>
  courts.find((c) => c.id === id)?.name ?? "";

function carryAssignment(a: Assignment, matchId: string, needA: boolean): Assignment {
  return {
    matchId,
    head: { refId: a.head.refId, pinned: a.head.pinned },
    assistant: needA
      ? a.assistant
        ? { refId: a.assistant.refId, pinned: a.assistant.pinned }
        : { refId: null, pinned: false }
      : null,
  };
}

function findOrCreateRound(day: Day, startTime?: string): Round {
  let r = day.rounds.find((rd) => rd.startTime === startTime);
  if (!r) {
    r = { index: day.rounds.length, startTime, matches: [] };
    day.rounds.push(r);
  }
  return r;
}

function ensureIncDay(inc: Tournament, di: number, exDay: Day, finalCourtIds: Set<string>): Day {
  while (inc.days.length <= di) {
    inc.days.push({
      index: inc.days.length,
      availability: exDay.availability,
      availableCourtIds: exDay.availableCourtIds.filter((id) => finalCourtIds.has(id)),
      rounds: [],
      assignments: [],
    });
  }
  return inc.days[di];
}

export function mergeImport(existing: Tournament, input: ImportInput): MergeResult {
  const { rows, errors, warnings } = parseRows(input);
  const inc = buildTournament(rows); // fresh skeleton; deterministic fed ids match existing ones

  // 1. Reuse existing court ids by name; keep courts absent from this import.
  const exCourtByName = new Map(existing.courts.map((c) => [c.name, c]));
  const remap = new Map<string, string>();
  const finalCourts: Tournament["courts"] = [];
  const usedNames = new Set<string>();
  for (const c of inc.courts) {
    const ex = exCourtByName.get(c.name);
    remap.set(c.id, ex ? ex.id : c.id);
    finalCourts.push(ex ?? c);
    usedNames.add(c.name);
  }
  for (const c of existing.courts) if (!usedNames.has(c.name)) finalCourts.push(c);
  const finalCourtIds = new Set(finalCourts.map((c) => c.id));
  for (const day of inc.days) for (const r of day.rounds) for (const m of r.matches) m.courtId = remap.get(m.courtId)!;

  // 2. Index existing IMPORTED matches by merge key (manual matches excluded -> never reconciled).
  interface ExRec { id: string; dayIndex: number; roundIndex: number; court: string; assignment: Assignment | null; label: string; }
  const exByKey = new Map<string, ExRec>();
  existing.days.forEach((day, di) => {
    for (const round of day.rounds)
      for (const m of round.matches) {
        if (!isImported(m.id)) continue;
        const court = courtNameOf(existing.courts, m.courtId);
        exByKey.set(keyOf(m.id, di, round.startTime ?? "", court), {
          id: m.id, dayIndex: di, roundIndex: round.index, court,
          assignment: day.assignments.find((a) => a.matchId === m.id) ?? null,
          label: m.matchNo ?? m.id,
        });
      }
  });

  // 3. Reconcile incoming matches: carry assignments, flag moves, collect additions.
  const seen = new Set<string>();
  const added: string[] = [];
  const moved: string[] = [];
  inc.days.forEach((day, di) => {
    for (const round of day.rounds)
      for (const m of round.matches) {
        const court = courtNameOf(finalCourts, m.courtId);
        const key = keyOf(m.id, di, round.startTime ?? "", court);
        const ex = exByKey.get(key);
        if (!ex) { added.push(m.id); continue; }
        seen.add(key);
        if (ex.assignment) day.assignments.push(carryAssignment(ex.assignment, m.id, m.requiresAssistant));
        if (ex.dayIndex !== di || ex.roundIndex !== round.index || ex.court !== court) moved.push(m.id);
      }
  });

  // 4. Existing imported matches missing from the new file -> removed + warn (never silent).
  const removed: string[] = [];
  for (const [key, ex] of exByKey)
    if (!seen.has(key)) {
      removed.push(ex.id);
      warnings.push(`Match no longer in import: ${ex.label}`);
    }

  // 5. Carry manually-added matches (no Kamp Id) untouched, with their assignments.
  existing.days.forEach((exDay, di) => {
    const incDay = ensureIncDay(inc, di, exDay, finalCourtIds);
    for (const round of exDay.rounds)
      for (const m of round.matches) {
        if (isImported(m.id)) continue;
        findOrCreateRound(incDay, round.startTime).matches.push(m);
        const asg = exDay.assignments.find((a) => a.matchId === m.id);
        if (asg) incDay.assignments.push(asg);
      }
  });

  // 6. Preserve per-day availability / court selection; new courts default-selected.
  const exCourtIds = new Set(existing.courts.map((c) => c.id));
  inc.days.forEach((day, i) => {
    const ex = existing.days[i];
    if (!ex) return;
    day.availability = ex.availability;
    day.availableCourtIds = [
      ...ex.availableCourtIds.filter((id) => finalCourtIds.has(id)),
      ...finalCourts.filter((c) => !exCourtIds.has(c.id)).map((c) => c.id),
    ];
  });

  inc.courts = finalCourts;
  inc.referees = existing.referees; // import never mints referees; roster is preserved
  return { tournament: inc, errors, warnings, added, moved, removed };
}
