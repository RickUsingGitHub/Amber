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
- Five tabs: Start (welcome, Amber account, history import, non-Amber households, jargon buster), Compare (plan to compare with and its prices, the answer, every plan, month by month, free-power plans), My usage (one day, average day, calendar, more numbers), Bill check, and Solar & battery. The dates bar appears once there's something to look at
- Opens on This month and compares straight away when an API key is saved
- Bill Check loads the bill period's meter data as soon as a bill is uploaded (and when you come back to the tab), then checks every line against your meter data: usage, peak demand and demand charges, daily supply, subscription, GST, charges total, solar exports and export credits
- Import Amber's usage export (CSV) on Setup to go beyond the API's ~3 months: it fills the same cache as Compare (keeping days already fetched from the API and leaving the last week to the API), flags the network demand window (Ausgrid, Endeavour, Energex, Essential and Evoenergy demand tariffs; for other tariffs it is learned from the days Amber's API flagged), then compares the whole months imported. Last 12 months date preset
- Re-scheduling estimate for free-window plans: re-times your real interval data into each plan's free window and best feed-in window, at the daily shift budgets you choose, over every whole month within the chosen dates. Battery size field (blank = auto from exports after dark, 0 = none): without a battery only load you move (EV, pool pump, hot water) shifts, and no battery exports are invented
- Households not on Amber: import their meter data (NEM12, from their retailer or network; files with only the 200/300 data rows are fine, a meter that switches from 30- to 5-minute readings part way through is read correctly, and days with missing readings are left out rather than counted as zero, with the summary saying how many) on Setup and the app rebuilds what Amber would have charged for every interval: AEMO's 5-minute wholesale price for the region × a loss factor, plus Amber's 2026-27 network, market, environmental and hedging charges for the chosen network tariff (all 11 networks Amber serves), plus GST; feed-in at the wholesale price plus the export tariff. A second meter channel that is off most of the day is taken as controlled load (CL2 if it also runs in the daytime). Amber's daily, metering, subscription and demand charges come from the same tariff, and Amber's quarterly wholesale price cap is applied. No API key needed; the household appears as a site you can compare against any plan, including the free-window estimate. Checked against a year of real Amber prices on Ausgrid EA116/EA029: on average within 0.05 c/kWh per interval, and the year's usage and feed-in costs within 1% (the gap is last year's slightly lower network charges)
- Demand charges worked out per calendar month, from each month's own peak
- Ausgrid EA029 exports settled as on the bill: free midday allowance, with the export charge on usage
- 24-hour average and daily charts, with competitor c/kWh in the hover tooltip
- Daily calendar; click a day to open it on the graph
- IndexedDB cache, GST toggle
- CSV export of every meter reading, daily totals or the comparison table
- Multi-site picker when your Amber account has more than one NMI
- Editable Amber daily connection, subscription and demand rates for this financial year and last (days before 1 July 2026 use last year's); an uploaded bill fills the year it belongs to
- More Stats: average import and feed-in prices, price-spike and negative-price exposure, evening import share, grid-free days
- Solar & battery planner: from the last 12 months of meter readings (Amber's, an imported Amber CSV, or any household's NEM12), tries every mix of new solar size, battery size and plan for the network, half hour by half hour, and ranks them by 20-year value, payback or yearly bill. Every option is measured against one yardstick: nothing new on the plan to compare against, by default whichever plan is cheapest with nothing new (switching is free), so fixing a retailer doesn't change an option's numbers. Any of the three can be fixed ("a size I choose", "none", or one plan). Shows next year's bill month by month against today's, a payback chart at today's prices and ±20% (payback is when it's ahead for good, after any battery replacement), worth in today's money and IRR (a battery replaced within the years compared is credited with the life it has left at the end), a "wait a year" check, and what just switching plan would save. Each plan is priced exactly as on Compare (free windows and caps, capped and time-varying feed-in, demand, Amber's export charge); missing Amber feed-in prices are rebuilt from AEMO wholesale prices. The battery charges from spare solar and from free or cheap grid hours, covers the home when power is dear and sells into high feed-in prices, knowing each day's prices in the morning. Solar comes from a PVGIS 5.3 typical year (ERA5) for 22 towns (`data/solar`, fetched by `scripts/update-solar.js`), with sun position, tilt, facing, shade, temperature and inverter clipping, scaled to PVGIS's own yield. Homes that already have panels or a battery: the app spots them in the readings (solar sent out; selling after dark or quiet nights) and pre-fills a guess. Existing panels stay in the readings and new ones are added on top. An existing battery is taken out of the readings (selling to the grid is seen directly; what it covered at home is estimated from its size, the days it filled up and ran flat, and the home's use on nights it was empty; its charging from spare solar first, then from the grid in the cheapest half hours that bought more than usual) and run again on every plan with any new battery, since it would behave differently on another plan. A check card compares the planner's run of that battery on today's plan with the real readings, and shows what the battery saves. Allows for the federal solar (STC) and battery rebates shrinking each year, hardware getting cheaper, panel and battery wear, battery and inverter replacement, the export limit, and planned changes: an electric car, heat-pump hot water, gas heating and cooking to electric (with the gas bill saved)

## Privacy

- The API key is stored only in this browser (localStorage or sessionStorage). It is obfuscated, not encrypted.
- Usage data is requested directly from `https://api.amber.com.au` and never sent anywhere else. Imported files (Amber CSV, NEM12, bills) are read in the browser and stay there.
- Wholesale prices for the NEM12 estimate are files in this repo (`data/prices`), refreshed daily from AEMO by a GitHub Action (`scripts/update-prices.js`).
- Uncheck **Remember key on this device** to keep the key in the session only.
- The last checked bill's line items stay in localStorage until you click **Clear**.

## Local development

```bash
npm install
npm run build:css
npm test
npm run serve
```

`npm test` runs the unit checks (time and TOU, bill reading, More Stats, demand, Bill Check, re-scheduling, usage import, NEM12 estimate, solar & battery planner), then Playwright against a local static server. `npm run test:unit` runs only the unit checks.

## Known limitations

- Amber API rate limits still apply; fetches run a few chunks at a time and retry 429s.
- Retailer templates are estimates from published tariffs. Check Energy Made Easy or the retailer's current fact sheet before switching.
- Public holidays are not treated as off-peak.
- Comparison accuracy depends on the Amber fixed charges you enter (they vary by network).
- Imported usage has no renewables or price-spike details. Demand windows ignore public holidays, and Energex/Essential monthly demand charges are approximated as daily ones.
- The re-scheduling estimate uses meter data only (no battery telemetry): it assumes each day's shift budget is available and leaves midday solar exports where they were.
- Sites with several general meters (E1 + E2) have demand worked out on their combined use.
- The NEM12 estimate assumes the household keeps using power exactly as it did. With a battery on Amber, SmartShift would usually do better. Loss factors other than Ausgrid's are typical values, not measured; seasonal and monthly demand charges are spread by month; Evoenergy's off-peak demand charge is not modelled.
- The planner uses last year's usage and today's plan prices (Amber: last year's interval prices) for every future year, scaled by the price rise you set. Its battery knows each day's prices in advance, so a real one may do a little worse; network tariff changes after installing, VPP payments and blackout backup aren't counted. West-facing solar may read slightly low because the typical-year weather has cloudier afternoons. An existing battery's work at home can't be seen on the meter, so taking it out of the readings is an estimate; the check card shows how close it comes, but can't tell if the battery size entered is wrong (take off any backup reserve). Hardware and rebate defaults are rough late-2026 guides: use your quotes.
- Bill Check reads the Amber bill layouts seen so far. If it can't read a bill, it shows the text it read so the reader can be fixed.

Built for Australian energy customers who want a transparent look at wholesale vs retailer pricing.
