import type { Options } from "./game";

/** Items quoted verbatim from the note (Meaning first, then two cross-motivator ones); a test checks each one. */
export const SOURCES = {
  collective: "Collective progress toward a vast goal: \"pursuing a massive goal alongside millions of other people feels good. It feels meaningful\" (McGonigal 2011, ch. 6).",
  impact: "Visible impact, as when World of Warcraft changes the world after a player's quests, so that \"your actions are having a significant impact on the world\" (McGonigal 2011, ch. 3).",
  counter: "A community-wide counter, like Halo 3's tally toward ten billion kills (McGonigal 2011, ch. 6).",
  record: "A public service record of medals and achievements, \"a history of a player's contributions to a larger organization\" (McGonigal 2011, ch. 6).",
  globalTotal: "A running global total, like Free Rice's growing pile of donated rice (McGonigal 2011, ch. 11).",
  awe: "*awe*, \"what we feel when we recognize that we're in the presence of something bigger than ourselves\" (McGonigal 2011, ch. 6)",
  drain: "A caution: points, badges, and rewards added to an activity can drain the motivation it already had (Schell 2019, p. 158).",
  surprise: "Surprise: \"chance means uncertainty, and uncertainty means surprises\" (Schell 2019, p. 193).",
  reversals: "Reversals of fortune, as the chutes and ladders of Chutes and Ladders produce (Salen and Zimmerman 2003, ch. 15, \"Chance and Game Play\").",
} as const;

/** What the sources say should emerge from the switches as set. Where a switch is off, say what is missing. */
export function dynamicsFor(options: Options): string[] {
  const out: string[] = [];
  if (options.counter) out.push(SOURCES.collective, SOURCES.counter, SOURCES.impact);
  else out.push("With the counter hidden, no one can see what they add to. The sources' meaning leans on a visible total and visible impact, so notice whether the Tower still pulls at you.");
  if (options.mark) out.push(SOURCES.record, SOURCES.drain);
  else out.push("With your mark off, every stone is the same stone. Notice whether you give more or less when you cannot find yourself in the tower.");
  if (options.horizon === "within") out.push("Within a lifetime, the goal can be reached, so any stone might be the one that finishes it.");
  else out.push(`Beyond a lifetime, the goal outlives you. ${SOURCES.awe} is the feeling the note names for being part of something that large.`);
  if (options.storms) out.push(SOURCES.surprise, SOURCES.reversals);
  else out.push("Without storms nothing is ever undone. Notice whether certainty makes the work feel more meaningful or less alive.");
  return out;
}
