# Architecture

How Amber Compare & Export is put together, for contributors and reviewers. User-facing features are in the [README](../README.md); the UI contract for a redesign is in [FRONTEND.md](FRONTEND.md); review notes are in [REVIEW.md](REVIEW.md).

## At a glance

- **A static site** (GitHub Pages) with one page, `index.html`. There is no server, no backend and no account. Network traffic is limited to Amber's API (`https://api.amber.com.au/v1`) and the site's own files (`data/…`), enforced by a Content Security Policy in `index.html`.
- **Plain JavaScript, no framework and no bundler.** Each file in `js/` is an IIFE that adds to a single global namespace, `window.Amber` (or `globalThis.Amber` under Node). The files are classic `<script>` tags loaded in a fixed order, so `file://` works.
- **Logic and UI are mostly separate.** Calculation modules (`costs`, `monthly`, `estimate`, `redispatch`, `planner`, `solar`, `stats`, `bill`, `import`, `time`, `templates`, `networks`) don't touch the DOM and are unit-tested in Node. DOM code lives in the page controller (`app-*.js` and `app.js`: everything except the planner), `planner-ui.js` (the Solar+? tab), `charts.js`, `calendar.js`, `help.js` and parts of `csv.js` and `storage.js`.
- **Styling** is Tailwind CSS 3, prebuilt by the Tailwind CLI from `css/input.css` into `css/app.css` (committed). There's no runtime CSS-in-JS and no inline `<style>`.
- **Vendored libraries** in the repository root: Chart.js 4.4.2 (`chart.umd.min.js`), chartjs-plugin-zoom (`chartjs-plugin-zoom.min.js`) and pdf.js (`pdf.min.js`, `pdf.worker.min.js`, loaded on demand for bill PDFs).
- **Storage**: IndexedDB for meter readings (a per-site, per-day cache), localStorage for settings, saved plans, imported households and the last bill check.

## Repository layout

```
index.html               The whole page: header, dates bar, tab bar, six tab panels, footer, script tags
css/input.css            Tailwind source (base layer + a few component classes)
css/app.css              Built CSS (npm run build:css), committed
js/                      Application code (see the module map)
data/prices/<REGION>/    AEMO 5-minute wholesale prices, one JSON per month (NSW1, QLD1, SA1, VIC1)
data/solar/<town>.json   PVGIS typical-year hourly weather for 22 towns
scripts/static-server.js Tiny static server for development and Playwright (port 4173)
scripts/update-prices.js Downloads AEMO prices into data/prices (run daily by a GitHub Action)
scripts/update-solar.js  Downloads PVGIS weather into data/solar (run by hand)
tests/unit-*.js          Node unit checks (no framework: assert + console)
tests/*.spec.js          Playwright end-to-end tests (Chromium)
eslint.config.js         ESLint settings (npm run lint)
eslint-rules/            The project's own ESLint rules (no-extra-arguments)
.github/workflows/       test.yml (lint and tests on PRs and main), update-prices.yml (daily price refresh)
chart.umd.min.js, chartjs-plugin-zoom.min.js, pdf.min.js, pdf.worker.min.js   Vendored libraries
```

## Script load order and the `Amber` namespace

`index.html` loads, in order:

```
chart.umd.min.js, chartjs-plugin-zoom.min.js
js/constants.js   js/help.js      js/time.js      js/templates.js   js/storage.js
js/costs.js       js/api.js       js/bill.js      js/csv.js         js/charts.js
js/calendar.js    js/stats.js     js/monthly.js   js/redispatch.js  js/import.js
js/networks.js    js/estimate.js  js/solar.js     js/planner.js     js/planner-ui.js
js/app-core.js    js/app-plan-form.js   js/app-results.js   js/app-imports.js
js/app-bill.js    js/app-free.js        js/app-settings.js
js/app.js
```

Every file starts with `const Amber = root.Amber = root.Amber || {};` and attaches functions and constants as `Amber.something`. Later files may use anything earlier files define. `app.js` is last and starts the page (`init()` on `DOMContentLoaded`). Every script URL carries `?v=<version>` to bust caches. `tests/unit-syntax.js` checks that every file in `js/` has its script tag, that `app-core.js` is the first of the app files and that `app.js` is last.

Under Node (unit tests), files are `require`d in the same order and attach to `global.Amber`; DOM-free modules work unchanged.

### The page controller: `app-*.js`, `app.js` and `Amber.app`

