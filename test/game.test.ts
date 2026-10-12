import { describe, expect, it } from "vitest";
import {
  begin, CONFIG, DEFAULT_OPTIONS, epilogueYears, finished, InvalidTransition, ledger, newGame, next, nextRandom, playAgain,
  readout, reflect, setOption, simulate, sleep, slotsOf, spend, stormTake, summary, targetFor, undo, wake,
  type Options, type State,
} from "../src/game";
import { dynamicsFor, SOURCES } from "../src/sources";

function allocate(options: Options = DEFAULT_OPTIONS, seed = 7): State {
  return wake(begin(newGame(options), seed));
}
function spendAll(s: State, where: "tower" | "hearth" = "tower"): State {
  while (s.effort > 0) s = spend(s, where);
  return s;
}

describe("Many Hands state machine", () => {
  it("walks SETUP -> DAWN -> ALLOCATE -> DUSK -> DAWN and on through the last year to ENDING and REFLECT", () => {
    let s = newGame();
    expect(s.phase).toBe("SETUP");
    s = begin(s, 1);
    expect(s.phase).toBe("DAWN");
    expect(s.year).toBe(1);
    s = wake(s);
    expect(s.phase).toBe("ALLOCATE");
    expect(s.effort).toBe(CONFIG.effort);
    s = sleep(spendAll(s));
    expect(s.phase).toBe("DUSK");
    s = next(s);
    expect(s.phase).toBe("DAWN");
    expect(s.year).toBe(2);
    const done = simulate(DEFAULT_OPTIONS, 1, 3);
    expect(done.phase).toBe("ENDING");
    expect(done.year).toBe(CONFIG.years);
    const r = reflect(done);
    expect(r.phase).toBe("REFLECT");
    expect(playAgain(r).phase).toBe("SETUP");
  });

  it("rejects every move that is not legal in the current state", () => {
    const setup = newGame();
    const dawn = begin(setup, 1);
    const alloc = wake(dawn);
    const dusk = sleep(spendAll(alloc));
    const ending = simulate(DEFAULT_OPTIONS, 1, 2);
    const refl = reflect(ending);
    const bad: Array<[string, () => unknown]> = [
      ["wake in SETUP", () => wake(setup)],
      ["spend in SETUP", () => spend(setup, "tower")],
      ["sleep in SETUP", () => sleep(setup)],
      ["begin in DAWN", () => begin(dawn, 1)],
      ["spend in DAWN", () => spend(dawn, "tower")],
      ["sleep in DAWN", () => sleep(dawn)],
      ["undo in DAWN", () => undo(dawn)],
      ["next in DAWN", () => next(dawn)],
      ["wake in ALLOCATE", () => wake(alloc)],
      ["next in ALLOCATE", () => next(alloc)],
      ["sleep with effort left", () => sleep(alloc)],
      ["undo with nothing spent", () => undo(alloc)],
      ["spend in DUSK", () => spend(dusk, "tower")],
      ["undo in DUSK", () => undo(dusk)],
      ["sleep in DUSK", () => sleep(dusk)],
      ["reflect in DUSK", () => reflect(dusk)],
      ["next in ENDING", () => next(ending)],
      ["playAgain in ENDING", () => playAgain(ending)],
      ["setOption in ENDING", () => setOption(ending, "storms", true)],
      ["setOption in ALLOCATE", () => setOption(alloc, "counter", false)],
      ["begin in REFLECT", () => begin(refl, 1)],
      ["reflect in REFLECT", () => reflect(refl)],
    ];
    for (const [name, move] of bad) expect(move, name).toThrow(InvalidTransition);
  });

  it("refuses a fourth effort in a year", () => {
    const s = spendAll(allocate());
    expect(s.effort).toBe(0);
    expect(() => spend(s, "hearth")).toThrow(InvalidTransition);
  });

  it("lets the switches change in SETUP and REFLECT only, and keeps them through play again", () => {
    let s = setOption(newGame(), "horizon", "beyond");
    expect(s.options.horizon).toBe("beyond");
    const refl = reflect(simulate(s.options, 3, 1));
    s = setOption(refl, "storms", true);
    expect(playAgain(s).options).toEqual({ ...DEFAULT_OPTIONS, horizon: "beyond", storms: true });
  });

  it("keeps the pure functions pure: the old state is never changed", () => {
    const a = allocate();
    const frozen = JSON.stringify(a);
    spend(a, "tower");
    expect(JSON.stringify(a)).toBe(frozen);
  });
});

