/**
 * Many Hands: the rules, with no DOM. This file is the state machine (Schell Lens #28):
 *
 *   SETUP --begin--> DAWN --wake--> ALLOCATE --sleep (effort 0)--> DUSK --next--> DAWN ... (year < years)
 *                                                                       \--next--> ENDING --reflect--> REFLECT --again--> SETUP
 *
 * Every transition is a pure function. A move that is not legal in the current state throws an
 * InvalidTransition, so the page can never get the game into a state the table does not allow.
 */

export type Phase = "SETUP" | "DAWN" | "ALLOCATE" | "DUSK" | "ENDING" | "REFLECT";
export type Horizon = "within" | "beyond";
export type Spend = "tower" | "hearth";
export type Stone = "many" | "you";

export interface Options {
  /** Can you see the tower, the running total and how far there is to go? */
  counter: boolean;
  /** Do your stones carry your mark, and does a ledger keep them? */
  mark: boolean;
  /** Can the tower be finished within the run, or only long after it? */
  horizon: Horizon;
  /** Do storms sometimes knock the crowd's top stones down? */
  storms: boolean;
}

/** Every tunable number lives here so a balance pass changes one object. */
export const CONFIG = {
  years: 12,
  effort: 3,
  crowdMin: 6,
  crowdMax: 10,
  stormChance: 0.25,
  /** A storm takes this many of the crowd's top stones, drawn between the two. */
  stormLossMin: 1,
  stormLossMax: 2,
  targetWithin: 120,
  targetBeyond: 1200,
  /** The stones the Many lay per year once your run is over, for the epilogue. */
  crowdMean: 8,
  /** The silhouette always has this many slots; a slot stands for target / slots stones. */
  slots: 120,
} as const;

export const DEFAULT_OPTIONS: Options = { counter: true, mark: true, horizon: "within", storms: false };

export interface Dusk {
  /** Stones the Many laid this year. */
  crowd: number;
  /** Stones a storm took from the crowd's top (0 if no storm). */
  stormTook: number;
  /** True if a storm struck, even if it found nothing to take. */
  storm: boolean;
}

export interface State {
  phase: Phase;
  options: Options;
  /** Seed given at begin(); the same seed and the same choices give the same run. */
  seed: number;
  /** Internal generator state, advanced by the dusk draws. */
  rng: number;
  /** 1 to CONFIG.years. */
  year: number;
  /** Efforts left this year. */
  effort: number;
  /** What you spent this year, in order, so Undo can take it back. */
  today: Spend[];
  /** The tower, bottom to top. */
  stones: Stone[];
  warmth: number;
  towerEfforts: number;
  hearthEfforts: number;
  /** What happened at the last dusk. */
  dusk: Dusk | null;
}

export class InvalidTransition extends Error {
  constructor(from: Phase, move: string) {
    super(`Cannot ${move} while in ${from}`);
    this.name = "InvalidTransition";
  }
}

function need(s: State, phase: Phase, move: string): void {
  if (s.phase !== phase) throw new InvalidTransition(s.phase, move);
}

/* ---------- seeded randomness (mulberry32), threaded through the state ---------- */

