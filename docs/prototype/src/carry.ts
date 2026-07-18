// PROTOTYPE — throwaway shell, PORTABLE core. Fold a finalized day into cumulative carryover.
// Carryover is derived live from finalized days' assignments (domain-model.md: assignments are
// the single source of truth). This accumulates one finalized day into an existing Carry.

import type { Problem, Sol, Carry } from "./types.ts";
import { emptyCarry } from "./types.ts";

export function accumulate(base: Carry, p: Problem, s: Sol): Carry {
  const N = base.N;
  const c = clone(base);

  for (let r = 0; r < N; r++) {
    let av = 0;
    for (let rd = 0; rd < p.R; rd++) av += p.avail[r][rd];
    c.avail[r] += av;
  }

  for (let m = 0; m < p.matches.length; m++) {
    const mt = p.matches[m];
    const h = s.head[m];
    const a = s.asst[m];
    if (h >= 0) {
      c.H[h]++;
      c.totalHead++;
      if (mt.gender === 0) {
        c.HW[h]++;
        c.totalHW++;
      } else {
        c.HM[h]++;
        c.totalHM++;
      }
    }
    if (mt.needA && a >= 0) {
      c.A[a]++;
      c.totalAsst++;
      if (mt.gender === 0) {
        c.AW[a]++;
        c.totalAW++;
      } else {
        c.AM[a]++;
        c.totalAM++;
      }
    }
    if (mt.needA && h >= 0 && a >= 0) {
      c.P++;
      c.po[h * N + a]++;
      const lo = h < a ? h : a;
      const hi = h < a ? a : h;
      c.pu[lo * N + hi]++;
    }
  }
  return c;
}

function clone(c: Carry): Carry {
  const out = emptyCarry(c.N);
  out.H.set(c.H);
  out.A.set(c.A);
  out.HW.set(c.HW);
  out.HM.set(c.HM);
  out.AW.set(c.AW);
  out.AM.set(c.AM);
  out.avail.set(c.avail);
  out.pu.set(c.pu);
  out.po.set(c.po);
  out.totalHead = c.totalHead;
  out.totalAsst = c.totalAsst;
  out.totalHW = c.totalHW;
  out.totalHM = c.totalHM;
  out.totalAW = c.totalAW;
  out.totalAM = c.totalAM;
  out.P = c.P;
  return out;
}