describe("spending and undo", () => {
  it("a Tower effort lays one of your stones and a Hearth effort lights one candle", () => {
    let s = allocate();
    s = spend(s, "tower");
    expect(s.stones).toEqual(["you"]);
    expect(s.warmth).toBe(0);
    s = spend(s, "hearth");
    expect(s.warmth).toBe(1);
    expect(s.stones).toEqual(["you"]);
    expect(s.effort).toBe(1);
    expect([s.towerEfforts, s.hearthEfforts]).toEqual([1, 1]);
  });

  it("undo takes back the last effort exactly, back to the start of the year", () => {
    const start = allocate();
    let s = spend(spend(spend(start, "tower"), "hearth"), "tower");
    s = undo(undo(undo(s)));
    expect(s).toEqual(start);
    expect(() => undo(s)).toThrow(InvalidTransition);
  });

  it("cannot undo yesterday: Undo is cleared when the day changes", () => {
    let s = sleep(spendAll(allocate()));
    s = wake(next(s));
    expect(s.today).toEqual([]);
    expect(() => undo(s)).toThrow(InvalidTransition);
  });
});

describe("dusk, the crowd and the storms", () => {
  it("the Many lay 6 to 10 stones a year, and 8 on average", () => {
    let total = 0;
    let min = 99;
    let max = 0;
    let n = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const s = simulate(DEFAULT_OPTIONS, seed, 0);
      expect(s.stones.length).toBeGreaterThanOrEqual(CONFIG.crowdMin * CONFIG.years);
      expect(s.stones.length).toBeLessThanOrEqual(CONFIG.crowdMax * CONFIG.years);
      total += s.stones.length;
      n++;
    }
    for (let seed = 1; seed <= 50; seed++) {
      const dusk = sleep(spendAll(allocate(DEFAULT_OPTIONS, seed), "hearth"));
      min = Math.min(min, dusk.dusk!.crowd);
      max = Math.max(max, dusk.dusk!.crowd);
    }
    expect(min).toBeGreaterThanOrEqual(6);
    expect(max).toBeLessThanOrEqual(10);
    expect(total / n / CONFIG.years).toBeGreaterThan(7.6);
    expect(total / n / CONFIG.years).toBeLessThan(8.4);
  });

  it("is deterministic: the same seed and choices give the same run, and different seeds differ", () => {
    const a = simulate({ ...DEFAULT_OPTIONS, storms: true }, 42, 2);
    const b = simulate({ ...DEFAULT_OPTIONS, storms: true }, 42, 2);
    const c = simulate({ ...DEFAULT_OPTIONS, storms: true }, 43, 2);
    expect(a).toEqual(b);
    expect(a.stones).not.toEqual(c.stones);
    const [x, r1] = nextRandom(5);
    const [y, r2] = nextRandom(5);
    expect([x, r1]).toEqual([y, r2]);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(1);
  });

  it("storms off: no storm ever happens", () => {
    for (let seed = 1; seed <= 40; seed++) expect(simulate({ ...DEFAULT_OPTIONS, storms: false }, seed, 1).stones.length).toBeGreaterThan(0);
    let s = allocate({ ...DEFAULT_OPTIONS, storms: false }, 3);
    for (let i = 0; i < CONFIG.years; i++) {
      s = sleep(spendAll(s, "hearth"));
      expect(s.dusk!.storm).toBe(false);
      if (i < CONFIG.years - 1) s = wake(next(s));
    }
  });

  it("storms on: a storm strikes about a quarter of years and takes 1 or 2 of the crowd's stones", () => {
    let storms = 0;
    let years = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let s = allocate({ ...DEFAULT_OPTIONS, storms: true }, seed);
      for (let i = 0; i < CONFIG.years; i++) {
        const before = s.stones.length;
        s = sleep(spendAll(s, "hearth"));
        years++;
        if (s.dusk!.storm) {
          storms++;
          expect(s.dusk!.stormTook).toBeGreaterThanOrEqual(CONFIG.stormLossMin);
          expect(s.dusk!.stormTook).toBeLessThanOrEqual(CONFIG.stormLossMax);
          expect(s.stones.length).toBe(before + s.dusk!.crowd - s.dusk!.stormTook);
        } else {
          expect(s.stones.length).toBe(before + s.dusk!.crowd);
        }
        if (i < CONFIG.years - 1) s = wake(next(s));
      }
    }
    expect(storms / years).toBeGreaterThan(0.18);
    expect(storms / years).toBeLessThan(0.32);
  });

  it("a storm takes the crowd's topmost stones, never yours, and never goes below zero", () => {
    const hit = stormTake(["many", "you", "many", "many", "you"], 4);
    expect(hit.took).toBe(3);
    expect(hit.stones).toEqual(["you", "you"]);
    expect(stormTake([], 4)).toEqual({ stones: [], took: 0 });
    expect(stormTake(["you", "you"], 4).stones).toEqual(["you", "you"]);
    const top = stormTake(["many", "many", "many", "many", "many", "you"], 4);
    expect(top.stones).toEqual(["many", "you"]);
  });
});

