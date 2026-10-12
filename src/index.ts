import { h, s } from "./dom";
import {
  begin, finished, CONFIG, DEFAULT_OPTIONS, epilogueYears, InvalidTransition, ledger, newGame, next, playAgain, readout, reflect,
  setOption, sleep, slotsOf, spend, summary, targetFor, undo, wake,
  type Options, type Phase, type RunRecord, type Spend, type State,
} from "./game";
import { dynamicsFor } from "./sources";
import "./many-hands.css";

/** Stones per row of the drawn tower, bottom to top. They add up to CONFIG.slots. */
export const ROWS = [14, 13, 12, 11, 11, 10, 10, 9, 8, 8, 7, 7];
const CELL_W = 15;
const CELL_H = 16;
const BASE_Y = 262;
const CX = 180;
const CANDLES = 12;
const CROWD = 30;

const YEAR_LINES = [
  "First light. The scaffolds are cold, and the work was under way before you came.",
  "Your hands know the weight of a stone now.",
  "Someone you will never meet cut the stone you are about to set on.",
  "Frost on the ropes. The Hearth is warm. The Tower is not.",
  "The crowd is more a sound than a sight.",
  "Halfway. Or nowhere near it, depending on what you count.",
  "A child asks what it will look like finished. No one is quite sure.",
  "Your shoulders remember every year.",
  "The Hearth smells of bread. The Tower smells of lime.",
  "Fewer years ahead than behind. The stones do not mind.",
  "You could stop looking up.",
  "The last year you will work here.",
];

let mounts = 0;

