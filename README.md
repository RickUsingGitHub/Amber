# Amber Compare & Export

A browser-based tool for analysing [Amber Electric](https://www.amber.com.au/) usage, comparing costs with traditional suppliers, and exporting CSV data.

Runs entirely in your browser. No installation required.

## Quick start

**[Launch the app](https://rickusinggithub.github.io/Amber/)**

Open `index.html` on GitHub Pages, via `npm run serve`, or as a local file. Scripts are classic (not ES modules), so `file://` works in most desktop browsers.

You need an Amber API key from [app.amber.com.au/developers](https://app.amber.com.au/developers), except to check a household that isn't on Amber (see below).

## Features

- Compare Amber vs a flat or time-of-use retailer plan, including controlled load and optional demand tariffs
- Pre-built templates for each state, including 2026-27 Victorian Default Offer rates for all five networks
- Time-varying feed-in (for example Synergy DEBS 10c peak / 2c off-peak), with optional daily kWh caps
- Free-window plans: a free (or cheap) window with an optional daily kWh cap, a super off-peak / EV window, and seasonal peak windows. Templates for CovaU SolarMax, GloBird Four4Free, OVO The Free 4 Plan, and the Solar Sharer Offer for Ausgrid, Endeavour, Essential Energy, Energex and SA Power Networks
- Written for everyday users: a welcome screen with two paths ("I'm with Amber" / "I'm thinking about Amber"), plain-English labels, a ? help bubble beside every input and table heading (hover, tap or keyboard; Escape closes), and a jargon buster on the Start tab
- Four tabs: Start (welcome, Amber account, history import, non-Amber households, jargon buster), Compare (plan to compare with and its prices, the answer, every plan, month by month, free-power plans), My usage (one day, average day, calendar, more numbers) and Bill check. The dates bar appears once there's something to look at
- Opens on This month and compares straight away when an API key is saved
- Bill Check loads the bill period's meter data as soon as a bill is uploaded (and when you come back to the tab), then checks every line
- Import Amber's usage export (CSV) on Setup to go beyond the API's ~3 months: it fills the same cache as Compare (keeping days already fetched from the API and leaving the last week to the API), flags the network demand window (Ausgrid, Endeavour, Energex, Essential and Evoenergy demand tariffs; for other tariffs it is learned from the days Amber's API flagged), then compares the whole months imported. Last 12 months date preset
- Re-scheduling estimate for free-window plans: re-times your real interval data into each plan's free window and best feed-in window, at the daily shift budgets you choose, over every whole month cached. Battery size field (blank = auto from exports after dark, 0 = none): without a battery only load you move (EV, pool pump, hot water) shifts, and no battery exports are invented
- Households not on Amber: import their meter data (NEM12, from their retailer or network; files with only the 200/300 data rows are fine) on Setup and the app rebuilds what Amber would have charged for every interval: AEMO's 5-minute wholesale price for the region × a loss factor, plus Amber's 2026-27 network, market, environmental and hedging charges for the chosen network tariff (all 11 networks Amber serves), plus GST; feed-in at the wholesale price plus the export tariff. A second meter channel that is off most of the day is taken as controlled load (CL2 if it also runs in the daytime). Amber's daily, metering, subscription and demand charges come from the same tariff, and Amber's quarterly wholesale price cap is applied. No API key needed; the household appears as a site you can compare against any plan, including the free-window estimate. Checked against a year of real Amber prices on Ausgrid EA116/EA029: on average within 0.05 c/kWh per interval, and the year's usage and feed-in costs within 1% (the gap is last year's slightly lower network charges)
- 24-hour average and daily charts, with competitor c/kWh in the hover tooltip
- Daily calendar; click a day to open it on the graph
- IndexedDB cache, CSV export, GST toggle
- Multi-site picker when your Amber account has more than one NMI
- Editable Amber daily connection, subscription and demand rates for this financial year and last (days before 1 July 2026 use last year's); an uploaded bill fills the year it belongs to
- More Stats: average import and feed-in prices, price-spike and negative-price exposure, evening import share, grid-free days

## Privacy

- The API key is stored only in this browser (localStorage or sessionStorage). It is obfuscated, not encrypted.
- Usage data is requested directly from `https://api.amber.com.au` and never sent anywhere else. Imported files (Amber CSV, NEM12, bills) are read in the browser and stay there.
- Wholesale prices for the NEM12 estimate are files in this repo (`data/prices`), refreshed daily from AEMO by a GitHub Action (`scripts/update-prices.js`).
- Uncheck **Remember key on this device** to keep the key in the session only.

## Local development

```bash
npm install
npm run build:css
npm test
npm run serve
```

`npm test` runs timezone/TOU unit checks, then Playwright against a local static server.

## Known limitations

- Amber API rate limits still apply; fetches run a few chunks at a time and retry 429s.
- Retailer templates are estimates from published tariffs. Check Energy Made Easy or the retailer's current fact sheet before switching.
- Public holidays are not treated as off-peak.
- Comparison accuracy depends on the Amber fixed charges you enter (they vary by network).
- Imported usage has no renewables or price-spike details. Demand windows ignore public holidays, and Energex/Essential monthly demand charges are approximated as daily ones.
- The re-scheduling estimate uses meter data only (no battery telemetry): it assumes each day's shift budget is available and leaves midday solar exports where they were.
- Sites with several general meters (E1 + E2) have demand worked out on their combined use.
- The NEM12 estimate assumes the household keeps using power exactly as it did. With a battery on Amber, SmartShift would usually do better. Loss factors other than Ausgrid's are typical values, not measured; seasonal and monthly demand charges are spread by month; Evoenergy's off-peak demand charge is not modelled.

Built for Australian energy customers who want a transparent look at wholesale vs retailer pricing.
