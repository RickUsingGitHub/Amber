# Working on Amber Compare & Export

A browser-only tool for Australian electricity bills (Amber Electric vs other plans, bill checks, a solar and battery planner). Read these first:

- [README.md](README.md): what the app does, for users
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, data model, each tab's flow, the planner engine, storage, releases
- [docs/FRONTEND.md](docs/FRONTEND.md): the UI contract (IDs, data attributes, help keys, CSP) and known UI issues
- [docs/REVIEW.md](docs/REVIEW.md): invariants, risk areas, technical debt, test map

## Commands

```bash
npm install
npm run build:css     # after changing any Tailwind class in index.html or js/; commit css/app.css
npm run lint          # ESLint: unused or shadowed variables, undefined names, house style
npm run test:unit     # Node unit checks (fast), starting with a syntax check of every js/*.js
npm test              # unit checks + Playwright (starts scripts/static-server.js on :4173)
npx playwright test tests/planner.spec.js --workers=2   # one spec
npm run serve         # http://127.0.0.1:4173
```

If Playwright can't find its browser, point it at an installed Chromium with `launchOptions.executablePath` in a local config, not by editing `playwright.config.js`. Don't leave your own server running on port 4173 during a test run: Playwright reuses it.

## Rules of the codebase

- **No build step for JS, no framework, no ES modules.** Each `js/*.js` is an IIFE adding to `window.Amber`; the load order in `index.html` matters (`app.js` is last). New files need a `<script>` tag with `?v=<version>`, and the unit tests `require` them in order.
- **The page controller is `app-*.js` plus `app.js`**, split by area and sharing `Amber.app` (created by `app-core.js`, which loads first). A function in another app file is called as `app.name()` and must be in that file's `Object.assign(app, { … })` list at the bottom; `npm run lint` and `tests/unit-syntax.js` catch a missing one. Other modules don't use `Amber.app`: `planner-ui.js` goes through `Amber.appApi`.
- **CSP**: no inline scripts or styles, no `style="…"` in HTML or HTML strings, no third-party hosts. `element.style.x = …` from JS is fine.
- **Tailwind classes must appear literally** in `index.html` or `js/`, or be safelisted in `tailwind.config.js`.
- **IDs, `data-*` hooks and visible wording are used by the tests.** Change them together with `tests/*.spec.js`.
- **Every `data-help="key"` needs an entry in `Amber.HELP`** (`js/help.js`), and new inputs and table headings should get one.
- **Escape anything from data or the user** with `Amber.escapeHTML` before `innerHTML`.
- **Keep pricing in one place.** Compare, month by month, Bill Check, Free? and the planner must agree on the same readings; `tests/unit-planner.js` checks the planner against Compare.
- **Missing readings are never zero; NEM time is UTC+10 interval-end; templates are GST-inclusive** (see REVIEW.md invariants).
- **Calculation modules stay DOM-free** so they run under Node.
- **Writing style for the UI**: plain English for householders, Australian spelling, short sentences, units kWh, kW, c/kWh and $.

## Releasing a change

1. Bump the version everywhere it appears:
   - `index.html`: the `<title>`, "Version X." in the header, and every `?v=X`;
   - `js/constants.js`: `Amber.APP_VERSION`;
   - `tests/unit-time.js`: the version assert.
2. Update `README.md` and `docs/` if behaviour or structure changed.
3. Run `npm run build:css` if classes changed, then `npm run lint` and `npm test`.
4. Open a pull request. Merge only after the GitHub "Tests" check passes: it runs the lint and the tests (GitHub Pages serves `main`).
