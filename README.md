# Many Hands

A small browser game about giving to something bigger than one lifetime.

**Play it:** https://nicoh-yay.github.io/many-hands/

You are one stonecutter in a crowd raising a tower that needs more hands than will ever meet. The game lasts 12 years. Each year you have 3 efforts, and each goes one of two places:

- **Lay a stone** (`T` or `1`) for the Tower: shared, slow, and perhaps never finished in your lifetime.
- **Light a candle** (`H` or `2`) at your own Hearth: private, instant, warm.

`Backspace` undoes an effort. When all three are spent, `Enter` sleeps. At dusk the Many, a crowd this page simulates (no one is online), lay 6 to 10 stones. Nothing says which choice is right, and nothing is scored.

Four switches change the rules:

- **Counter:** see the tower and its total, or hide it in fog.
- **My mark:** your stones carry your mark and fill a ledger, or every stone looks the same.
- **Horizon:** the tower needs 120 stones, or 1,200 and cannot be finished in your lifetime.
- **Storms:** one year in four a storm takes 1 or 2 of the crowd's top stones.

A table of your runs shows each run's switches beside how many efforts went to the Tower. Play a few ways, then ask what you felt.

## Run it locally

```bash
npm install
npm run dev      # play on localhost
npm test         # rules engine and UI tests
npm run build    # static site in dist/
```

Works with mouse, touch and keyboard, fits a phone screen, respects reduced motion, makes no network calls (apart from Google Fonts), and draws everything in code.

## Background

Built for COMS E6998, AI in Practice: Game Design and Development (Columbia, Fall 2026), as a minigame for the Meaning motivator of the course's Motivation Atlas. It draws on McGonigal 2011 (*Reality Is Broken*) and Schell 2019 (*The Art of Game Design*). `src/game.ts` is a DOM-free state machine (SETUP, DAWN, ALLOCATE, DUSK, ENDING, REFLECT) with a seeded random generator; `src/index.ts` is the interface.