Everything in the UI except the Solar+? tab is one controller, split over eight files by area (the module map lists them). They work on one `state` object and call each other's functions, so they share an internal namespace, `Amber.app`:

- `app-core.js` loads first and creates it: `Amber.app = { state, $, … }`, with `state` (what the page remembers while it is open: the templates, the last Compare's channel totals, sites, the bill check and so on), `$` (`getElementById`) and the helpers every file reads (the selected site and state, Amber's fixed charges, saved JSON, messages).
- Each file starts with `const app = Amber.app; const state = app.state; const $ = app.$;`. Functions in the same file are called directly. A function in another file is called as `app.name(…)`, looked up when the call runs, so the files can call each other in both directions and only `app-core.js` has to come before the rest.
- Each file ends with `Object.assign(app, { … })`, listing only what another file uses. That list is the file's interface: a function that isn't on it is private to its file. To use a function from another file, add it to that file's list and call it as `app.name()`.
- Each area has a `setup…` function that adds its event listeners (`setupPlanForm`, `setupImports`, `setupBillCheck`, `setupFreeTab`, `setupSettingsMenu`; `setupTabs`, `setupStartTab`, `setupAccount` and `setupResultTools` in `app.js`). `init()` in `app.js` calls them in order.

Two checks keep this honest. ESLint's `no-undef` reports a call to another file's function that was written without `app.`, and `tests/unit-syntax.js` checks that every `app.<name>` used is put on `Amber.app` by exactly one file, that everything on it is used by another file, and that no module outside the app files touches it.

`Amber.app` is internal to those files. The hooks for everything else are:

- `Amber.appApi` (set in `app.js`) gives `planner-ui.js` what it needs from the main app: `selectedSite`, `currentStateCode`, `readAmberRates`, `templates()`, `selectedPlanName()` and `selectTab`. The planner reads the meter cache itself through `storage.js`.
- `Amber.plannerUi = { show, run }` (set in `planner-ui.js`) is called by `app.js` when the Solar+? tab opens.
- `Amber._appState` (set in `app-core.js`) is the same `state` object, for tests and debugging.

## Module map