function mount(el: HTMLElement): () => void {
  const id = ++mounts;
  let state: State = newGame(DEFAULT_OPTIONS);
  let prevSlots: Array<"empty" | "many" | "you"> = Array(CONFIG.slots).fill("empty");
  const runs: RunRecord[] = [];
  let layFlip = false;
  let lastSpent: Spend | null = null;

  /* ---------- scene: sky, tower, crowd, you ---------- */
  const slotEls: SVGRectElement[] = [];
  const tower = s("g", { class: "mh-tower" });
  ROWS.forEach((width, r) => {
    for (let c = 0; c < width; c++) {
      const rect = s("rect", {
        x: CX - (width * CELL_W) / 2 + c * CELL_W + 0.5, y: BASE_Y - (r + 1) * CELL_H + 0.5,
        width: CELL_W - 1, height: CELL_H - 1, rx: 2, class: "mh-stone empty",
      });
      slotEls.push(rect);
      tower.append(rect);
    }
  });
  const flag = s("g", { class: "mh-flag" },
    s("line", { x1: CX, y1: BASE_Y - ROWS.length * CELL_H + 1, x2: CX, y2: 46 }),
    s("path", { d: `M${CX} 46 L${CX + 16} 51 L${CX} 56 Z` }),
  );

  const crowd = s("g", { class: "mh-crowd", "aria-hidden": "true" });
  for (let i = 0; i < CROWD; i++) {
    const x = 74 + (i + 0.5) * (276 / CROWD) + ((i * 53) % 7) - 3;
    const front = i % 2 === 0;
    const y = front ? 296 : 281;
    // The outer group places the figure; the inner one is what CSS animates, so the animation never undoes the placement.
    const fig = s("g", { transform: `translate(${x.toFixed(1)} ${y}) scale(${front ? 1.45 : 1.15})`, class: front ? "front" : "back" },
      s("g", { class: "fig" },
        s("circle", { cx: 0, cy: -9.5, r: 2.2 }),
        s("path", { d: "M0 -7 V-2 M0 -2 L-2.2 2 M0 -2 L2.2 2 M-3 -5.5 L3 -4.5" }),
        i % 4 === 1 ? s("rect", { x: -2.5, y: -15.5, width: 5, height: 3.5, rx: 0.8, class: "carry" }) : null,
      ),
    );
    crowd.append(fig);
  }
  const you = s("g", { class: "mh-you", transform: "translate(40 289)" },
    s("circle", { cx: 0, cy: -9.5, r: 2.2 }),
    s("path", { d: "M0 -7 V-2 M0 -2 L-2.2 2 M0 -2 L2.2 2 M-3 -5.5 L3 -4.5" }),
  );
  const youLabel = s("text", { x: 40, y: 298, class: "mh-you-label", "text-anchor": "middle" }, "you");

  const rain = s("g", { class: "mh-rain", "aria-hidden": "true" });
  for (let i = 0; i < 18; i++) {
    const x = 8 + i * 20;
    rain.append(s("line", { x1: x, y1: -20, x2: x - 10, y2: 6, style: `animation-delay:${(i % 6) * 70}ms` }));
  }
  const stars = s("g", { class: "mh-stars", "aria-hidden": "true" });
  [[30, 30], [70, 62], [110, 22], [250, 28], [300, 56], [335, 24], [215, 14], [150, 48], [20, 90], [338, 96]].forEach(([x, y], i) =>
    stars.append(s("circle", { cx: x, cy: y, r: i % 3 === 0 ? 1.4 : 0.9 })));

  const scene = s("svg", { class: "mh-scene", viewBox: "0 0 360 300", role: "img", "aria-label": "A tower of stone under construction, with a crowd of tiny figures at its foot" },
    s("defs", {},
      s("linearGradient", { id: `mh-sky-${id}`, x1: 0, y1: 0, x2: 0, y2: 1 },
        s("stop", { offset: "0", class: "mh-sky-top" }), s("stop", { offset: "1", class: "mh-sky-bottom" })),
      s("linearGradient", { id: `mh-haze-${id}`, x1: 0, y1: 0, x2: 0, y2: 1 },
        s("stop", { offset: "0", class: "mh-haze-b" }), s("stop", { offset: "0.4", class: "mh-haze-a" }), s("stop", { offset: "1", class: "mh-haze-b" })),
      s("linearGradient", { id: `mh-fog-${id}`, x1: 0, y1: 0, x2: 0, y2: 1 },
        s("stop", { offset: "0", class: "mh-fog-0" }), s("stop", { offset: "0.22", class: "mh-fog-a" }), s("stop", { offset: "0.6", class: "mh-fog-a" }), s("stop", { offset: "1", class: "mh-fog-b" })),
    ),
    s("rect", { width: 360, height: 300, fill: `url(#mh-sky-${id})` }),
    stars,
    s("path", { class: "mh-hills", d: "M0 250 C40 226 80 236 120 244 S200 224 250 238 S330 226 360 240 V300 H0 Z" }),
    s("rect", { class: "mh-ground", x: 0, y: BASE_Y, width: 360, height: 38 }),
    s("path", { class: "mh-outline", d: outline() }),
    tower, flag,
    // A tower that outlives you disappears upward into cloud.
    s("rect", { class: "mh-haze", x: 0, y: 40, width: 360, height: 150, fill: `url(#mh-haze-${id})` }),
    s("rect", { class: "mh-fog", x: 0, y: 40, width: 360, height: BASE_Y - 40, fill: `url(#mh-fog-${id})` }),
    crowd, you, youLabel, rain,
    s("rect", { class: "mh-flash", width: 360, height: 300 }),
  );

  /* ---------- hearth ---------- */
  const candleEls: SVGGElement[] = [];
  const candles = s("g", { class: "mh-candles" });
  for (let i = 0; i < CANDLES; i++) {
    const x = 26 + i * 28.4;
    const c = s("g", { class: "mh-candle", transform: `translate(${x.toFixed(1)} 0)` },
      s("rect", { class: "wax", x: -3.5, y: 34, width: 7, height: 20, rx: 1.5 }),
      s("path", { class: "flame", d: "M0 22 C3.8 27 4.4 32 0 33.5 C-4.4 32 -3.8 27 0 22 Z" }),
    );
    candleEls.push(c);
    candles.append(c);
  }
  const glow = s("ellipse", { class: "mh-glow", cx: 180, cy: 40, rx: 170, ry: 36 });
  const hearth = s("svg", { class: "mh-hearth", viewBox: "0 0 360 64", role: "img", "aria-label": "Your hearth, with candles" },
    s("defs", {}, s("radialGradient", { id: `mh-glow-${id}` }, s("stop", { offset: "0", class: "mh-glow-a" }), s("stop", { offset: "1", class: "mh-glow-b" }))),
    s("rect", { class: "mh-mantel", x: 0, y: 54, width: 360, height: 10, rx: 2 }),
    glow, candles,
  );
  glow.setAttribute("fill", `url(#mh-glow-${id})`);

  /* ---------- text and controls ---------- */
  const title = h("span", { class: "mh-title" }, "Many Hands");
  const yearEl = h("span", { class: "mh-year" });
  const pips = h("span", { class: "mh-pips", role: "img" });
  const pipEls = Array.from({ length: CONFIG.effort }, () => h("i", { class: "mh-pip" }));
  pips.append(...pipEls);

  const readTower = h("p", { class: "mh-read-tower", "data-readout": "" });
  const readYou = h("p", { class: "mh-read-you", "data-ledger": "" });
  const readWarmth = h("p", { class: "mh-read-warmth", "data-warmth": "" });
  const story = h("p", { class: "mh-story", role: "status", "aria-live": "polite", "data-story": "" });
  const crowdNote = h("p", { class: "mh-note" }, "The Many are simulated by this page. No one is online.");

  const kbd = (k: string) => h("kbd", {}, k);
  const beginBtn = h("button", { type: "button", class: "mh-btn primary", "data-act": "begin" }, "Begin ", kbd("Enter"));
  const contBtn = h("button", { type: "button", class: "mh-btn primary", "data-act": "continue" });
  const towerBtn = h("button", { type: "button", class: "mh-btn tower", "data-act": "tower" }, h("span", { class: "mh-ico stone-ico" }), h("span", {}, "Lay a stone ", kbd("T")));
  const hearthBtn = h("button", { type: "button", class: "mh-btn hearth-btn", "data-act": "hearth" }, h("span", { class: "mh-ico flame-ico" }), h("span", {}, "Light a candle ", kbd("H")));
  const undoBtn = h("button", { type: "button", class: "mh-btn quiet", "data-act": "undo" }, "Undo ", kbd("Backspace"));
  const sleepBtn = h("button", { type: "button", class: "mh-btn primary", "data-act": "sleep" }, "Sleep ", kbd("Enter"));
  const againBtn = h("button", { type: "button", class: "mh-btn primary", "data-act": "again" }, "Play again ", kbd("Enter"));

  const nm = `mh-horizon-${id}`;
  const counterBox = h("input", { type: "checkbox", "data-mechanic": "counter", checked: true });
  const markBox = h("input", { type: "checkbox", "data-mechanic": "service-record", checked: true });
  const withinRadio = h("input", { type: "radio", name: nm, value: "within", "data-mechanic": "horizon", checked: true });
  const beyondRadio = h("input", { type: "radio", name: nm, value: "beyond", "data-mechanic": "horizon" });
  const stormBox = h("input", { type: "checkbox", "data-mechanic": "storms" });
  const rules = h("fieldset", { class: "mh-rules", "data-rules": "" },
    h("legend", {}, "Ground rules"),
    h("label", { class: "mh-switch" }, counterBox, h("span", {}, h("b", {}, "Counter."), " See the tower and its running total.")),
    h("label", { class: "mh-switch" }, markBox, h("span", {}, h("b", {}, "My mark."), " Your stones carry your mark and fill a ledger.")),
    h("label", { class: "mh-switch" }, withinRadio, h("span", {}, h("b", {}, "Within a lifetime."), ` The tower needs ${CONFIG.targetWithin} stones.`)),
    h("label", { class: "mh-switch" }, beyondRadio, h("span", {}, h("b", {}, "Beyond a lifetime."), ` The tower needs ${CONFIG.targetBeyond.toLocaleString("en-US")}.`)),
    h("label", { class: "mh-switch" }, stormBox, h("span", {}, h("b", {}, "Storms."), " Some years the weather takes stones.")),
  );

  const runsBody = h("tbody");
  const runsSection = h("section", { class: "mh-runs", "data-runs": "" },
    h("h4", {}, "Your runs this session"),
    h("div", { class: "mh-table-wrap" },
      h("table", {},
        h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "#"), h("th", { scope: "col" }, "Switches"), h("th", { scope: "col" }, "Your efforts to the Tower"), h("th", { scope: "col" }, "Hearth"), h("th", { scope: "col" }, "Tower"))),
        runsBody,
      ),
    ),
  );

  const dynamicsList = h("ul", { class: "mh-dynamics", "data-dynamics": "" });
  const sourcesSection = h("section", { class: "mh-sources" },
    h("h4", {}, "What the sources say emerges"),
    dynamicsList,
  );
  const promptUnfinished = h("li", { "data-unfinished": "" }, "When the tower could not be finished in your lifetime, what did your effort become?");
  const reflectSection = h("section", { class: "mh-reflect" },
    h("h4", {}, "Then check it against your own play"),
    h("ul", {},
      h("li", {}, "What did you feel the first time you laid a stone for the Tower? And the last time?"),
      h("li", {}, "Change one switch (counter, your mark, horizon, storms), play again, and notice what changed: in what you did, and in how it felt. Compare the runs table: did your share to the Tower move?"),
      h("li", {}, "The Many are simulated, and the page said so. Did that change anything? Would a real crowd?"),
      promptUnfinished,
      h("li", {}, "Did your experience match what the sources say emerges? Where did it differ?"),
    ),
  );

  const stage = h("div", { class: "mh-stage" },
    h("div", { class: "mh-hud" }, h("div", { class: "mh-hud-left" }, title, yearEl), pips),
    h("div", { class: "mh-frame" }, scene),
    h("div", { class: "mh-readouts" }, readTower, readYou),
    crowdNote,
  );
  const hearthBox = h("div", { class: "mh-hearth-box" }, hearth, readWarmth);
  const controls = h("div", { class: "mh-controls" },
    story,
    h("div", { class: "mh-actions" },
      beginBtn, contBtn,
      h("div", { class: "mh-spend" }, towerBtn, hearthBtn),
      h("div", { class: "mh-sleep" }, undoBtn, sleepBtn),
    ),
  );
  const againRow = h("div", { class: "mh-again" }, againBtn);
  const root = h("div", { class: "mh", "data-phase": "SETUP" },
    h("div", { class: "mh-top" }, stage, controls, hearthBox),
    runsSection, rules, reflectSection, againRow, sourcesSection,
  );
  el.append(root);

  /* ---------- rendering ---------- */
  function outline(): string {
    // A faint ghost of the finished tower, so an empty tower still reads as a tower.
    let d = "";
    ROWS.forEach((width, r) => {
      const x0 = CX - (width * CELL_W) / 2;
      const y = BASE_Y - (r + 1) * CELL_H;
      d += `M${x0} ${y} h${width * CELL_W} v${CELL_H} h${-width * CELL_W} Z`;
    });
    return d;
  }

  function optionsText(o: Options): string[] {
    return [o.counter ? "counter" : "no counter", o.mark ? "mark" : "no mark", o.horizon === "within" ? "within" : "beyond", o.storms ? "storms" : "no storms"];
  }

  function storyFor(st: State): string {
    const o = st.options;
    const spent = st.today[st.today.length - 1];
    switch (st.phase) {
      case "SETUP":
        return "A tower is going up, and it needs more hands than will ever meet. You are one of them. Each year you have three efforts: lay a stone for the Tower, or light a candle at your own Hearth. Nobody will tell you which is right.";
      case "DAWN":
        return YEAR_LINES[st.year - 1];
      case "ALLOCATE": {
        if (st.effort === CONFIG.effort) return "Three efforts. Each is a stone for the Tower or a candle for the Hearth.";
        if (st.effort === 0) return `${acted(spent, o)} Sleep when you are ready.`;
        return `${acted(spent, o)} ${st.effort === 1 ? "One effort left." : "Two efforts left."}`;
      }
      case "DUSK": {
        const d = st.dusk!;
        let line = o.counter ? `The Many laid ${d.crowd} stones.` : "The Many laid their stones somewhere in the fog.";
        if (d.storm) line += o.counter ? ` A storm took ${d.stormTook}.` : " A storm tore through the scaffolds.";
        return line;
      }
      case "ENDING":
      case "REFLECT": {
        const r = summary(st);
        const lines: string[] = [];
        if (r.finished) lines.push(`The tower stands: ${r.stones} stones. You could walk its stairs.`);
        else if (o.horizon === "within") lines.push(`The tower stops at ${r.stones} of ${r.target}. The Many carry on without you.`);
        else lines.push(`You laid your part of a tower that outlives you: ${r.stones} of ${r.target.toLocaleString("en-US")} stones, a foundation. At the Many's pace it stands in about ${epilogueYears(st)} more years, for people you will not meet.`);
        if (o.mark && r.towerEfforts > 0) lines.push(`${ledger(st)} of its stones ${ledger(st) === 1 ? "carries" : "carry"} your mark.`);
        else if (r.towerEfforts > 0) lines.push(`${r.towerEfforts} of its ${r.towerEfforts === 1 ? "stones was" : "stones were"} yours, though no one could tell which.`);
        lines.push(`Your Hearth burned ${r.warmth} ${r.warmth === 1 ? "candle" : "candles"}.`);
        return lines.join(" ");
      }
    }
  }

  function acted(last: Spend | undefined, o: Options): string {
    if (last === "tower") return o.counter ? (o.mark ? "You set a stone and cut your mark in it." : "You set a stone.") : "You set a stone. The fog takes it.";
    if (last === "hearth") return "You light a candle. Your hands warm at once.";
    return "";
  }

  function primaryLabel(st: State): string {
    if (st.phase === "DAWN") return "Take up the chisel";
    if (st.phase === "DUSK") return st.year >= CONFIG.years ? "Look back" : "Next year";
    return "Reflect";
  }

  function render(): void {
    const st = state;
    const o = st.options;
    root.setAttribute("data-phase", st.phase);
    const running = st.phase === "DAWN" || st.phase === "ALLOCATE" || st.phase === "DUSK";
    const fogged = !o.counter && running;
    scene.setAttribute("data-fog", String(fogged));
    scene.setAttribute("data-storm", String(st.phase === "DUSK" && !!st.dusk?.storm));
    scene.setAttribute("data-tall", String(o.horizon === "beyond"));

    yearEl.textContent = running || st.phase === "ENDING" ? `Year ${st.year} of ${CONFIG.years}` : "";
    const left = st.phase === "ALLOCATE" ? st.effort : st.phase === "DAWN" ? CONFIG.effort : 0;
    pips.hidden = !running;
    pips.setAttribute("aria-label", `${left} ${left === 1 ? "effort" : "efforts"} left`);
    pipEls.forEach((p, i) => p.classList.toggle("on", i < left));

    // The tower. New stones get a class that plays a short drop animation; CSS removes it under reduced motion.
    const now = slotsOf(st);
    let k = 0;
    now.forEach((kind, i) => {
      const fresh = kind !== "empty" && prevSlots[i] === "empty";
      slotEls[i].setAttribute("class", `mh-stone ${kind} t${(i * 7 + 3) % 3}${fresh ? " fresh" : ""}`);
      if (fresh) slotEls[i].style.animationDelay = `${st.phase === "DUSK" ? k++ * 45 : 0}ms`;
      else slotEls[i].style.animationDelay = "";
    });
    prevSlots = now;
    if (lastSpent === "tower") {
      layFlip = !layFlip;
      you.setAttribute("class", `mh-you ${layFlip ? "lay-a" : "lay-b"}`);
    }
    lastSpent = null;

    const reading = readout(st);
    if (st.phase === "ENDING" || st.phase === "REFLECT") {
      const r = summary(st);
      readTower.textContent = `${r.stones.toLocaleString("en-US")} of ${r.target.toLocaleString("en-US")} stones`;
    } else if (st.phase === "SETUP") {
      readTower.textContent = `Needs ${targetFor(o).toLocaleString("en-US")} stones`;
    } else if (reading) {
      readTower.textContent = `${reading.stones.toLocaleString("en-US")} of ${reading.target.toLocaleString("en-US")} stones · ${reading.toGo.toLocaleString("en-US")} to go`;
    } else {
      readTower.textContent = "? of ? stones · ? to go";
    }
    const mine = st.towerEfforts;
    readYou.textContent = !running && st.phase !== "ENDING" && st.phase !== "REFLECT" ? ""
      : o.mark ? `Ledger: ${ledger(st)} ${ledger(st) === 1 ? "stone carries" : "stones carry"} your mark`
      : !o.counter ? `You have laid ${mine}` : "";
    readYou.hidden = readYou.textContent === "";

    // The hearth.
    const lit = Math.min(CANDLES, st.warmth);
    candleEls.forEach((c, i) => c.setAttribute("class", `mh-candle${i < lit ? " lit" : ""}${st.warmth > CANDLES ? " bright" : ""}`));
    glow.setAttribute("style", `opacity:${Math.min(0.95, st.warmth / 22).toFixed(2)};transform:scale(${(0.35 + Math.min(st.warmth, 30) / 30).toFixed(2)})`);
    readWarmth.textContent = `Hearth warmth ${st.warmth}`;

    story.textContent = storyFor(st);

    // Which controls the current state allows.
    beginBtn.hidden = st.phase !== "SETUP";
    contBtn.hidden = !(st.phase === "DAWN" || st.phase === "DUSK" || st.phase === "ENDING");
    contBtn.replaceChildren(primaryLabel(st), " ", kbd("Enter"));
    contBtn.setAttribute("data-phase-act", st.phase);
    ($(".mh-spend") as HTMLElement).hidden = st.phase !== "ALLOCATE";
    ($(".mh-sleep") as HTMLElement).hidden = st.phase !== "ALLOCATE";
    // aria-disabled, not disabled: a disabled button drops keyboard focus when its state changes.
    towerBtn.setAttribute("aria-disabled", String(st.effort === 0));
    hearthBtn.setAttribute("aria-disabled", String(st.effort === 0));
    undoBtn.setAttribute("aria-disabled", String(st.today.length === 0));
    sleepBtn.setAttribute("aria-disabled", String(st.effort !== 0));
    sleepBtn.classList.toggle("ready", st.effort === 0);

    const setup = st.phase === "SETUP" || st.phase === "REFLECT";
    rules.hidden = !setup;
    runsSection.hidden = !setup || runs.length === 0;
    reflectSection.hidden = st.phase !== "REFLECT";
    promptUnfinished.hidden = finished(st);
    againRow.hidden = st.phase !== "REFLECT";
    sourcesSection.hidden = st.phase !== "REFLECT";
    if (st.phase === "REFLECT") dynamicsList.replaceChildren(...dynamicsFor(o).map((t) => h("li", {}, t)));
    runsBody.replaceChildren(...runs.map(runRow));
  }

  function runRow(r: RunRecord, i: number): HTMLElement {
    const tags = optionsText(r.options).map((t) => h("span", { class: `mh-tag${t.startsWith("no ") ? " off" : ""}` }, t));
    const total = r.towerEfforts + r.hearthEfforts;
    return h("tr", {},
      h("td", {}, String(i + 1)),
      h("td", { class: "mh-tags" }, ...tags),
      h("td", {}, h("span", { class: "mh-share" }, h("i", { style: `width:${Math.round(r.share * 100)}%` })), ` ${r.towerEfforts} of ${total}`),
      h("td", {}, String(r.warmth)),
      h("td", {}, r.finished ? "stands" : `${r.stones.toLocaleString("en-US")}/${r.target.toLocaleString("en-US")}`),
    );
  }

  function $(sel: string): Element {
    return root.querySelector(sel)!;
  }

  /* ---------- moves ---------- */
  function seed(): number {
    return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  /** Run a transition. An illegal one is ignored, so a stray key or click never breaks the page. */
  function go(move: (s: State) => State): void {
    const before = state.phase;
    try {
      state = move(state);
    } catch (err) {
      if (err instanceof InvalidTransition) return;
      throw err;
    }
    if (state.phase === "ENDING" && before !== "ENDING") runs.push(summary(state));
    render();
    keepFocus();
  }

  /** Keep keyboard focus on a button that can act. Buttons come and go with the phase, and a spent button is no use. */
  function keepFocus(): void {
    const active = document.activeElement;
    if (active && active !== document.body && !root.contains(active)) return;
    let target: HTMLButtonElement | undefined;
    if (state.phase === "ALLOCATE") {
      if (state.effort === 0) target = sleepBtn;
      else if (active === sleepBtn || !active || active === document.body || (active as HTMLElement).closest("[hidden]")) target = towerBtn;
    } else {
      target = [beginBtn, contBtn].find((b) => !b.hidden);
    }
    if (target) target.focus({ preventScroll: true });
  }

  /** The game can sit far down the page; bring it into view once the player begins. */
  function showGame(): void {
    if (typeof root.scrollIntoView === "function") root.scrollIntoView({ block: "nearest" });
  }

  function lay(where: Spend): void {
    if (state.phase !== "ALLOCATE" || state.effort === 0) return;
    lastSpent = where === "tower" ? "tower" : null;
    go((st) => spend(st, where));
  }

  function primary(): void {
    switch (state.phase) {
      case "SETUP": go((st) => begin(st, seed())); showGame(); break;
      case "DAWN": go(wake); break;
      case "ALLOCATE": if (state.effort === 0) go(sleep); break;
      case "DUSK": go(next); break;
      case "ENDING": go(reflect); break;
      case "REFLECT": go((st) => begin(playAgain(st), seed())); showGame(); break;
    }
  }

  beginBtn.addEventListener("click", primary);
  contBtn.addEventListener("click", primary);
  againBtn.addEventListener("click", primary);
  sleepBtn.addEventListener("click", primary);
  towerBtn.addEventListener("click", () => lay("tower"));
  hearthBtn.addEventListener("click", () => lay("hearth"));
  undoBtn.addEventListener("click", () => { if (state.phase === "ALLOCATE" && state.today.length > 0) go(undo); });

  const setting = (): void => {
    if (state.phase !== "SETUP" && state.phase !== "REFLECT") return;
    state = setOption(state, "counter", counterBox.checked);
    state = setOption(state, "mark", markBox.checked);
    state = setOption(state, "horizon", beyondRadio.checked ? "beyond" : "within");
    state = setOption(state, "storms", stormBox.checked);
    // The tower on screen is empty in these phases, so only the readout and the sources depend on the switches.
    render();
  };
  for (const input of [counterBox, markBox, withinRadio, beyondRadio, stormBox]) input.addEventListener("change", setting);

  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || !root.isConnected) return;
    if (e.repeat) return;
    const target = e.target;
    const key = e.key;
    if (key === "t" || key === "T" || key === "1" || key === "ArrowLeft") { if (state.phase === "ALLOCATE") { e.preventDefault(); lay("tower"); } return; }
    if (key === "h" || key === "H" || key === "2" || key === "ArrowRight") { if (state.phase === "ALLOCATE") { e.preventDefault(); lay("hearth"); } return; }
    if (key === "Backspace") { if (state.phase === "ALLOCATE") { e.preventDefault(); if (state.today.length > 0) go(undo); } return; }
    if (key === "Enter") {
      // A focused button handles Enter itself; do not advance twice.
      if (target instanceof Element && target.closest("button, a, summary, select")) return;
      if (state.phase === "REFLECT") return; // replaying is a deliberate click, after the questions
      e.preventDefault();
      primary();
    }
  };
  document.addEventListener("keydown", onKey);
  // Holding Enter on a focused button repeats its click, and focus hops to the next button, so a held key could play whole years.
  const stopRepeat = (e: KeyboardEvent): void => { if (e.repeat && (e.key === "Enter" || e.key === " ")) e.preventDefault(); };
  root.addEventListener("keydown", stopRepeat, true);

  render();
  return () => {
    document.removeEventListener("keydown", onKey);
    root.remove();
  };
}

export const manyHands = { slug: "many-hands", title: "Many Hands", author: "NICOH-YAY", mount };
