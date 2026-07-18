// PROTOTYPE — throwaway TUI shell over the portable solver core. Drive the solver by hand to
// feel the Generate / Reshuffle / pin / override / finalize-day workflow. Line-based commands
// (type + Enter); the whole frame re-renders each action. Run: bun tui.ts  (or: bun run tui)

import readline from "node:readline";
import { makeTournament, type FixtureCfg } from "./src/fixture.ts";
import { emptyCarry, cloneSol, type Sol, type Problem, type Carry } from "./src/types.ts";
import { solve } from "./src/solver.ts";
import { scoreDay, W } from "./src/score.ts";
import { validate, feasibility } from "./src/validate.ts";
import { accumulate } from "./src/carry.ts";

const B = "\x1b[1m";
const D = "\x1b[2m";
const R0 = "\x1b[0m";

let cfg: FixtureCfg = { N: 10, M: 5, R: 10, days: 2, needARate: 0.8, dropRefPerDay: true, seed: 1 };
let days: Problem[] = makeTournament(cfg);
let carry: Carry = emptyCarry(cfg.N);
let dayIdx = 0;
let sol: Sol = freshSol();
let seed = 100;
let last = "";

function freshSol(): Sol {
  const p = days[dayIdx];
  return { head: new Int32Array(p.matches.length).fill(-1), asst: new Int32Array(p.matches.length).fill(-1), headPin: new Uint8Array(p.matches.length), asstPin: new Uint8Array(p.matches.length) };
}

function generate(warm: boolean): void {
  const p = days[dayIdx];
  const t = Date.now();
  const res = solve(p, carry, { budgetMs: 800, seed: seed, warmStart: warm ? sol : undefined });
  sol = res.sol;
  last = `${warm ? "incremental" : "generate"} seed=${seed}: ${res.iters.toLocaleString()} iters, ${Date.now() - t}ms`;
}

function render(): void {
  console.clear();
  const p = days[dayIdx];
  const sc = scoreDay(p, sol, carry);
  const feas = feasibility(p);
  const problems = validate(p, sol);

  console.log(`${B}Referee Scheduler — PROTOTYPE${R0}  ${D}(throwaway; validates greedy+SA)${R0}`);
  console.log(`${B}size${R0} N=${cfg.N} M=${cfg.M} R=${cfg.R}  ${B}day${R0} ${dayIdx + 1}/${cfg.days}  ${B}seed${R0} ${seed}  ${D}${last}${R0}`);
  console.log(`${B}status${R0} ${problems.length === 0 ? "\x1b[32mVALID\x1b[0m" : "\x1b[31mINVALID: " + problems.slice(0, 3).join("; ") + "\x1b[0m"}`);
  console.log("");

  // Grid: rows = rounds, cols = courts. Cell = "H:head A:asst" (ref idx), gender letter, * pinned.
  const idx = new Map<string, number>();
  p.matches.forEach((m, i) => idx.set(`${m.round},${m.court}`, i));
  const head = "round " + Array.from({ length: cfg.M }, (_, c) => `court${c}`.padEnd(14)).join("");
  console.log(`${B}${head}${R0}`);
  for (let rd = 0; rd < cfg.R; rd++) {
    let row = String(rd).padStart(5) + " ";
    for (let c = 0; c < cfg.M; c++) {
      const m = idx.get(`${rd},${c}`);
      if (m === undefined) row += "".padEnd(14);
      else {
        const g = p.matches[m].gender === 0 ? "W" : "M";
        const h = cell(sol.head[m], sol.headPin[m]);
        const a = p.matches[m].needA ? cell(sol.asst[m], sol.asstPin[m]) : "  ";
        row += `${D}${g}${R0}${String(m).padStart(2)}:${h}/${a}`.padEnd(14 + 8);
      }
    }
    console.log(row);
  }
  console.log("");

  // Per-ref cumulative duty (carry + this day) + rest streaks this day.
  const perRef = refStats(p, sol, carry);
  console.log(`${B}ref  Hcum Acum  restViol(day)${R0}`);
  for (let r = 0; r < cfg.N; r++) {
    const avToday = sumAvail(p, r);
    console.log(`${String(r).padStart(3)}  ${String(perRef.H[r]).padStart(4)} ${String(perRef.A[r]).padStart(4)}  ${perRef.rest[r] > 0 ? "\x1b[33m" + perRef.rest[r] + "\x1b[0m" : "0"}   ${D}${avToday === 0 ? "absent today" : ""}${R0}`);
  }
  console.log("");
  console.log(`${B}penalty${R0} total=${fmt(sc.total)}  ${D}rest=${fmt(W.REST * sc.rest)} Hbal=${fmt(W.HBAL * sc.hbal)} Abal=${fmt(W.ABAL * sc.abal)} gender=${fmt(W.GENDER * sc.gender)} pair=${fmt(W.PAIR * sc.pair)} sit=${fmt(W.SIT * sc.sit)} ha=${fmt(W.HA * sc.ha)}${R0}`);
  if (feas.failures.length) console.log(`\x1b[31mFEASIBILITY FAIL: ${feas.failures.join("; ")}\x1b[0m`);
  if (feas.warnings.length) console.log(`${D}warn: ${feas.warnings.slice(0, 2).join("; ")}${feas.warnings.length > 2 ? " …" : ""}${R0}`);
  console.log("");
  console.log(`${B}[g]${R0} generate  ${B}[r]${R0} reshuffle  ${B}[i]${R0} incremental(warm)  ${B}[p M h|a]${R0} toggle pin  ${B}[e M h|a REF]${R0} override`);
  console.log(`${B}[f]${R0} finalize day+advance  ${B}[c N M R D]${R0} reconfigure  ${B}[q]${R0} quit`);
}

