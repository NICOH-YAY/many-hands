// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { manyHands, ROWS } from "../src/index";
import { CONFIG } from "../src/game";
import { SOURCES } from "../src/sources";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setup() {
  const el = document.createElement("div");
  document.body.append(el);
  const unmount = manyHands.mount(el);
  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const act = (name: string) => q<HTMLButtonElement>(`[data-act='${name}']`);
  const phase = () => q(".mh").getAttribute("data-phase");
  const key = (k: string, target: EventTarget = document) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const toggle = (mechanic: string, value?: string) => {
    const input = value ? q<HTMLInputElement>(`[data-mechanic='${mechanic}'][value='${value}']`) : q<HTMLInputElement>(`[data-mechanic='${mechanic}']`);
    input.click();
  };
  /** Play one full year with the given number of Tower efforts. */
  const year = (tower: number) => {
    act("continue").click();
    for (let i = 0; i < CONFIG.effort; i++) act(i < tower ? "tower" : "hearth").click();
    act("sleep").click();
  };
  return { el, unmount, q, act, phase, key, toggle, year };
}

describe("Many Hands on the page", () => {
  it("the drawn tower has one rect per slot", () => {
    expect(ROWS.reduce((a, b) => a + b, 0)).toBe(CONFIG.slots);
    const { el, unmount } = setup();
    expect(el.querySelectorAll(".mh-stone")).toHaveLength(CONFIG.slots);
    unmount();
  });

  it("starts in SETUP with all four mechanic switches, and Begin starts year 1", () => {
    const { q, el, act, phase, unmount } = setup();
    expect(phase()).toBe("SETUP");
    const mechanics = new Set([...el.querySelectorAll("[data-mechanic]")].map((n) => n.getAttribute("data-mechanic")));
    expect(mechanics).toEqual(new Set(["counter", "service-record", "horizon", "storms"]));
    act("begin").click();
    expect(phase()).toBe("DAWN");
    expect(q(".mh-year").textContent).toBe("Year 1 of 12");
    unmount();
  });

  it("lays a stone and lights a candle with taps, and Undo takes the last one back", () => {
    const { q, el, act, unmount } = setup();
    act("begin").click();
    act("continue").click();
    act("tower").click();
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(1);
    expect(q("[data-ledger]").textContent).toContain("1 stone carries your mark");
    act("hearth").click();
    expect(el.querySelectorAll(".mh-candle.lit")).toHaveLength(1);
    expect(q("[data-warmth]").textContent).toBe("Hearth warmth 1");
    expect(el.querySelectorAll(".mh-pip.on")).toHaveLength(1);
    act("undo").click();
    expect(el.querySelectorAll(".mh-candle.lit")).toHaveLength(0);
    act("undo").click();
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(0);
    expect(el.querySelectorAll(".mh-pip.on")).toHaveLength(3);
    unmount();
  });

  it("will not sleep with efforts left, and will not spend a fourth", () => {
    const { q, el, act, phase, unmount } = setup();
    act("begin").click();
    act("continue").click();
    act("tower").click();
    expect(act("sleep").getAttribute("aria-disabled")).toBe("true");
    act("sleep").click();
    expect(phase()).toBe("ALLOCATE");
    act("tower").click();
    act("tower").click();
    expect(act("tower").getAttribute("aria-disabled")).toBe("true");
    act("tower").click();
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(3);
    expect(act("sleep").getAttribute("aria-disabled")).toBe("false");
    act("sleep").click();
    expect(phase()).toBe("DUSK");
    expect(q("[data-story]").textContent).toContain("The Many laid");
    unmount();
  });

  it("plays by keyboard: T and H spend, Backspace undoes, Enter advances", () => {
    const { el, key, phase, unmount } = setup();
    key("Enter");
    expect(phase()).toBe("DAWN");
    key("Enter");
    expect(phase()).toBe("ALLOCATE");
    key("t");
    key("H");
    key("1");
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(2);
    expect(el.querySelectorAll(".mh-candle.lit")).toHaveLength(1);
    key("Backspace");
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(1);
    key("2");
    key("ArrowRight");
    key("Enter");
    expect(phase()).toBe("DUSK");
    key("t"); // not legal at dusk; ignored
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(1);
    key("Enter");
    expect(phase()).toBe("DAWN");
    unmount();
  });

  it("moves focus to the button that can act: Tower first, Sleep once the efforts are spent", () => {
    const { act, unmount } = setup();
    act("begin").click();
    act("continue").click();
    expect(document.activeElement).toBe(act("tower"));
    act("tower").click();
    act("hearth").click();
    act("tower").click();
    expect(document.activeElement).toBe(act("sleep"));
    act("sleep").click();
    expect(document.activeElement).toBe(act("continue"));
    unmount();
  });

  it("ignores held-key repeats so holding Enter cannot play whole years", () => {
    const { act, el, phase, unmount } = setup();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true }));
    expect(phase()).toBe("SETUP");
    const btn = act("begin");
    const held = new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true });
    btn.dispatchEvent(held);
    expect(held.defaultPrevented).toBe(true);
    const first = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    btn.dispatchEvent(first);
    expect(first.defaultPrevented).toBe(false);
    act("begin").click();
    act("continue").click();
    for (const k of ["t", "t", "t"]) document.dispatchEvent(new KeyboardEvent("keydown", { key: k, repeat: true, bubbles: true }));
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(0);
    unmount();
  });

  it("keeps the runs table inside the phone width: grid columns are minmax(0, 1fr) and the table scrolls in its own wrapper", () => {
    const css = readFileSync("src/many-hands.css", "utf8");
    const body = (sel: string) => { const i = css.indexOf(sel + " {"); return css.slice(i, css.indexOf("}", i)); };
    expect(body(".mh")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(body(".mh-top")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(body(".mh-table-wrap")).toContain("overflow-x: auto");
    expect(css).toContain(".mh > * { min-width: 0; }");
  });

  it("pluralizes the ending, hides the unfinished prompt after a win, and puts Play again below the questions", () => {
    const { q, el, act, year, unmount } = setup();
    act("begin").click();
    for (let y = 0; y < CONFIG.years; y++) { year(3); act("continue").click(); }
    act("continue").click();
    expect(q("[data-story]").textContent).toContain("Your Hearth burned 0 candles.");
    expect(q<HTMLElement>("[data-unfinished]").hidden).toBe(true);
    const reflect = q(".mh-reflect");
    const again = q(".mh-again");
    expect(reflect.compareDocumentPosition(again) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(el.contains(act("again"))).toBe(true);
    unmount();
  });

  it("Enter on a focused button does not advance twice", () => {
    const { act, phase, key, unmount } = setup();
    const begin = act("begin");
    begin.focus();
    key("Enter", begin); // the browser's own click handles a real Enter on a button
    expect(phase()).toBe("SETUP");
    begin.click();
    expect(phase()).toBe("DAWN");
    unmount();
  });

  it("plays a whole run to REFLECT, records it, and replays with the switches kept", () => {
    const { q, el, act, phase, toggle, year, unmount } = setup();
    toggle("horizon", "beyond");
    act("begin").click();
    for (let y = 0; y < CONFIG.years; y++) {
      year(2);
      act("continue").click();
    }
    expect(phase()).toBe("ENDING");
    expect(q("[data-story]").textContent).toContain("foundation");
    act("continue").click();
    expect(phase()).toBe("REFLECT");
    expect(q<HTMLElement>(".mh-reflect").hidden).toBe(false);
    expect(q(".mh-reflect").textContent).toContain("What did you feel");
    expect(q(".mh-reflect").querySelector("input, textarea, select")).toBeNull();
    expect(el.querySelectorAll(".mh-runs tbody tr")).toHaveLength(1);
    expect(q(".mh-runs tbody tr").textContent).toContain("24 of 36");
    expect(q<HTMLInputElement>("[data-mechanic='horizon'][value='beyond']").checked).toBe(true);
    act("again").click();
    expect(phase()).toBe("DAWN");
    expect(q("[data-readout]").textContent).toContain("1,200");
    unmount();
  });

  it("the counter switch changes what you can read: fog and question marks when hidden", () => {
    const { q, act, unmount } = setup();
    act("begin").click();
    act("continue").click();
    act("tower").click();
    expect(q("[data-readout]").textContent).toBe("1 of 120 stones · 119 to go");
    expect(q(".mh-scene").getAttribute("data-fog")).toBe("false");
    unmount();
    const second = setup();
    second.toggle("counter");
    second.act("begin").click();
    second.act("continue").click();
    second.act("tower").click();
    expect(second.q("[data-readout]").textContent).toContain("?");
    expect(second.q(".mh-scene").getAttribute("data-fog")).toBe("true");
    expect(second.q("[data-ledger]").textContent).toContain("Ledger");
    second.unmount();
  });

  it("the service-record switch changes whether your stones are marked", () => {
    const { el, act, toggle, unmount } = setup();
    toggle("service-record");
    act("begin").click();
    act("continue").click();
    act("tower").click();
    expect(el.querySelectorAll(".mh-stone.you")).toHaveLength(0);
    expect(el.querySelector("[data-ledger]")!.textContent).toBe("");
    unmount();
  });

  it("with storms on, a storm (when it comes) is told at dusk", () => {
    // Force every draw low so a storm always strikes.
    vi.spyOn(Date, "now").mockReturnValue(0);
    vi.spyOn(Math, "random").mockReturnValue(0);
    const { q, act, toggle, year, unmount } = setup();
    toggle("storms");
    act("begin").click();
    let stormSeen = false;
    for (let y = 0; y < CONFIG.years && !stormSeen; y++) {
      year(0);
      stormSeen = q("[data-story]").textContent!.includes("A storm");
      if (!stormSeen) act("continue").click();
    }
    expect(stormSeen).toBe(true);
    expect(q(".mh-scene").getAttribute("data-storm")).toBe("true");
    unmount();
  });

  it("is an aria-live region and says plainly that the crowd is simulated", () => {
    const { q, el, unmount } = setup();
    expect(q("[data-story]").getAttribute("aria-live")).toBe("polite");
    expect(el.textContent).toContain("simulated by this page");
    unmount();
  });

  it("cleans up everything: el is emptied, the key listener is gone, and the game starts no timers of its own", () => {
    vi.useFakeTimers();
    const timers = vi.spyOn(globalThis, "setTimeout");
    const { el, unmount, key, phase } = setup();
    const remove = vi.spyOn(document, "removeEventListener");
    expect(vi.getTimerCount()).toBe(0);
    key("Enter");
    expect(phase()).toBe("DAWN");
    unmount();
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(el.childNodes.length).toBe(0);
    expect(timers).not.toHaveBeenCalled();
    key("Enter"); // nothing left to hear it
    expect(el.childNodes.length).toBe(0);
  });

  it("makes no network calls", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const { act, year, unmount } = setup();
    act("begin").click();
    year(1);
    unmount();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