/** One draw in [0, 1) and the next generator state. */
export function nextRandom(rng: number): [number, number] {
  const a = (rng + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/* ---------- construction and the transitions ---------- */

export function newGame(options: Options = DEFAULT_OPTIONS): State {
  return {
    phase: "SETUP", options: { ...options }, seed: 0, rng: 0,
    year: 1, effort: 0, today: [], stones: [], warmth: 0, towerEfforts: 0, hearthEfforts: 0, dusk: null,
  };
}

/** SETUP and REFLECT are the two places the switches can change. */
export function setOption<K extends keyof Options>(s: State, key: K, value: Options[K]): State {
  if (s.phase !== "SETUP" && s.phase !== "REFLECT") throw new InvalidTransition(s.phase, `change ${key}`);
  return { ...s, options: { ...s.options, [key]: value } };
}

/** SETUP -> DAWN. Starts year 1 and seeds the generator. */
export function begin(s: State, seed: number): State {
  need(s, "SETUP", "begin");
  const seed32 = seed >>> 0;
  return { ...newGame(s.options), phase: "DAWN", seed: seed32, rng: seed32 };
}

/** DAWN -> ALLOCATE with a fresh set of efforts. */
export function wake(s: State): State {
  need(s, "DAWN", "wake");
  return { ...s, phase: "ALLOCATE", effort: CONFIG.effort, today: [], dusk: null };
}

/** ALLOCATE, effort left: lay a stone for the Tower or light a candle at the Hearth. */
export function spend(s: State, where: Spend): State {
  need(s, "ALLOCATE", "spend");
  if (s.effort <= 0) throw new InvalidTransition(s.phase, "spend with no effort left");
  const tower = where === "tower";
  return {
    ...s,
    effort: s.effort - 1,
    today: [...s.today, where],
    stones: tower ? [...s.stones, "you"] : s.stones,
    warmth: tower ? s.warmth : s.warmth + 1,
    towerEfforts: s.towerEfforts + (tower ? 1 : 0),
    hearthEfforts: s.hearthEfforts + (tower ? 0 : 1),
  };
}

/** ALLOCATE: take back the last effort spent this year. */
export function undo(s: State): State {
  need(s, "ALLOCATE", "undo");
  const last = s.today[s.today.length - 1];
  if (!last) throw new InvalidTransition(s.phase, "undo with nothing spent");
  const tower = last === "tower";
  return {
    ...s,
    effort: s.effort + 1,
    today: s.today.slice(0, -1),
    stones: tower ? s.stones.slice(0, -1) : s.stones,
    warmth: tower ? s.warmth : s.warmth - 1,
    towerEfforts: s.towerEfforts - (tower ? 1 : 0),
    hearthEfforts: s.hearthEfforts - (tower ? 0 : 1),
  };
}

/** Remove up to `count` of the crowd's topmost stones. Yours are never singled out. */
export function stormTake(stones: Stone[], count: number): { stones: Stone[]; took: number } {
  const out = stones.slice();
  let took = 0;
  for (let i = out.length - 1; i >= 0 && took < count; i--) {
    if (out[i] === "many") {
      out.splice(i, 1);
      took++;
    }
  }
  return { stones: out, took };
}

/** ALLOCATE -> DUSK, only when effort is 0. The world answers: the Many lay stones, a storm may strike. */
export function sleep(s: State): State {
  need(s, "ALLOCATE", "sleep");
  if (s.effort !== 0) throw new InvalidTransition(s.phase, "sleep with effort left");
  let rng = s.rng;
  let draw: number;
  [draw, rng] = nextRandom(rng);
  const crowd = CONFIG.crowdMin + Math.floor(draw * (CONFIG.crowdMax - CONFIG.crowdMin + 1));
  let stones: Stone[] = [...s.stones, ...Array<Stone>(crowd).fill("many")];
  let storm = false;
  let stormTook = 0;
  if (s.options.storms) {
    [draw, rng] = nextRandom(rng);
    if (draw < CONFIG.stormChance) {
      storm = true;
      [draw, rng] = nextRandom(rng);
      const loss = CONFIG.stormLossMin + Math.floor(draw * (CONFIG.stormLossMax - CONFIG.stormLossMin + 1));
      const hit = stormTake(stones, loss);
      stones = hit.stones;
      stormTook = hit.took;
    }
  }
  return { ...s, phase: "DUSK", rng, stones, dusk: { crowd, storm, stormTook } };
}

/** DUSK -> DAWN of the next year, or ENDING after the last. */
export function next(s: State): State {
  need(s, "DUSK", "continue");
  if (s.year >= CONFIG.years) return { ...s, phase: "ENDING" };
  return { ...s, phase: "DAWN", year: s.year + 1, today: [] };
}

/** ENDING -> REFLECT. */
export function reflect(s: State): State {
  need(s, "ENDING", "reflect");
  return { ...s, phase: "REFLECT" };
}

/** REFLECT -> SETUP, switches kept. */
export function playAgain(s: State): State {
  need(s, "REFLECT", "play again");
  return newGame(s.options);
}

/* ---------- reading the state ---------- */

export function targetFor(options: Options): number {
  return options.horizon === "within" ? CONFIG.targetWithin : CONFIG.targetBeyond;
}

/** Stones per drawn slot: 1 in the short tower, 10 in the tall one. */
export function stonesPerSlot(options: Options): number {
  return targetFor(options) / CONFIG.slots;
}

export function finished(s: State): boolean {
  return s.stones.length >= targetFor(s.options);
}

/** Years of the Many's work still needed after the run, at their usual pace. 0 if the tower already stands. */
export function epilogueYears(s: State): number {
  const left = targetFor(s.options) - s.stones.length;
  const pace = CONFIG.crowdMean - (s.options.storms ? CONFIG.stormChance * (CONFIG.stormLossMin + CONFIG.stormLossMax) / 2 : 0);
  return left <= 0 ? 0 : Math.ceil(left / pace);
}

/** What the player may read off the tower. With the counter hidden there is nothing to read. */
export function readout(s: State): { stones: number; target: number; toGo: number } | null {
  if (!s.options.counter) return null;
  const target = targetFor(s.options);
  return { stones: s.stones.length, target, toGo: Math.max(0, target - s.stones.length) };
}

/** How many of your stones the ledger lists. Zero when your mark is off: every stone is the same. */
export function ledger(s: State): number {
  return s.options.mark ? s.stones.filter((x) => x === "you").length : 0;
}

/** For each drawn slot of the tower, bottom to top: empty, a crowd stone, or one carrying your mark. */
export function slotsOf(s: State): Array<"empty" | "many" | "you"> {
  const per = stonesPerSlot(s.options);
  const out: Array<"empty" | "many" | "you"> = [];
  for (let slot = 0; slot < CONFIG.slots; slot++) {
    const chunk = s.stones.slice(slot * per, slot * per + per);
    if (chunk.length === 0) out.push("empty");
    else out.push(s.options.mark && chunk.includes("you") ? "you" : "many");
  }
  return out;
}

export interface RunRecord {
  options: Options;
  towerEfforts: number;
  hearthEfforts: number;
  warmth: number;
  stones: number;
  target: number;
  finished: boolean;
  /** Share of your efforts that went to the Tower, 0 to 1. */
  share: number;
}

export function summary(s: State): RunRecord {
  const spent = s.towerEfforts + s.hearthEfforts;
  return {
    options: s.options, towerEfforts: s.towerEfforts, hearthEfforts: s.hearthEfforts, warmth: s.warmth,
    stones: s.stones.length, target: targetFor(s.options), finished: finished(s), share: spent === 0 ? 0 : s.towerEfforts / spent,
  };
}

/** Play a whole run with a fixed number of each year's efforts going to the Tower. Used by tests and tuning. */
export function simulate(options: Options, seed: number, towerPerYear: number): State {
  let s = begin(newGame(options), seed);
  while (s.phase !== "ENDING") {
    s = wake(s);
    for (let i = 0; i < CONFIG.effort; i++) s = spend(s, i < towerPerYear ? "tower" : "hearth");
    s = next(sleep(s));
  }
  return s;
}
