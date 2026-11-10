# Frontend guide

What the UI is today, what any redesign has to keep working, and where it could be better. Read with [ARCHITECTURE.md](ARCHITECTURE.md) (code structure) and [REVIEW.md](REVIEW.md) (review notes).

## Constraints a redesign must respect

1. **No build step for JavaScript.** Classic scripts loaded in order from `index.html`, sharing `window.Amber`. A framework or bundler would be a project-level decision, not part of a visual refresh. The page must keep working from `file://` and GitHub Pages.
2. **Content Security Policy** (`index.html`): `script-src 'self'; style-src 'self'`. That rules out inline `<script>`, inline `<style>`, `style="…"` attributes in HTML or in HTML strings built by JS, and CDN fonts or scripts. Setting `element.style.width` etc. from JS is allowed, and is how progress bars are sized. Fonts must be self-hosted (today the system font stack is used).
3. **Tailwind is prebuilt.** Classes must appear literally in `index.html` or `js/**/*.js` for `npm run build:css` to include them; classes assembled from pieces at runtime must be listed in `tailwind.config.js` `safelist`. Commit the rebuilt `css/app.css`.
4. **IDs and data attributes are an API.** The JS looks elements up by ID (`$('id')` / `getElementById`) and the Playwright tests use about 135 distinct `#id` selectors and the `data-*` hooks listed below. Rename one only with its JS and tests.
5. **Help keys.** Every `data-help="key"` must exist in `Amber.HELP` (`js/help.js`). A test fails on unknown keys, and another fails if a visible planner input has no help button nearby.
6. **Independent tool.** This isn't Amber Electric's app. Don't adopt Amber's branding (logo, colours, typography) in a refresh. Consider saying "independent, not affiliated with Amber Electric" near the title; it isn't said explicitly today.
7. **Everything stays in the browser.** No analytics, external fonts, maps or embeds; the CSP's `connect-src` allows only `'self'` and `https://api.amber.com.au`.

## Page structure

```
header        title, one-line description, version, settings cog (#settingsBtn → #settingsMenu),
              #cacheMessage (what a settings action did; in the header so it shows on every tab)
#configSection  "Dates to look at": #startDate, #endDate, #fetchData (Compare costs), [data-preset] quick picks,
                #messageContainer, #progressBar; hidden until there's something to look at
#mainTabs     role="tablist": #tab-setup … #tab-plan (data-tab), scrolls sideways on a phone, never wraps
#resultTools  GST switch (#gstToggle), Download menu (#downloadCsvButton → #csvDropdownMenu)
main          six <section role="tabpanel" id="panel-…" data-panel="…">, one visible at a time
footer        #disclaimerShort, <details id="disclaimer">, ko-fi link
```

The layout is a single centred column (`max-w-4xl`) of white cards (`bg-white rounded-lg shadow-md p-6`) on `bg-gray-100`. The accent colour is Tailwind indigo, with green/red for savings and costs, and amber/orange for warnings.

### Tabs