| File | Lines | Owns |
|---|---|---|
| `constants.js` | ~130 | API URL and fetch limits, app version, Amber's default fixed charges (this year and last), state time zones, network names and plan-to-network matching, plan company names (`planCompany`) |
| `help.js` | ~310 | `Amber.HELP` (every help text, keyed) and the help-bubble behaviour for any `[data-help]` element |
| `time.js` | ~250 | Dates and times: NEM time (UTC+10) vs local wall clock, interval end times, TOU window matching, day arithmetic |
| `templates.js` | ~570 | Built-in retailer plans per state (`supplierTemplates`), with "as at" dates |
| `storage.js` | ~220 | IndexedDB cache (`AmberDataCacheDB` → `dailyUsage`, key `<siteId>_<YYYY-MM-DD>`), cache freshness rules, API key storage (obfuscated), `escapeHTML` |
| `costs.js` | ~910 | Pricing a period: per-channel totals from usage items, TOU periods, other plans' costs (flat/TOU, controlled load, feed-in windows and caps, free windows), demand tariffs (Amber and other plans), Amber fixed charges, Ausgrid export settlement, `computePlanTotals` |
| `api.js` | ~230 | Amber API client: sites, usage in date chunks, timeouts, retries with backoff, a small promise pool |
| `bill.js` | ~360 | Reading an Amber bill (PDF via pdf.js, or text): rates, period, line items; `compareBill` checks it against meter data |
| `csv.js` | ~85 | CSV downloads: every reading (a versioned, restorable backup), daily totals, the results table |
| `charts.js` | ~440 | Usage tab charts (24-hour average, daily) with Chart.js plugins |
| `calendar.js` | ~360 | Usage tab calendar and its day tooltips |
| `stats.js` | ~60 | More Stats figures (price spikes, negative prices, evening share, grid-free days) |
| `monthly.js` | ~130 | `periodTotals` / `monthlyBreakdown`: Amber vs another plan per calendar month, worked out the same way as Compare |
| `redispatch.js` | ~350 | Free? tab: re-timing real interval data into a plan's free and feed-in windows under daily shift budgets |
| `import.js` | ~380 | Amber usage CSV import into the cache (API-shaped items, demand window flags) |
| `networks.js` | ~280 | Network tariffs and Amber's charges for all 11 networks Amber serves (FY2026-27), for the NEM12 estimate |
| `estimate.js` | ~400 | NEM12 parsing and the rebuild of Amber's interval prices from wholesale prices, as a local "site" |
| `solar.js` | ~220 | Towns, PVGIS weather loading, sun position, panel output per half hour (tilt, facing, shade, temperature, inverter clipping) |
| `planner.js` | ~1,480 | Solar+? engine: the half-hourly year, plan rate cards, exact costing, flows, existing-battery detection and unwinding, battery simulation, the search, finance and ratings |
| `planner-ui.js` | ~1,190 | Solar+? tab UI: inputs and settings, running the search, every results card |
| `app-core.js` | ~200 | What the page controller's files share: `state`, `Amber.app`, `$`, `storedJson`, the selected site and state, Amber's fixed charges (`loadAmberChargeFields`, `readAmberRates`), `fmtDate`, the message under the dates bar, tables in their own sideways-scrolling box (`scrollBox`, `syncScrollHints`) |
| `app-plan-form.js` | ~620 | The plan form on Compare: TOU and feed-in windows, the plan picker (`updatePlanSelector`, `selectSupplierPlan`), `createPlanObjectFromForm`, `applyPlanTemplate`, saved settings (`saveAllSettings`, `loadAllSettings`), custom plans |
| `app-results.js` | ~690 | Showing results: the answer (`displayResults`), every plan (`renderAllPlansTable`), savings in the plan picker (`updatePlanSavings`), month by month (`loadMonthlyData`, `renderMonthly`), the Usage tab's daily graph, day picker and More Stats, `hideResults` |
| `app-imports.js` | ~450 | Sites and imports: the site picker (`populateSites`, `syncSiteMode`), imported households (`loadLocalSites`, `renderLocalSites`), Amber CSV import (`handleUsageCsvFile`), NEM12 (`handleNem12File`, `renderNem12Options`, `buildNem12Estimate`) |
| `app-bill.js` | ~300 | An Amber bill: reading the file and filling Amber's charges from it (`handleAmberBillFile`, `applyAmberBillRates`), and the Bill? tab, which loads the bill period's own readings (`ensureBillLoaded`, `billChannelData`, `renderBillCheck`) |
| `app-free.js` | ~250 | The Free? tab: its settings, `renderBatteryShift`, `drawBatteryShift` |
| `app-settings.js` | ~120 | The settings menu: `buildSettingsMenu`, `clearSavedReadings`, deleting custom plans |
| `app.js` | ~720 | The top of the controller, loaded last: tabs (`selectTab`), the Start tab's welcome and account fields, the dates bar and Download menu, `loadReadings` (the cache, then Amber), `fetchAndCompare`, `recalculateAndShow`, `init()`, `Amber.appApi` |

## Data model

### Sites and channels

A site is either Amber's (from `GET /sites`) or local, an imported NEM12 household (`{ id, local: true, nmi, network, channels, … }`, kept in localStorage `localSites`). Channels have `identifier` and `type` (`general`, `controlledLoad`, `feedIn`) and a `tariff` code.

### Usage items

The unit of meter data is the Amber API's usage item, one per channel per interval:

```
{ channelIdentifier, channelType, nemTime (interval end, NEM time), startTime, endTime, duration (min),
  date (NEM date), kwh, perKwh (c/kWh inc GST; feed-in negative = credit), cost, quality,
  spikeStatus, renewables, tariffInformation: { demandWindow, … } }
```

Imports (Amber CSV, NEM12 estimate) produce the same shape, so every feature works on any source.

### The cache

IndexedDB `AmberDataCacheDB`, store `dailyUsage`, one record per site and NEM date (`id = "<siteId>_<date>"`). Connections aren't closed after use; each closes itself on `versionchange`, so "Clear saved meter readings" (`deleteDatabase`) isn't blocked. Every transaction rejects its promise on `abort` as well as `error` (a full disk aborts without an error event), and a Compare whose readings can't be saved still shows its results. Compare reads the cache first and fetches only missing or stale days, in 7-day chunks, 3 at a time (`Amber.FETCH_CHUNK_DAYS`, `FETCH_CONCURRENCY`). Final whole days are cached. Old days with no data are remembered as empty (`emptyDayCutoff`). Estimated readings stay eligible for refetch (`cachedDayUsable`).

### Channel totals

`Amber.processUsageData(items, channelTotals)` turns items into per-channel totals plus the per-interval detail the cost functions need. `Amber.emptyChannel(c)` creates one entry per channel. Everything on Compare, Usage and Bill? is computed from these.

### Plan configs

A plan (built-in template or saved custom plan):

