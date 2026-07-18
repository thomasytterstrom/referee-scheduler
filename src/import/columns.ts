// Swedish federation-export header normalization + column map (persistence-spec.md §1.2).
// Header matching mirrors mod_Input.NormHeader (strip NBSP/zero-width/BOM, tabs/CR/LF -> space,
// trim); the required-column check hard-errors naming the missing column (like mod_Input.ReqHeader).

export function normHeader(s: string): string {
  return s
    .replace(/ /g, " ") // NBSP -> space
    .replace(/[​﻿]/g, "") // zero-width space / BOM -> removed
    .replace(/[\t\r\n]/g, " ") // tab/CR/LF -> space
    .trim();
}

// Column indices into a parsed row. Required four are always numbers; the rest are null when the
// export omits that column (unknown headers are ignored, never fatal).
export interface ColumnMap {
  datum: number;
  starttid: number;
  spelplats: number;
  klass: number;
  kampNr: number | null;
  kampId: number | null;
  matchnamn: number | null;
  hemmalag: number | null;
  bortalag: number | null;
}

export function mapColumns(headerRow: readonly unknown[]): ColumnMap {
  const idx = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const n = normHeader(String(h ?? ""));
    if (n && !idx.has(n)) idx.set(n, i);
  });
  const req = (name: string): number => {
    const i = idx.get(name);
    if (i === undefined) throw new Error(`Missing required column: "${name}"`);
    return i;
  };
  const opt = (name: string): number | null => idx.get(name) ?? null;
  return {
    datum: req("Datum"),
    starttid: req("Starttid"),
    spelplats: req("Spelplats"),
    klass: req("Klass"),
    kampNr: opt("Kamp nr"),
    kampId: opt("Kamp Id"),
    matchnamn: opt("Matchnamn"),
    hemmalag: opt("Hemmalag"),
    bortalag: opt("Bortalag"),
  };
}