describe("what each switch changes", () => {
  it("horizon sets the target: 120 within, 1200 beyond", () => {
    expect(targetFor({ ...DEFAULT_OPTIONS, horizon: "within" })).toBe(120);
    expect(targetFor({ ...DEFAULT_OPTIONS, horizon: "beyond" })).toBe(1200);
  });

  it("within a lifetime, the crowd alone falls short and about two-thirds of your efforts finish it (storms off)", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(finished(simulate(DEFAULT_OPTIONS, seed, 0)), "crowd alone").toBe(false);
    }
    let finishedAll = 0;
    let finishedNone = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (finished(simulate(DEFAULT_OPTIONS, seed, 3))) finishedAll++;
      if (finished(simulate(DEFAULT_OPTIONS, seed, 0))) finishedNone++;
    }
    expect(finishedAll).toBeGreaterThanOrEqual(95);
    expect(finishedNone).toBe(0);
    // Two of three efforts to the Tower (24 of 36) reaches about 120 on average.
    let reached = 0;
    for (let seed = 1; seed <= 200; seed++) if (finished(simulate(DEFAULT_OPTIONS, seed, 2))) reached++;
    expect(reached / 200).toBeGreaterThan(0.35);
    expect(reached / 200).toBeLessThan(0.85);
  });

  it("beyond a lifetime, even giving everything leaves the tower unfinished, and the epilogue says for how long", () => {
    const beyond = { ...DEFAULT_OPTIONS, horizon: "beyond" as const };
    const s = simulate(beyond, 9, 3);
    expect(finished(s)).toBe(false);
    expect(s.stones.length).toBeLessThan(200);
    expect(epilogueYears(s)).toBe(Math.ceil((1200 - s.stones.length) / CONFIG.crowdMean));
    const stormy = simulate({ ...beyond, storms: true }, 9, 3);
    expect(epilogueYears(stormy)).toBeGreaterThan(Math.ceil((1200 - stormy.stones.length) / CONFIG.crowdMean));
    expect(epilogueYears(s)).toBeGreaterThan(100);
    expect(epilogueYears(simulate(DEFAULT_OPTIONS, 9, 3))).toBe(0);
  });

  it("counter hidden: nothing to read off the tower; counter visible: stones, target and stones to go", () => {
    const seen = spendAll(allocate({ ...DEFAULT_OPTIONS, counter: true }));
    expect(readout(seen)).toEqual({ stones: 3, target: 120, toGo: 117 });
    const fog = spendAll(allocate({ ...DEFAULT_OPTIONS, counter: false }));
    expect(readout(fog)).toBeNull();
    // The truth underneath is unchanged by the switch.
    expect(fog.stones.length).toBe(seen.stones.length);
  });

  it("mark on: your stones are marked and the ledger lists them; mark off: all stones look alike and the ledger is empty", () => {
    const on = sleep(spendAll(allocate({ ...DEFAULT_OPTIONS, mark: true })));
    expect(ledger(on)).toBe(3);
    expect(slotsOf(on).filter((x) => x === "you")).toHaveLength(3);
    const off = sleep(spendAll(allocate({ ...DEFAULT_OPTIONS, mark: false })));
    expect(ledger(off)).toBe(0);
    expect(slotsOf(off).filter((x) => x === "you")).toHaveLength(0);
    expect(slotsOf(off).filter((x) => x === "many")).toHaveLength(off.stones.length);
  });

  it("the tall tower draws ten stones to a slot, so a year's work barely shows", () => {
    const s = sleep(spendAll(allocate({ ...DEFAULT_OPTIONS, horizon: "beyond" })));
    expect(slotsOf(s).filter((x) => x !== "empty")).toHaveLength(Math.ceil(s.stones.length / 10));
  });
});