```
{ rateType: 'flat' | 'tou', flat, daily (c/day), feedIn, cl (controlled load c/kWh), clock: 'local' | 'nem',
  tou: { free: { rate, capKwh, windows }, superOffpeak, peak: { rate, windows: [{ start, end, days }] },
         shoulder, offpeak: { rate } },
  feedInWindows: [{ rate, start, end, days, capKwh, overRate }],
  demand: { e (enabled), … window and rate fields }, asAt }
```

TOU period names and labels are in `Amber.PERIOD_LABELS`. Days are 0 = Sunday. Rates in templates are GST-inclusive c/kWh and c/day; feed-in is the published rate. `templates.js` has the full set; `app-plan-form.js` `createPlanObjectFromForm` builds one from the plan form.

### The planner's year

`Amber.planYear(byDate)` turns the cache into a 365-day, half-hourly year (`n = 365 × 48` slots, NEM time):

```
{ ok, dates[365], n, days, imp, exp, cl (kWh per slot), amberImp, amberCl, amberExp (c/kWh, negative = credit),
  demandFlag, filled, first, last, meterExp (after an existing battery is unwound), … }
```

Missing days (up to 31) are filled from the nearest whole day on the same weekday. Every plan's rate windows start on the hour or half hour, so half-hourly pricing equals pricing the 5-minute readings: the planner's cost of the unchanged year matches Compare exactly. `tests/unit-planner.js` checks this.

## How each tab works

### Start (`app.js`: `setupStartTab`, `setupAccount`; `app-imports.js`: sites and imports; `app-core.js`: Amber's charges)

- API key: `Amber.setApiKey` stores an obfuscated key in localStorage (or sessionStorage); `Amber.fetchSites` lists sites. The state selector follows the site's network (`siteNetworkState`, from `Amber.NETWORKS`) when the state showing has no plans for it, unless the user picked the state by hand for that site.
- Amber's fixed charges: `loadAmberChargeFields` / `readAmberRates`. The two years' connection, subscription and demand rates are split at `Amber.AMBER_RATES_CHANGE_DATE` (1 July 2026). Uploading a bill (`handleAmberBillFile` → `bill.js`) fills the year it belongs to.
- Amber CSV import: `handleUsageCsvFile` → `import.js` → `setUsageDataMany`.
- NEM12: `handleNem12File` → `estimate.js` parses the file and rebuilds Amber's interval prices from `data/prices` and `networks.js`. The result becomes a local site whose days are written to the cache.

### Compare (`app.js`: `fetchAndCompare`; `app-results.js`: `displayResults`, `renderAllPlansTable`, `renderMonthly`; `app-plan-form.js`: the plan form)