| Tab | Button / panel | What's on it |
|---|---|---|
| Start | `#tab-setup` / `#panel-setup` | `#welcomeCard` (two choice cards: with Amber / thinking about Amber), `#connectedCard`, `#setupSection` (API key `#apiKey`, `#rememberApiKey`, site picker `#siteSelectorRow`, `<details id="amberChargesDetails">` Amber's fixed charges and bill upload), `#usageImportSection` (Amber CSV), NEM12 import (`#nem12File`, `#nem12Build`, `#localSitesList`), `<details id="glossarySection">` jargon buster |
| Compare | `#tab-compare` / `#panel-compare` | Jump links (`[data-jump]`), `#planChooser` (`#stateSelector`, `#planStateNote`, `#planSelector`, `#ratesDetails`: flat / TOU / feed-in windows / demand forms), `#resultsSection` (`#estimateBanner`, `#qualityBanner`, the answer `#results-table-container`), `#allPlansSection`, `#monthlySection`, `#freePowerPointer` |
| Usage | `#tab-check` / `#panel-check` | `#dailyGraphSection` (`#dailyChart`, day selector), `#averageGraphContainer` (`#usagePriceChart`), `#calendarSection`, `#moreStatsSection` |
| Bill? | `#tab-bill` / `#panel-bill` | `#billCheckSection` (upload, `#billCheckBody` line-by-line table) |
| Free? | `#tab-free` / `#panel-free` | `#freePowerEmpty` (nothing to show yet), `#batteryShiftSection` (budgets, battery size, `#batteryShiftTable`, `#batteryShiftMonthly`) |
| Solar+? | `#tab-plan` / `#panel-plan` | `#planDataStatus`, `#planInputs` (home, what you already have, what to work out, `<details id="planRetailers">` company ticks, Roof and panels, Prices and rebates `#planCostInputs`, Changes you're planning), `#planRun`, `#planProgress`, `#planResults`: `#planRecommendation`, `#planExistingCheck`, options `#planOptionsTable` (`#planRankBy`), `#planDetailBody`, `#planNumbersBody`, payback `#planPaybackChart` + `#planPaybackNotes`, `#planAssumptions` |

Tab behaviour (`app.js` `selectTab`, `setupTabs`): `aria-selected`, roving `tabindex`, Left/Right/Home/End keys, and the last tab remembered in localStorage `activeTab`. The dates bar and the GST/Download tools are hidden until there's something to look at (`syncConnectedUi`) and on Solar+?, which always uses the last 12 months. Panels before results show a `[data-results-placeholder]` pointing to Start (`[data-go-start]`).

### Data attributes used as hooks

| Attribute | Used for |
|---|---|
| `data-tab`, `data-panel` | Tab buttons and panels |
| `data-go-tab`, `data-go-start` | Links that switch tab |
| `data-preset` | Date quick picks (`7d`, `thisMonth`, `lastMonth`, `3m`, `90d`, `12m`) |
| `data-jump`, `data-jump-nav` | In-page jump links |
| `data-results-placeholder` | "Nothing here yet" blocks |
| `data-help`, `data-help-label` | Help bubbles (key into `Amber.HELP`, or plain text; label for screen readers) |
| `data-tou-period`, `data-add-tou-window`, `data-remove-window` | TOU plan form |
| `data-date`, `data-month-key` | Calendar days and months |
| `data-local-use`, `data-local-remove`, `data-nem` | Imported households list, NEM12 options |
| `data-bill-reload` | Bill check reload |
| `data-plan-option` | Rows of the planner options table (`-1` = yardstick, `-2` = cheapest with nothing new) |
| `data-plan`, `data-company`, `data-plan-all`, `data-plan-show`, `data-plan-go` | Planner company and plan ticks |
| `data-keen`, `data-curtail`, `data-numbers` | Planner result blocks (the tests read these) |

## Styling system

- `css/input.css` = Tailwind base + a `@layer components` with the app's own classes:
  - `.main-tab`: tabs, one line on a phone, bigger from `sm`;
  - `.jump-link`;
  - `.plan-input`: planner inputs;
  - `.plan-multi`: the company ticks dropdown;
  - `.calendar-day`, `.day-checkbox-label`;
  - `.gst-switch`: a CSS-only toggle;
  - `.help-btn`, `.help-row`, `.help-bubble`: help bubbles, with a bigger tap target on coarse pointers;
  - `.choice-card`, `.step-num`: the Start tab.
- Everything else is Tailwind utilities written straight into `index.html` and into HTML strings in `app-*.js` / `planner-ui.js`. Common patterns are repeated rather than shared: card, table (`min-w-full divide-y divide-gray-200 text-sm`, `thead bg-gray-50`, `px-2 py-2` cells), small grey notes (`text-xs text-gray-500`) and buttons (indigo primary, white bordered secondary).
- There's no dark mode and no design tokens beyond Tailwind's default palette.

## JS-built UI

Most result content is built as HTML strings and set with `innerHTML`:

- **The page controller** (`app-*.js`):
  - `app-results.js`: the answer table and banners (`displayResults`), every plan (`renderAllPlansTable`), month by month (`renderMonthly`) and More Stats (`renderMoreStats`);
  - `app-plan-form.js`: the TOU and feed-in window rows (`addWindowRow`);
  - `app-free.js`: Free? (`drawBatteryShift`);
  - `app-bill.js`: the bill check (`renderBillCheck`);
  - `app-imports.js`: imported households (`renderLocalSites`) and the NEM12 options (`renderNem12Options`);
  - `app-settings.js`: the settings menu (`buildSettingsMenu`).
- **`planner-ui.js`**: every Solar+? results card (`renderRecommendation`, `renderExistingCheck`, `renderOptions`, `renderDetail` + `breakdownHtml`, `renderNumbers`, `renderPayback`, `renderAssumptions`), and the company tick panel. Small helpers `th()` and `td()` keep its tables consistent.
- **`calendar.js`**: the calendar grid and its tooltips (appended to `body`).
- **`charts.js`** and `planner-ui.js` `renderPayback`: Chart.js charts (`#dailyChart` and `#usagePriceChart` with zoom and pan via chartjs-plugin-zoom, and `#planPaybackChart` with the $0 line drawn darker).

Text from data or the user goes through `Amber.escapeHTML` (`esc`). Keep that when changing markup.

## Responsive behaviour

- The tab bar stays on one line from 320 px up and scrolls sideways (tested at 320, 360 and 390 px), and the page itself never scrolls sideways (tested).
- Wide tables sit in cards with `overflow-x-auto` and scroll inside the card on a phone. The planner's options table (7 columns) and month table are the widest.
- Planner inputs are grids that collapse to one column (`grid-cols-1 sm:grid-cols-2/3`).

## Accessibility today

- Skip link to the tabs; ARIA tabs with keyboard support; labelled inputs; the GST switch is a real checkbox; help buttons are buttons with `aria-expanded` and can be opened by keyboard and closed with Escape. The settings and Download menus also close with Escape, and focus returns to their button.
- The planner options table rows are `role="button"` with `tabindex="0"`, and Enter/Space select them.
- Charts have an `aria-label` on the canvas. The numbers are also in nearby tables (month table, payback notes), but there's no table alternative for the Usage charts.
- The rating dots have `role="img"` and an `aria-label` ("3 of 4").
- Colour carries meaning in places (green saves, red costs), usually alongside a sign or a word.

## Writing style

The app is written for everyday Australian householders:

- Plain English with short sentences. Say what something means for the reader ("Pays back in 6.7 years"), not jargon ("ROI").
- Australian spelling and units: kWh, kW, c/kWh, $ with commas.
- Every input and table heading gets a help bubble. The jargon buster explains the terms that can't be avoided (feed-in, NEM12, controlled load, demand charge, TOU).
- **Known inconsistency**: percentages are "20%" in most of the app but "20 %" (with a space) in the Solar+? tab. Pick one in a refresh.

## Known UI issues and opportunities

- **Solar+? is long and text-heavy.** Results stack as: recommendation, rating, battery check, options, month table, breakdown, check the numbers, payback, assumptions. Many paragraphs are full sentences of figures. Candidates: a summary strip of 3–4 key numbers, progressive disclosure (`<details>`) for the breakdown, numbers and assumptions, and a sticky "option on show" header.
- **Inputs on Solar+?** are spread over several `<details>` groups. "Prices and rebates" has 18 numeric fields in one grid.
- **Compare's plan form** (flat / TOU / feed-in windows / demand) is dense and shown under the results, and custom plans are edited in place.
- **Tables** are styled inline in several places with small differences. A shared table component (CSS classes in `input.css`) would make them consistent.
- **Charts**: the payback chart's x labels rotate on narrow screens. The Usage charts would benefit from a legend and colour review. Chart colours are hard-coded hex values in `charts.js` and `planner-ui.js`.
- **Visual hierarchy**: every card has the same weight; the main answer on each tab could stand out more.
- **Help bubbles** are everywhere, which helps beginners but adds visual noise. Consider showing them only on hover or focus on wider screens.
- **Loading and progress**: Compare and Solar+? each have their own progress bar and message area.
- **No dark mode**; no print stylesheet, though a print or PDF view of the planner result could be useful to take to installers.

## Checking a UI change

```bash
npm run build:css
npm run lint
npm test                       # or: npx playwright test tests/planner.spec.js
npm run serve                  # then open http://127.0.0.1:4173
```

To see results without an Amber key, import a NEM12 file on Start. The Playwright helpers `nem12Year()` and `nem12Battery()` in `tests/planner.spec.js` generate a year of readings for a household without and with solar and a battery. Check at 320, 375 and 1024 px wide, with the keyboard only, and with a long plan name.
