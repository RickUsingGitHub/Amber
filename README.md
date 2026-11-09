# Amber Compare & Export

A free, browser-only tool for Australian electricity customers. It shows what your power really costs on [Amber Electric](https://www.amber.com.au/) (wholesale prices), checks an Amber bill line by line, compares Amber with retailers' flat, time-of-use and free-power plans, and plans solar and battery purchases from a year of your own meter data. It also works for households that aren't on Amber, from their NEM12 meter file.

Everything runs in the browser: there is no server and no account, and nothing is uploaded.

**[Launch the app](https://rickusinggithub.github.io/Amber/)**

## Contents

- [Getting started](#getting-started)
- [What each tab does](#what-each-tab-does)
- [Where the numbers come from](#where-the-numbers-come-from)
- [Data completeness and CSV backups](#data-completeness-and-csv-backups)
- [Privacy](#privacy)
- [For developers](#for-developers)
- [Known limitations](#known-limitations)
- [Disclaimer](#disclaimer)

## Getting started

Open the app (GitHub Pages, `npm run serve`, or `index.html` as a local file: the scripts are classic scripts, not ES modules, so `file://` works in most desktop browsers). The Start tab offers two paths:

- **I'm with Amber**: paste an API key from [app.amber.com.au/developers](https://app.amber.com.au/developers). The app opens on This month and compares straight away whenever a key is saved. Amber's API reaches back about 3 months; import Amber's usage export (CSV) to go further.
- **I'm thinking about Amber**: import the household's meter data (a NEM12 file from its retailer or network). No API key is needed.

## What each tab does

The tab bar is Start, Compare, Usage, Bill?, Free? and Solar+?. Hovering a tab shows its full name. The dates bar (dates, quick picks such as Last 12 months, and Compare costs) appears once there is something to look at. Every input and table heading has a **?** help bubble (hover, tap or keyboard; Escape closes), and the Start tab has a jargon buster.

### Start

- Connect an Amber account (API key, remembered on this device or for the session only), pick a site when the account has several NMIs, and edit Amber's daily connection, subscription and demand rates for this financial year and last (days before 1 July 2026 use last year's). An uploaded Amber bill fills the year it belongs to.
- **Import Amber's usage export (CSV)** to go beyond the API's ~3 months. It fills the same cache as Compare, keeps days already fetched from the API, leaves the last week to the API, and flags the network demand window (Ausgrid, Endeavour, Energex, Essential and Evoenergy demand tariffs; for other tariffs it is learned from the days Amber's API flagged).
- **Households not on Amber**: import a NEM12 file and the app rebuilds what Amber would have charged for every interval (see [Where the numbers come from](#where-the-numbers-come-from)). The household then appears as a site that works everywhere else in the app.

### Compare

- Pick a plan to compare with: pre-built templates for each state (including 2026-27 Default Market Offer and Victorian Default Offer rates, market offers, and the Solar Sharer Offer), or your own flat or time-of-use plan with controlled load, optional demand tariffs, time-varying feed-in (for example Synergy DEBS 10c peak / 2c off-peak) with optional daily kWh caps, and free-window plans (a free or cheap window with an optional daily cap, a super off-peak / EV window, and seasonal peak windows).
- The answer for the chosen dates, every plan for your network ranked, and month by month. Demand charges are worked out per calendar month from each month's own peak, and Ausgrid EA029 exports are settled as on the bill (free midday allowance, export charge on usage). GST can be shown or hidden.
- Download every meter reading, daily totals or the comparison table as CSV.

### Usage

- A 24-hour average and a daily chart (with the compared plan's c/kWh in the tooltip), a calendar (click a day to open it on the graph), and More Stats: average import and feed-in prices, price-spike and negative-price exposure, evening import share and grid-free days.

### Bill?

- Upload an Amber bill (PDF or text). The app loads the bill period's meter data and checks every line against it: usage, peak demand and demand charges, daily supply, subscription, GST, the charges total, solar exports and export credits.

### Free?

- For free-window plans (CovaU SolarMax, GloBird Four4Free, OVO The Free 4 Plan and the Solar Sharer Offer for Ausgrid, Endeavour, Essential Energy, Energex and SA Power Networks), a re-scheduling estimate re-times your real interval data into each plan's free window and best feed-in window, at the daily shift budgets you choose, over every whole month in the chosen dates. A battery size field (blank = worked out from exports after dark, 0 = none) controls whether a battery can shift exports; without one, only load you move (EV, pool pump, hot water) shifts.

### Solar+?

The solar and battery planner. From the last 12 months of meter readings (Amber's, an imported Amber CSV, or a NEM12 file) it tries every mix of new solar size, battery size and plan for the network, half hour by half hour, and ranks them by 20-year value, payback or yearly bill.

- **What you can set**: panels, battery and plan can each be "find the best", "a size I choose", "none", or one plan. Companies, or single plans, can be ticked or unticked; only ticked plans are searched and shown. Roof size, facing, pitch, shade, town, export limit, whether panels switch off at negative feed-in prices, battery round trip and power, prices and rebates, wear and replacement, price rises, the interest rate and planned changes (an electric car, heat-pump hot water, gas heating and cooking to electric with the gas bill saved).
- **The yardstick**: every option is measured against nothing new on the plan you compare against; by default that's whichever ticked plan is cheapest for you with nothing new, since switching is free.
- **What it shows**:
  - the best option, with what to ask installers for (panel, inverter and battery sizes; a "curtailable" inverter where the feed-in price goes below zero, and on Amber a battery SmartShift can run);
  - a **How keen to be** rating (Not worth it, Marginal, Modest, Good or Strong). It comes from the value per $1 up front, whether it still pays with prices 20% lower or with 10am–3pm feed-in halved, and payback, plus whether waiting a year would cost anything;
  - every option ranked, and next year month by month against today;
  - **Where the saving comes from**: power bought, power sent out, export and demand charges, and where the new panels' power goes (used at home, stored or sent out, lost to the export limit, switched off at negative prices, or clipped by the inverter);
  - **Check the numbers**: average c/kWh bought and earned, daily charges, the plan's prices through the day, rules of thumb (kWh a day per kW of panels; what each kWh of new solar or battery output is worth against what it costs) and the settings used;
  - **Paying it back**: a chart at today's prices and ±20%, with the $0 line marked. Payback is when it's ahead for good, after any battery replacement. Worth is in today's money, with IRR, and a battery replaced within the years compared is credited with the life it has left.
- **Homes that already have panels or a battery**: the app spots them in the readings and pre-fills a guess. Existing panels stay in the readings and new ones are added on top. An existing battery is taken out of the readings, then run again on every plan together with any new battery, and a check card compares the planner's version of it with the real readings.

## Where the numbers come from

- **Amber prices**: Amber's API (or its usage export) gives each interval's price. Fixed charges come from the rates on the Start tab.
- **Other plans**: templates in `js/templates.js`, from published tariffs (AER and ESC default offers, Energy Made Easy, retailer fact sheets), each with an "as at" date.
- **The NEM12 estimate** (households not on Amber): AEMO's 5-minute wholesale price for the region × a loss factor, plus Amber's 2026-27 network, market, environmental and hedging charges for the chosen network tariff (all 11 networks Amber serves), plus GST. Feed-in is the wholesale price plus the export tariff, and Amber's quarterly wholesale price cap is applied. A second meter channel that is off most of the day is taken as controlled load (CL2 if it also runs in the daytime). NEM12 files with only 200/300 rows are fine, a meter that switches from 30- to 5-minute readings part way through is read correctly, and days with missing readings are left out rather than counted as zero. Checked against a year of real Amber prices on Ausgrid EA116/EA029: within 0.05 c/kWh per interval on average, and the year's usage and feed-in costs within 1%.
- **Wholesale prices**: `data/prices/<region>/<month>.json`, refreshed daily from AEMO by a GitHub Action (`scripts/update-prices.js`).
- **Solar**: a PVGIS 5.3 typical year (ERA5) for 22 towns (`data/solar`, fetched once by `scripts/update-solar.js`), with sun position, tilt, facing, shade, temperature and inverter clipping, scaled to PVGIS's own yield.

## Data completeness and CSV backups

- When the selected dates contain days without readings, Compare labels the result **Incomplete comparison**. Usage costs leave out missing readings, while fixed charges and export allowances cover the full period, so savings are provisional until the missing readings arrive. The calendar labels missing days **No readings** rather than treating them as zero use. Daily CSV and calendar totals cover only dates with readings and may differ from an incomplete full-period comparison.
- Daily free-power and feed-in caps are shared across the household's meter channels. Ausgrid export settlement adjustments are allocated to days in proportion to midday exports, so daily totals reconcile with the period's settlement; they aren't separate daily allowances.
- **Download → Every meter reading** produces a versioned CSV that can be restored through the Amber usage CSV import on the Start tab, for the same Amber site. It keeps the original NEM interval-end times, duration, quality, renewables and demand flags, including zero-use channels. Whole-day backups can restore recent and estimated readings; cached final API days are kept, and estimated readings can still be refreshed from the API. Incomplete days aren't restored. App exports from before the version column aren't supported as backups (Amber's own usage export is). For a non-Amber household, keep its original NEM12 file to re-import.

## Privacy

- The API key is stored only in this browser (localStorage, or sessionStorage if **Remember key on this device** is unticked). It is obfuscated, not encrypted.
- Usage data is requested directly from `https://api.amber.com.au` and never sent anywhere else; the page's Content Security Policy allows no other connections. Imported files (Amber CSV, NEM12, bills) are read in the browser and stay there.
- Meter readings are cached in IndexedDB; settings, saved plans, imported households and the last checked bill (until **Clear**) are in localStorage. The settings menu (cog) can clear the cache and saved plans.

## For developers

```bash
npm install          # Tailwind CLI and Playwright
npm run build:css    # css/input.css -> css/app.css (commit the result)
npm test             # unit checks, then Playwright against a local static server
npm run test:unit    # unit checks only
npm run serve        # http://127.0.0.1:4173
```

There is no bundler and no framework: plain JavaScript files share one `window.Amber` namespace and load in order from `index.html`. Tests run in GitHub Actions on every pull request.

More detail for contributors and reviewers:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organised, the data model, how each tab works, the planner engine, storage, external data, build, tests and releases.
- [docs/FRONTEND.md](docs/FRONTEND.md): the UI as it stands, what a redesign must keep (IDs, data attributes, help keys, CSP), styling, accessibility and known UI issues.
- [docs/REVIEW.md](docs/REVIEW.md): a guide for code review: invariants, where the risk is, known technical debt and open questions.
- [CLAUDE.md](CLAUDE.md): short working rules for AI coding agents.

## Known limitations

- Amber API rate limits still apply; fetches run a few chunks at a time and retry 429s.
- Retailer templates are estimates from published tariffs. Check Energy Made Easy or the retailer's current fact sheet before switching.
- Public holidays are not treated as off-peak.
- Comparison accuracy depends on the Amber fixed charges entered (they vary by network).
- Imported usage has no renewables or price-spike details. Demand windows ignore public holidays, and Energex/Essential monthly demand charges are approximated as daily ones.
- The re-scheduling estimate uses meter data only (no battery telemetry): it assumes each day's shift budget is available and leaves midday solar exports where they were.
- Sites with several general meters (E1 + E2) have demand worked out on their combined use.
- The NEM12 estimate assumes the household keeps using power exactly as it did. With a battery on Amber, SmartShift would usually do better. Loss factors other than Ausgrid's are typical values, not measured; seasonal and monthly demand charges are spread by month; Evoenergy's off-peak demand charge is not modelled.
- The planner uses last year's usage and today's plan prices (Amber: last year's interval prices) for every future year, scaled by the price rise you set. Its battery knows each day's prices in advance, so a real one may do a little worse. Network tariff changes after installing, VPP payments and blackout backup aren't counted. West-facing solar may read slightly low because the typical-year weather has cloudier afternoons. An existing battery's work at home can't be seen on the meter, so taking it out of the readings is an estimate; the check card shows how close it comes, but can't tell if the battery size entered is wrong (take off any backup reserve). Hardware and rebate defaults are rough late-2026 guides: use your quotes.
- Bill Check reads the Amber bill layouts seen so far. If it can't read a bill, it shows the text it read so the reader can be fixed.

## Disclaimer

This is a free tool, provided as is, with no guarantee that anything it shows is correct, complete or up to date. Plan prices, network charges, wholesale prices, rebates, and the solar, battery and payback figures are estimates and can be wrong. Much of the app was written with the help of AI, which can make convincing mistakes. It isn't financial, legal or energy advice: check retailers' current fact sheets, your own bills and installers' written quotes before switching plans or buying anything. You use it at your own risk; to the extent the law allows, the author isn't responsible for any loss, cost or decision that comes from using it. The same disclaimer is at the bottom of the app.

Built for Australian energy customers who want a transparent look at wholesale vs retailer pricing.