1. Read the cache for the dates, fetch what's missing (`api.js`) and write final days back (`loadReadings` in `app.js`, shared with the bill check).
2. `processUsageData` → channel totals; `applyAmberFeedInSettlement` (Ausgrid EA029 export settlement, one calendar month at a time via `Amber.monthsInRange`; Bill? settles the bill's own period with `billPeriod`).
3. `calculateOtherSupplierCosts` (the chosen plan), `calculateDemandTariff` / `calculateOtherDemandTariff` (monthly peaks), `precalculateDailySummaries` (daily rows and calendar).
4. Render the answer, every plan for the network (`computePlanTotals` per template), then month by month (`monthly.js`, after the main results).

### Usage (`charts.js`, `calendar.js`, `stats.js`, `app-results.js`)

Uses the same channel totals and daily summaries. Charts use the interval's local time and real interval length.

### Bill? (`bill.js`, `app-bill.js`)

Reads the bill (pdf.js is loaded on demand), loads that period's meter data (from the cache or API), and `compareBill` checks each line. The load is the bill check's own (`ensureBillLoaded` → `loadReadings` → `state.billData`): the dates bar and the Compare results are left alone, and results already on show are used when they cover the bill. The last result is kept in localStorage `amberBillCheck`.

### Free? (`redispatch.js`, `app-free.js`)

For each free-window plan, re-times each day's real readings. Grid use moves into the free window (dearest first) within a daily shift budget, the window's cap and an import limit. Battery exports move into the best feed-in window when a battery is present. The result is priced with the same cost functions as Compare.

### Solar+? (`planner.js`, `solar.js`, `planner-ui.js`)

```
cache ──planYear──▶ year ──(existing battery?)──plannerUnwindBattery──▶ year without it
                                                       │
solar.js: town weather → solarSlotsPerKw → clipToInverter (panels/1.33)
plannerExtraLoads: EV, heat-pump hot water, gas to electric
                                                       ▼
plannerSearch(ctx) ── plannerPrepare (rate cards, prices, flows cache)
   for each solar size × plan: plannerFlows (import/export after solar, export limit)
   for battery sizes on the best few plans: simulateBattery
   ▼ rows { solarKw, batteryKwh, plan, bill, … }
planner-ui analyse(): yardstick, options, plannerFinance (NPV, IRR, payback), plannerKeenLevel
```

Key pieces:

- **Rate cards** (`planRateCard`): each plan's buy, sell and controlled-load price per slot, plus free windows, feed-in windows and caps, and demand. `planCardCost` and `amberCardCost` price any import/export arrays for the year or a month; `plannerMonths` gives month ranges.
- **Flows** (`plannerFlows`): adds new solar and extra loads to the readings, then applies the export limit. The limit is `max(limit, what the meter already sent)`, and `expRaw` keeps what would have gone out before the limit.
- **Negative feed-in**: by default (`switchOffNegative`), exports at a negative sell price are dropped (`exportsFor`, or `curtailNegative` in the battery run). The UI says this needs a curtailable inverter.
- **Battery** (`simulateBattery`): one day at a time with that day's prices known (perfect daily foresight). It searches a charge threshold and a discharge threshold per day. It charges from solar over the export cap first, then from cheap or free grid; it discharges into dear use and high feed-in. Charge and discharge share the power limit, and a small wear cost per kWh stops pointless cycling. `limited` counts what's thrown away at the export limit.
- **Existing battery**: `plannerDetectExisting` guesses panels and battery from the readings. `plannerUnwindBattery` removes the battery's effect (grid sales are seen directly; what it covered at home is estimated), and the search re-runs it on every plan with any new battery. `plannerExistingCheck` compares the planner's version with the real readings.
- **Search** (`plannerSearch`): every solar size on every plan without a battery. A probe battery ranks plans, then the full battery search runs on the best `keepPlans` (6) plus any that must be included. `allowPlans` limits the plans considered to those ticked.
- **Money** (`plannerCapex`, `plannerFinance`): the up-front cost after rebates (the battery rebate follows `Amber.BATTERY_REBATE_TIERS`: full to 14 kWh, 60% to 28 kWh, 15% to 50 kWh). Then year by year: savings grow with price rises and shrink with panel and battery wear, the battery and inverter are replaced, and a battery replaced inside the period is credited with its remaining life. The results are NPV, IRR, payback "ahead for good" (and the first time it reaches $0), and `plannerWaitAYear`.
- **Ratings** (`plannerKeenLevel`): the value per $1 up front (≥1.75 Strong, ≥1.4 Good, ≥1.15 Modest). Strong and Good also need the result to hold with prices 20% lower and with 10am–3pm feed-in halved (`dayFeedInScale`), and payback within 8 years.
- **UI** (`planner-ui.js`): `search()` gathers inputs, `analyse()` builds options against the yardstick, and the `render*` functions build each card as HTML strings (escaped with `esc`).

## Storage keys

| Where | Key | What |
|---|---|---|
| IndexedDB | `AmberDataCacheDB` / `dailyUsage` | Meter readings per site and day |
| localStorage | `amberApiKey` (or sessionStorage) | Obfuscated API key |
| localStorage | `selectedSiteId`, `startDate`, `endDate`, `activeTab` | Where the user was |
| localStorage | `selectedState`, `selectedPlan`, `rateType`, `planName`, `flatRate`, `flatFeedInRate`, `flatControlledLoad`, `dailyConnectionRate`, `touConfig`, `feedInWindows`, `enableFeedInTou`, `demandSettings`, `ratesDetailsOpen` | The Compare plan form |
| localStorage | `selectedPlanSig` | Fingerprint (`Amber.templateSignature`) of the built-in plan the form was filled from. If it no longer matches on load, the plan's prices have changed and the form is filled again |
| localStorage | `customSupplierPlans` | Saved custom plans |
| localStorage | Amber charge field IDs | Amber's fixed charges (this year and last) |
| localStorage | `localSites` | Imported NEM12 households |
| localStorage | `batteryShiftSettings` | Free? tab settings |
| localStorage | `amberBillCheck` | The last bill check |
| localStorage | `plannerSettings` | Every Solar+? input and the company ticks |

Saved JSON is read through `storedJson` (`app-core.js`) and `storedCustomPlans` (`app-plan-form.js`): a value that is missing, damaged or the wrong shape falls back to the default instead of stopping `init()`.

## External data

- **AEMO prices**: `scripts/update-prices.js` downloads `PRICE_AND_DEMAND_<YYYYMM>_<REGION>.csv` from AEMO into `data/prices/<REGION>/<YYYY-MM>.json` as `{ region, month, interval: 5, rrp: [...] }` ($/MWh, interval ending `month-01 00:00 + (i+1)×5 min` NEM time). `.github/workflows/update-prices.yml` runs it daily at 1:17 am AEST and commits changes.
- **PVGIS weather**: `scripts/update-solar.js` downloads a typical meteorological year (hourly GHI, DNI, DHI and temperature) and PVGIS's own 1 kW yield for each town in `Amber.SOLAR_LOCATIONS`. It's run by hand; the files don't change.
- **Plan prices**: maintained by hand in `templates.js` (with `asAt` dates) and `networks.js` (Amber's FY2026-27 network tariffs). `Amber.TEMPLATES_AS_AT` is shown in the UI.

## Security and privacy

- The CSP (`index.html` `<meta http-equiv="Content-Security-Policy">`) is `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://api.amber.com.au; img-src 'self' data:; …`. This means no inline scripts, no inline `<style>` and no `style="…"` attributes (setting `element.style.x` from JS is fine), and no third-party hosts.
- All data stays in the browser. The API key is obfuscated (XOR with a fixed key, then base64), not encrypted.
- Text is formatted in one place each: dollars with `Amber.money` (`costs.js`: "$1,234.56", a proper minus sign, whole dollars on Solar+?), dates with `Amber.formatDate` (`time.js`: "31 Oct 2026"), plan rates with `Amber.formatCentsPerKwh` ("27.11 c/kWh"), and percentages with no space ("20%").
- Dynamic HTML is built with template strings. Anything from data or user input goes through `Amber.escapeHTML` (aliased `esc` in `planner-ui.js`), which escapes `& < > " '`, so it is safe inside an element and inside a quoted attribute.

## Build, test and CI

- `npm run build:css` rebuilds `css/app.css`. Tailwind scans `index.html` and `js/**/*.js` for class names, and `tailwind.config.js` safelists classes that are only built dynamically. Commit `css/app.css` after changing classes.
- **Lint**: `npm run lint` runs ESLint 10 with `eslint.config.js` (a flat config). The files in `js/` are checked as classic browser scripts, and the unit checks, scripts and specs as CommonJS. On top of ESLint's recommended set it reports unused variables, shadowed names, `var`, `==` and a `let` that never changes, and holds the house style (4-space indent, single quotes, semicolons, from `@stylistic/eslint-plugin`). One rule is the project's own: `local/no-extra-arguments` (`eslint-rules/no-extra-arguments.js`) reports a call that passes more arguments than the function takes, for functions and `Amber.*` functions defined in the same file. Rules are tuned to the code rather than the code restyled: the tests keep their own alignment of long asserts, and `preserve-caught-error` is off because network errors are replaced on purpose by plain messages.
- **Unit checks**: `tests/unit-*.js`, run with plain `node` (`npm run test:unit`). Each prints `ok:` / `FAIL:` lines and exits non-zero on failure. `unit-syntax.js` runs first: it parses every `js/*.js` (no other unit script loads the DOM files such as `help.js` and `app.js`), checks that `index.html` loads each of them once, with `app.js` last, and checks the calls between the app files through `Amber.app`. `unit-planner.js` holds the parity checks: the planner's cost equals Compare's, battery energy balances, finance and ratings.
- **End-to-end**: `tests/*.spec.js` with Playwright (Chromium) against `scripts/static-server.js` on port 4173 (`playwright.config.js`, `reuseExistingServer: true`). Tests mock Amber's API with `page.route('**/api.amber.com.au/**', …)` and build NEM12 files in code. About 69 tests take about a minute with two workers.
- **CI**: `.github/workflows/test.yml` runs `npm ci`, `npm run lint`, installs Chromium and runs `npm test -- --workers=2` on every pull request and on pushes to `main`. Failed runs upload `test-results/`.

## Releases

Each change ships as a version:

1. Bump the version in three places: `index.html` (the `<title>`, the "Version X." line in the header, and every `?v=` query string), `js/constants.js` (`Amber.APP_VERSION`), and `tests/unit-time.js` (the version assert).
2. `npm run build:css` if classes changed; update the README and these docs if behaviour changed.
3. Run `npm run lint` and `npm test`, open a pull request, and merge once the Tests check passes. GitHub Pages serves `main`.
