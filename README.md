# Amber Compare & Export

A browser-based tool for analysing [Amber Electric](https://www.amber.com.au/) usage, comparing costs with traditional suppliers, checking Amber bills against meter data, and exporting CSV data.

Runs entirely in your browser. No installation required.

## Quick start

**[Launch the app](https://rickusinggithub.github.io/Amber/)**

Open `index.html` on GitHub Pages, via `npm run serve`, or as a local file. Scripts are classic (not ES modules), so `file://` works in most desktop browsers.

You need an Amber API key from [app.amber.com.au/developers](https://app.amber.com.au/developers).

## Features

- Compare Amber vs a flat or time-of-use retailer plan, including controlled load and optional demand tariffs
- All plans in your state ranked against Amber on the same usage; click one to compare it in detail
- Pre-built templates for each state, including 2026-27 Victorian Default Offer rates for all five networks
- Time-varying feed-in (for example Synergy DEBS 10c peak / 2c off-peak)
- Date presets: last 7 days, this month, last month, last 3 months, last 90 days
- Demand charges worked out per calendar month, from each month's own peak
- Ausgrid EA029 exports settled as on the bill: free midday allowance, with the export charge on usage
- Bill Check: upload the PDF Amber emails you and compare each line with your meter data (usage, peak demand and demand charges, daily supply, subscription, GST, charges total, solar exports and export credits). It also fills in the Amber charges from the bill
- Monthly Breakdown: one row per calendar month with import and export kWh, usage, feed-in, demand, fixed charges, and Amber vs the other plan
- 24-hour average and daily charts, with competitor c/kWh in the hover tooltip
- Daily calendar; click a day to open it on the graph
- IndexedDB cache, GST toggle
- CSV export of full interval data, daily summaries or the results table
- Multi-site picker when your Amber account has more than one NMI
- Editable Amber daily connection, subscription and demand rates
- More Stats: average import and feed-in prices, price-spike and negative-price exposure, evening import share, grid-free days

## Privacy

- The API key is stored only in this browser (localStorage or sessionStorage). It is obfuscated, not encrypted.
- Usage data is requested directly from `https://api.amber.com.au` and never sent anywhere else.
- Uncheck **Remember key on this device** to keep the key in the session only.
- Bills are read in your browser and never uploaded. The last checked bill's line items stay in localStorage until you click **Clear**.

## Local development

```bash
npm install
npm run build:css
npm test
npm run serve
```

`npm test` runs the unit checks (time and TOU, bill reading, More Stats, demand, Bill Check), then Playwright against a local static server. `npm run test:unit` runs only the unit checks.

## Known limitations

- Amber's API only provides the last 3 months of usage data.
- Amber API rate limits still apply; fetches run a few chunks at a time and retry 429s.
- Retailer templates are estimates from published tariffs. Check Energy Made Easy or the retailer's current fact sheet before switching.
- Public holidays are not treated as off-peak.
- Comparison accuracy depends on the Amber fixed charges you enter (they vary by network).
- Bill Check reads the Amber bill layouts seen so far. If it can't read a bill, it shows the text it read so the reader can be fixed.

Built for Australian energy customers who want a transparent look at wholesale vs retailer pricing.