describe("balance bands (seeded, 3000 runs each)", () => {
  const rate = (options: Options, towerPerYear: number) => {
    let won = 0;
    for (let seed = 1; seed <= 3000; seed++) if (finished(simulate(options, seed, towerPerYear))) won++;
    return won / 3000;
  };
  it("within a lifetime, no storms: all-Tower nearly always wins, two thirds to the Tower about half the time", () => {
    expect(rate(DEFAULT_OPTIONS, 3)).toBeGreaterThan(0.97);
    expect(rate(DEFAULT_OPTIONS, 2)).toBeGreaterThan(0.45);
    expect(rate(DEFAULT_OPTIONS, 2)).toBeLessThan(0.65);
  });
  it("within a lifetime, storms on: all-Tower wins 85 to 95%, two thirds to the Tower 15 to 35%", () => {
    const stormy = { ...DEFAULT_OPTIONS, storms: true };
    expect(rate(stormy, 3)).toBeGreaterThan(0.85);
    expect(rate(stormy, 3)).toBeLessThan(0.95);
    expect(rate(stormy, 2)).toBeGreaterThan(0.15);
    expect(rate(stormy, 2)).toBeLessThan(0.35);
    expect(rate(stormy, 1)).toBeLessThan(0.02);
  });
  it("beyond a lifetime nothing wins, by design", () => {
    expect(rate({ ...DEFAULT_OPTIONS, horizon: "beyond", storms: true }, 3)).toBe(0);
  });
});

describe("summary and the runs table", () => {
  it("reports your share of efforts to the Tower and the hearth's warmth", () => {
    let s = begin(newGame(), 5);
    for (let y = 0; y < CONFIG.years; y++) {
      s = wake(s);
      s = spend(spend(spend(s, y < 6 ? "tower" : "hearth"), "tower"), "hearth");
      s = next(sleep(s));
    }
    const r = summary(s);
    expect(r.towerEfforts).toBe(18);
    expect(r.hearthEfforts).toBe(18);
    expect(r.share).toBe(0.5);
    expect(r.warmth).toBe(18);
    expect(r.target).toBe(120);
    expect(r.finished).toBe(false);
  });

  it("share is 0 for a run with nothing spent, not NaN", () => {
    expect(summary(newGame()).share).toBe(0);
  });
});

describe("Many Hands sources", () => {
  it("lists the sources for the switches in use, and says what is missing where a switch is off", () => {
    const on = dynamicsFor({ counter: true, mark: true, horizon: "within", storms: true });
    expect(on).toContain(SOURCES.collective);
    expect(on).toContain(SOURCES.record);
    expect(on).toContain(SOURCES.drain);
    expect(on).toContain(SOURCES.reversals);
    const off = dynamicsFor({ counter: false, mark: false, horizon: "beyond", storms: false }).join("\n");
    expect(off).toContain("counter hidden");
    expect(off).toContain("mark off");
    expect(off).toContain(SOURCES.awe);
    expect(off).not.toContain(SOURCES.reversals);
  });
});
