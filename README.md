# Amber Compare & Export

A browser-based tool for analysing [Amber Electric](https://www.amber.com.au/) usage, comparing costs with traditional suppliers, and exporting CSV data.

Runs entirely in your browser. No installation required.

## Quick start

**[Launch the app](https://rickusinggithub.github.io/Amber/)**

Open `index.html` on GitHub Pages, via `npm run serve`, or as a local file. Scripts are classic (not ES modules), so `file://` works in most desktop browsers.

You need an Amber API key from [app.amber.com.au/developers](https://app.amber.com.au/developers).

## Features

- Compare Amber vs a flat or time-of-use retailer plan, including controlled load and optional demand tariffs
- Pre-built templates for each state, including 2026-27 Victorian Default Offer rates for all five networks
- Time-varying feed-in (for example Synergy DEBS 10c peak / 2c off-peak), with optional daily kWh caps
- Free-window plans: a free (or cheap) window with an optional daily kWh cap, a super off-peak / EV window, and seasonal peak windows. Templates for CovaU SolarMax, GloBird Four4Free, OVO The Free 4 Plan and the Solar Sharer Offer (Ausgrid)
- Four tabs: Daily (day graph, 24-hour average, calendar, stats), Bill Check, Compare plans (plan choice and rates, results, all plans, monthly, free-window plans) and Setup (API key, site, Amber charges). Dates and Compare stay above the tabs
- Opens on This month and compares straight away when an API key is saved
- Bill Check loads the bill period's meter data as soon as a bill is uploaded (and when you come back to the tab), then checks every line
- Battery re-scheduling estimate: re-times your real interval data into each free-window plan's free window and best feed-in window, at the daily shift budgets you choose, over every whole month cached
- 24-hour average and daily charts, with competitor c/kWh in the hover tooltip
- Daily calendar; click a day to open it on the graph
- IndexedDB cache, CSV export, GST toggle
- Multi-site picker when your Amber account has more than one NMI
- Editable Amber daily connection, subscription and demand rates
- More Stats: average import and feed-in prices, price-spike and negative-price exposure, evening import share, grid-free days

## Privacy

- The API key is stored only in this browser (localStorage or sessionStorage). It is obfuscated, not encrypted.
- Usage data is requested directly from `https://api.amber.com.au` and never sent anywhere else.
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
- The battery re-scheduling estimate uses meter data only (no battery telemetry): it assumes each day's shift budget is available and leaves midday solar exports where they were.

Built for Australian energy customers who want a transparent look at wholesale vs retailer pricing.
