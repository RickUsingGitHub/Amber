# Code review guide

Notes for anyone reviewing this codebase: what it must keep doing, where mistakes would cost users money, the technical debt we know about, and questions worth an opinion. Start with [ARCHITECTURE.md](ARCHITECTURE.md) for the layout, and [FRONTEND.md](FRONTEND.md) if the review covers the UI.

## Running it

```bash
npm install
npm run build:css
npm run lint        # ESLint
npm test            # ~11 unit scripts, then ~66 Playwright tests (~60 s with --workers=2)
npm run serve       # http://127.0.0.1:4173
```

Without an Amber API key, use the "Not with Amber?" path on Start with a NEM12 file. The tests build them in code (`nem12Year()`, `nem12Battery()` in `tests/planner.spec.js`). CI runs `npm run lint` and the same `npm test` on every pull request (`.github/workflows/test.yml`).

## Invariants: what must stay true

These are the properties the tests guard and that users rely on. A change that breaks one is a bug, even if the UI looks fine.

1. **One way of pricing.** Compare, month by month (`monthly.js`), Bill Check, the Free? estimate and the Solar+? planner must price the same readings on the same plan to the same total. The planner's half-hourly costing (`planCardCost`, `amberCardCost`) is checked against `computePlanTotals` in `tests/unit-planner.js`, and `monthly.js` mirrors the Compare table.
2. **Missing readings are never zero.** Days without readings are left out of usage costs and flagged ("Incomplete comparison", "No readings"). Fixed charges still cover the whole period. The planner fills at most 31 missing days from the same weekday and says so.
3. **Time is explicit.** Amber's `nemTime` is an interval's end in NEM time (UTC+10, no daylight saving). Plan windows are local wall-clock time unless a plan says `clock: 'nem'`. Interval-end semantics matter at window edges (`Amber.intervalEndInWindow`, `timeInWindow`). The planner's slots are NEM half hours.
4. **GST is consistent.** Templates are GST-inclusive; `networks.js` figures are ex GST and GST is added in `estimate.js`; household feed-in is GST-free. The GST toggle only changes the display (`adjustForGst`).
5. **The cache is trustworthy.** Only final whole days are cached. Clearing it also removes what was worked out from it (results, imported households). Estimated readings stay refetchable, and empty old days are remembered as empty. The CSV backup round-trips (`tests/review.spec.js`).
6. **Nothing leaves the browser** except requests to Amber's API with the user's key. The CSP enforces this; keep it.
7. **User and data text is escaped** (`Amber.escapeHTML` / `esc`) before going into `innerHTML`, including inside attribute values (quotes are escaped).
8. **The planner is fair between options.** Every option is measured against the same yardstick, and the same rules (export limit, negative feed-in switch-off, battery dispatch) apply on every plan.

## Where the risk is

| Area | Why it matters | Where |
|---|---|---|
| Plan prices | Stale or mistyped rates give wrong answers that look plausible. Templates are typed in by hand from fact sheets; each has `asAt`. | `templates.js`, `networks.js`, `constants.js` (Amber fixed charges) |
| Feed-in caps and windows, free windows | Daily caps shared across channels, over-cap rates, Ausgrid's EA029 midday export allowance and charge. These are easy to get subtly wrong. | `costs.js` (`householdCappedSplits`, `settleAmberFeedIn`, `applyAmberFeedInSettlement`) |
| Demand charges | Monthly peaks, demand windows, seasonal rates, days counted per month. | `costs.js` (`calculateMonthDemandTariff`, …), `planner.js` (card demand) |
| The NEM12 estimate | Loss factors other than Ausgrid's are typical values; controlled load is guessed from channel shape. | `estimate.js`, `networks.js` |
| Battery dispatch | A per-day heuristic with perfect daily foresight. It's optimistic for real batteries, especially on Amber price spikes. | `planner.js` `simulateBattery` |
| Unwinding an existing battery | Estimates what the battery covered at home, which the meter can't see. The check card shows the gap against real readings. | `planner.js` `plannerUnwindBattery`, `plannerExistingCheck` |
| Finance | Price rises, wear, replacements, residual value, payback "ahead for good", IRR. Small errors move recommendations. | `planner.js` `plannerFinance`, `plannerKeenLevel`, `plannerWaitAYear` |
| Bill parsing | Depends on the layout of Amber's PDF text; new layouts break it. Unreadable bills show the text read. | `bill.js` |
| Big UI files | `app.js` (~3,000 lines, module-level state) and `planner-ui.js` (~1,200) mix data handling and HTML building. | `app.js`, `planner-ui.js` |

## Known technical debt