function cell(ref: number, pin: number): string {
  const s = ref < 0 ? ".." : String(ref).padStart(2);
  return pin ? `\x1b[36m${s}*\x1b[0m` : `${s} `;
}
function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(0);
}
function sumAvail(p: Problem, r: number): number {
  let s = 0;
  for (let rd = 0; rd < p.R; rd++) s += p.avail[r][rd];
  return s;
}
function refStats(p: Problem, s: Sol, c: Carry) {
  const H = new Float64Array(cfg.N);
  const A = new Float64Array(cfg.N);
  const rest = new Float64Array(cfg.N);
  const duty = new Int8Array(cfg.N * p.R);
  for (let m = 0; m < p.matches.length; m++) {
    const rd = p.matches[m].round;
    if (s.head[m] >= 0) {
      duty[s.head[m] * p.R + rd] = 1;
      H[s.head[m]]++;
    }
    if (p.matches[m].needA && s.asst[m] >= 0) {
      duty[s.asst[m] * p.R + rd] = 2;
      A[s.asst[m]]++;
    }
  }
  for (let r = 0; r < cfg.N; r++) {
    let streak = 0;
    for (let rd = 0; rd < p.R; rd++) {
      if (duty[r * p.R + rd] > 0) streak++;
      else {
        if (streak > 2) rest[r] += (streak - 2) ** 2;
        streak = 0;
      }
    }
    if (streak > 2) rest[r] += (streak - 2) ** 2;
    H[r] += c.H[r];
    A[r] += c.A[r];
  }
  return { H, A, rest };
}

function handle(line: string): boolean {
  const t = line.trim().split(/\s+/);
  const cmd = t[0];
  if (cmd === "q") return false;
  else if (cmd === "g") generate(false);
  else if (cmd === "r") {
    seed++;
    generate(false);
  } else if (cmd === "i") generate(true);
  else if (cmd === "f") {
    carry = accumulate(carry, days[dayIdx], sol);
    dayIdx = Math.min(dayIdx + 1, cfg.days - 1);
    sol = freshSol();
    last = `finalized day; carryover folded`;
  } else if (cmd === "p" || cmd === "e") {
    const m = Number(t[1]);
    const asst = t[2] === "a";
    if (Number.isInteger(m) && m >= 0 && m < days[dayIdx].matches.length) {
      if (cmd === "e") {
        const ref = Number(t[3]);
        if (asst) sol.asst[m] = ref;
        else sol.head[m] = ref;
      }
      if (asst) sol.asstPin[m] ^= 1;
      else sol.headPin[m] ^= 1;
      last = `${cmd === "e" ? "override" : "pin"} match ${m} ${asst ? "asst" : "head"}`;
    }
  } else if (cmd === "c") {
    cfg = { N: +t[1] || cfg.N, M: +t[2] || cfg.M, R: +t[3] || cfg.R, days: +t[4] || cfg.days, needARate: cfg.needARate, dropRefPerDay: true, seed: 1 };
    days = makeTournament(cfg);
    carry = emptyCarry(cfg.N);
    dayIdx = 0;
    sol = freshSol();
    last = `reconfigured`;
  }
  return true;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
render();
rl.on("line", (line) => {
  if (!handle(line)) {
    rl.close();
    return;
  }
  render();
  rl.prompt();
});