- **`app.js` is a monolith.** Tabs, plan form, results, imports, bill check, Free? and settings live in one IIFE sharing a `state` object. Natural seams: the plan form (`createPlanObjectFromForm`, `applyPlanTemplate`, TOU windows), results rendering, imports (CSV, NEM12, local sites), the bill check, the Free? tab and settings.
- **HTML as strings.** Most results are template strings set with `innerHTML`, with table markup repeated (`th`/`td` helpers exist only in `planner-ui.js`). It's safe while everything is escaped, but verbose and easy to make inconsistent.
- **No formatter or type checking.** ESLint (`npm run lint`, run in CI) catches unused and shadowed variables, undefined names and calls with too many arguments within a file, and holds the style (4-space indentation, single quotes, semicolons). There's no Prettier, and nothing checks types or calls between files. JSDoc comments exist on many engine functions but not throughout.
- **Home-made unit test harness.** `tests/unit-*.js` use their own `assert` and print `ok:`/`FAIL:`. They work, but give no per-test isolation or coverage.
- **End-to-end tests depend on IDs and wording.** Many assertions match visible text, so copy edits need test edits too.
- **Yearly maintenance is manual.** Each 1 July: the default offers and VDO in `templates.js`, Amber's network tariffs in `networks.js` (FY2026-27 today), Amber's default fixed charges and `AMBER_RATES_CHANGE_DATE` in `constants.js`, rebate and hardware defaults in `PLANNER_FINANCE_DEFAULTS`, and `TEMPLATES_AS_AT`. Market offers drift during the year.
- **Vendored libraries** are pinned copies: Chart.js 4.4.2, chartjs-plugin-zoom 2.0.1, pdf.js 3.11.174. Updating them is manual.
- **The price-update workflow** uses Node 20 actions, which GitHub is deprecating (a warning only). `test.yml` already uses Node 22.
- **The API key** is obfuscated, not encrypted. That's fine for a browser-only tool, but it shouldn't be described as secure.
- **Number formatting** varies: percentages are "20%" in most places but "20 %" on Solar+?. Money uses `toLocaleString('en-AU')` in some places and `toFixed` in others.

## Questions worth a reviewer's opinion

1. Is it worth splitting `app.js` along the seams above before a frontend refresh, so the refresh doesn't have to touch pricing code?
2. Should HTML building move to small render helpers (or `<template>` elements in `index.html`) to cut repetition, while staying build-free and within the CSP?
3. ESLint now runs in CI. Would a formatter (Prettier) or type checking of the JSDoc (`tsc --checkJs`) be welcome too, given the no-build constraint?
4. Is the planner's battery heuristic good enough, or should it be compared against a simple linear-programming optimum for a few test days to measure how optimistic it is?
5. Should the Solar+? search move to a Web Worker (it runs on the main thread today, yielding with `setTimeout(0)`)? The CSP already allows `worker-src 'self'`.
6. Should the app say explicitly that it's independent of Amber Electric (see FRONTEND.md)?
7. Is there anything in the data handling that a privacy-minded user would object to?

## Test map

| Test | Covers |
|---|---|
| `unit-syntax.js` | Every `js/*.js` parses as a classic script; `index.html` loads each one once, `app.js` last |
| `unit-time.js` | Dates, NEM vs local time, TOU windows, app version |
| `unit-bill.js`, `unit-billcheck.js` | Bill reading and line-by-line checks |
| `unit-stats.js` | More Stats |
| `unit-demand.js` | Demand charges |
| `unit-redispatch.js` | Free? re-scheduling |
| `unit-import.js` | Amber CSV import |
| `unit-estimate.js` | NEM12 parsing and the Amber price rebuild |
| `unit-planner.js` | Planner: parity with Compare, flows, export limit, battery energy balance, existing battery, negative feed-in, midday halving, finance and ratings |
| `unit-review.js` | Regression checks from an earlier review: household caps across channels, export settlement, missing vs zero days, CSV backup timestamps |
| `autoload`, `cache`, `import`, `review` specs | Opening state, the cache, CSV import and backup round trip |
| `ui`, `tabs`, `graphs`, `stats`, `performance` specs | Tabs, help bubbles, disclaimer, phone layout, charts, More Stats, fetch behaviour |
| `billcheck`, `shift`, `v140` specs | Bill?, Free?, financial-year rate switching |
| `v162` spec | Saved plan prices refreshed when a built-in plan changes, the answer and month by month agreeing on Amber's total, clearing saved readings, no maintainer tools in the menu, plan names with quotes or tags, changing state (and a site outside NSW), the bill check's pointer to Start, damaged saved settings, a Compare when the readings can't be saved, Escape closing the menus |
| `nem12`, `planner` specs | The NEM12 path and every Solar+? flow |
