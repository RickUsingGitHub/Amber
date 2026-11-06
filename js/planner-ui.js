(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * The Solar & battery tab: the household's last 12 months (Amber's API or an imported NEM12
     * file), the planner engine (planner.js, solar.js) and the results. Settings are remembered in
     * this browser.
     */

    const SETTINGS_KEY = 'plannerSettings';
    const SOLAR_SIZES = [3, 5, 6.6, 8, 10, 13.2, 15, 20, 25];
    const BATTERY_SIZES = [5, 10, 13.5, 20, 27, 40];
    const INVERTER_RATIO = 1.33; // panels up to 133 % of the inverter, as most installers fit them
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Prices and rebates, battery and money settings (ids, defaults from PLANNER_FINANCE_DEFAULTS).
    const COSTS = [
        { id: 'planSolarPerKw', key: 'solarPerKw', label: 'Solar: price per kW ($)', step: 10 },
        { id: 'planSolarFixed', key: 'solarFixed', label: 'Solar: fixed cost ($)', step: 100 },
        { id: 'planStcPerKw', key: 'stcPerKw', label: 'Solar rebate per kW ($)', step: 10, help: 'planStc' },
        { id: 'planBatteryPerKwh', key: 'batteryPerKwh', label: 'Battery: price per kWh ($)', step: 10 },
        { id: 'planBatteryFixed', key: 'batteryFixed', label: 'Battery: fixed cost ($)', step: 100 },
        { id: 'planBatteryRebatePerKwh', key: 'batteryRebatePerKwh', label: 'Battery rebate per kWh ($)', step: 10, help: 'planBatteryRebate' },
        { id: 'planRebateStepDown', key: 'rebateStepDown', label: 'Rebates shrink each year (%)', step: 1, help: 'planRebateStepDown' },
        { id: 'planHardwareDecline', key: 'hardwareDecline', label: 'Hardware gets cheaper each year (%)', step: 1 },
        { id: 'planRte', key: 'rte', label: 'Battery round trip (%)', step: 1, value: 90, help: 'planRte' },
        { id: 'planKwPerKwh', key: 'kwPerKwh', label: 'Battery power (kW per kWh)', step: 0.05, value: 0.4, help: 'planBatteryPower' },
        { id: 'planBatteryFade', key: 'batteryFade', label: 'Battery capacity lost a year (%)', step: 0.5, help: 'planBatteryWear' },
        { id: 'planBatteryLife', key: 'batteryLife', label: 'Replace battery after (years)', step: 1 },
        { id: 'planSolarDegradation', key: 'solarDegradation', label: 'Panels lose a year (%)', step: 0.1 },
        { id: 'planInverterCost', key: 'inverterCost', label: 'Inverter replacement ($)', step: 100 },
        { id: 'planInverterLife', key: 'inverterLife', label: 'Replace inverter after (years)', step: 1 },
        { id: 'planEscalation', key: 'escalation', label: 'Power prices rise a year (%)', step: 0.5, help: 'planEscalation' },
        { id: 'planDiscount', key: 'discount', label: 'Interest you\'d otherwise earn (%)', step: 0.5, help: 'planDiscount' },
        { id: 'planYears', key: 'years', label: 'Years to compare', step: 1 }
    ];
    const EXISTING = ['planExistingSolarKw', 'planExistingFacing', 'planExistingBatteryKwh', 'planExistingBatteryKw'];
    const FIELDS = EXISTING.concat(['planBaseline', 'planLocation', 'planExportLimit', 'planSolarMode', 'planSolarKw', 'planRoofKw', 'planBatteryMode', 'planBatteryKwh',
        'planBatteryMax', 'planRetailer', 'planOrientation', 'planTilt', 'planShading', 'planEvKm', 'planEvCharge', 'planHotWater', 'planPeople',
        'planHotWaterRun', 'planGasHeatingMJ', 'planGasCooking', 'planGasAllGone', 'planGasCents', 'planGasSupply', 'planRankBy']).concat(COSTS.map((c) => c.id));

    const ui = { site: null, year: null, busy: false, results: null, selected: null, chart: null, built: false };

    const $ = (id) => document.getElementById(id);
    const app = () => Amber.appApi;
    const dollars = (v) => `${v < -0.5 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-AU')}`;
    const num = (id) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? v : 0; };
    const fmtDate = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    const esc = (s) => Amber.escapeHTML(String(s));
    const kw = (v) => `${Number(v.toFixed(1))} kW`;
    const kwh = (v) => `${Number(v.toFixed(1))} kWh`;

    // ---------- Settings ----------

    function loadSettings() {
        try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { return {}; }
    }

    function saveSettings() {
        const out = {};
        FIELDS.forEach((id) => {
            const el = $(id);
            if (!el) return;
            out[id] = el.type === 'checkbox' ? el.checked : el.value;
        });
        try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(out)); } catch (e) { /* ignore */ }
    }

    function applySettings(saved) {
        FIELDS.forEach((id) => {
            const el = $(id);
            if (!el || saved[id] == null) return;
            if (el.type === 'checkbox') el.checked = !!saved[id];
            else if (el.tagName !== 'SELECT' || Array.from(el.options).some((o) => o.value === saved[id])) el.value = saved[id];
        });
        syncVisibility();
    }

    function syncVisibility() {
        const solar = $('planSolarMode').value;
        const battery = $('planBatteryMode').value;
        document.querySelectorAll('[data-plan-show]').forEach((el) => {
            const [what, mode] = el.getAttribute('data-plan-show').split('-');
            el.classList.toggle('hidden', (what === 'solar' ? solar : battery) !== mode);
        });
    }

    // ---------- The household's year ----------

    function networkKeyOf(site) {
        return (site.estimate && site.estimate.networkKey) || Amber.canonicalNetwork(site.network);
    }

    function stateOf(site) {
        const net = Amber.NETWORKS[networkKeyOf(site)];
        return (net && net.state) || app().currentStateCode();
    }

    async function loadYear(site) {
        const db = await Amber.openDb();
        const cache = await Amber.loadAllSiteCache(db, site.id);
        const channelTypes = {};
        (site.channels || []).forEach((c) => { channelTypes[c.identifier] = c.type; });
        const year = Amber.planYear(cache.byDate, { channelTypes });
        if (!year.ok) return year;
        const net = Amber.NETWORKS[networkKeyOf(site)];
        let gaps = 0;
        for (let i = 0; i < year.n; i++) if (!Number.isFinite(year.amberExp[i])) gaps += 1;
        if (gaps) {
            if (net) {
                const feedIn = (site.channels || []).find((c) => c.type === 'feedIn');
                const exportCode = (site.estimate && site.estimate.exportCode)
                    || (feedIn && net.exportTariffs && net.exportTariffs[feedIn.tariff] ? feedIn.tariff : '')
                    || net.defaultExport || '';
                let prices = null;
                try { prices = await Amber.loadRegionPrices(net.region, Amber.priceMonthsFor(year.first, year.last)); } catch (e) { prices = null; }
                Amber.fillPlannerExportPrices(year, { net, exportCode, prices });
            } else {
                for (let i = 0; i < year.n; i++) if (!Number.isFinite(year.amberExp[i])) year.amberExp[i] = 0;
                year.exportUnpriced = gaps;
            }
        }
        return year;
    }

    function siteLabel(site) {
        return site.nmi ? `NMI ${site.nmi}` : 'your home';
    }

    function planList(site) {
        const state = stateOf(site);
        const templates = (app().templates() || {})[state] || {};
        const plans = [{ name: 'Amber', amber: true }];
        Object.keys(templates).forEach((name) => {
            if (Amber.planMatchesNetwork(name, templates[name], site.network)) plans.push({ name, config: templates[name] });
        });
        return plans;
    }

    function label(name) {
        if (name === 'Amber') return 'Amber (wholesale prices)';
        return Amber.planListLabel(name, ui.site && ui.site.network);
    }

    function fillSelect(el, options, value) {
        el.innerHTML = options.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
        if (value != null && options.some((o) => o.value === value)) el.value = value;
    }

    function buildStatic() {
        if (ui.built) return;
        ui.built = true;
        const d = Amber.PLANNER_FINANCE_DEFAULTS;
        $('planCostInputs').innerHTML = COSTS.map((c) => {
            const value = c.value != null ? c.value : d[c.key];
            return `<div><label for="${c.id}" class="block text-xs font-medium text-gray-700"${c.help ? ` data-help="${c.help}"` : ''}>${esc(c.label)}</label>`
                + `<input type="number" id="${c.id}" step="${c.step}" min="0" value="${value}" class="plan-input"></div>`;
        }).join('');
        const facings = Object.keys(Amber.SOLAR_ORIENTATIONS).map((k) => ({ value: k, label: Amber.SOLAR_ORIENTATIONS[k].label }));
        fillSelect($('planOrientation'), facings, 'north');
        fillSelect($('planExistingFacing'), facings, 'north');
        fillSelect($('planLocation'), Amber.SOLAR_LOCATIONS.map((l) => ({ value: l.id, label: `${l.name} (${l.state})` })));
        ['planSolarMode', 'planBatteryMode'].forEach((id) => $(id).addEventListener('change', syncVisibility));
        $('planInputs').addEventListener('change', saveSettings);
        $('planRun').addEventListener('click', run);
        $('planRankBy').addEventListener('change', () => { saveSettings(); if (ui.results) renderOptions(); });
        $('planDataStatus').addEventListener('click', (e) => {
            const go = e.target.closest('[data-plan-go]');
            if (go) app().selectTab(go.getAttribute('data-plan-go'));
        });
    }

    function status(html) {
        $('planDataStatus').innerHTML = html;
    }

    /** Called whenever the tab is shown. */
    async function show() {
        if (!app()) return;
        buildStatic();
        if (ui.busy) return;
        const site = app().selectedSite();
        if (!site) {
            ui.year = null;
            $('planInputs').classList.add('hidden');
            status('No meter readings yet. <button type="button" class="text-indigo-600 underline" data-plan-go="setup">Connect your Amber account or import a NEM12 file</button> first.');
            return;
        }
        status('Loading your meter readings…');
        let year;
        try {
            year = await loadYear(site);
        } catch (err) {
            console.error(err);
            status('Couldn\'t read the meter readings saved in this browser.');
            return;
        }
        ui.site = site;
        ui.year = year;
        if (!year.ok) {
            $('planInputs').classList.add('hidden');
            const have = year.have || 0;
            status(`The planner needs 12 months of meter readings and has ${have} of the last 365 days for ${esc(siteLabel(site))}. `
                + (site.local
                    ? 'Import a NEM12 file covering a whole year on the <button type="button" class="text-indigo-600 underline" data-plan-go="setup">Start tab</button>.'
                    : 'Amber\'s connection only reaches back about 3 months: import your Amber usage file (up to a year) on the <button type="button" class="text-indigo-600 underline" data-plan-go="setup">Start tab</button>.'));
            return;
        }
        const filled = year.filled.length ? ` ${year.filled.length} missing day${year.filled.length === 1 ? ' was' : 's were'} filled in from the same weekday.` : '';
        status(`Using 12 months of readings for ${esc(siteLabel(site))}: <strong>${fmtDate(year.first)} – ${fmtDate(year.last)}</strong>.${filled}`);

        const plans = planList(site);
        const saved = loadSettings();
        const options = plans.map((p) => ({ value: p.name, label: label(p.name) }));
        const compareChoice = app().selectedPlanName();
        const defaultBaseline = !site.local ? 'Amber' : (plans.some((p) => p.name === compareChoice) ? compareChoice : (plans[1] || plans[0]).name);
        fillSelect($('planBaseline'), options, defaultBaseline);
        fillSelect($('planRetailer'), [{ value: '', label: 'Find the cheapest' }].concat(options), '');
        const town = Amber.solarLocationFor(networkKeyOf(site));
        $('planLocation').value = town.id;
        if (!site.local || !year.hasFeedIn) $('planExportLimit').value = $('planExportLimit').value || 5;
        const detected = Amber.plannerDetectExisting(year, Amber.solarCosZenithSlots(year, town.lat, town.lon));
        ui.detected = detected;
        applySettings(saved);
        // A household's own defaults win over another household's saved choices.
        if (saved.siteId !== site.id) {
            $('planLocation').value = town.id;
            $('planBaseline').value = defaultBaseline;
            $('planExistingSolarKw').value = detected.solarKw;
            $('planExistingFacing').value = 'north';
            $('planExistingBatteryKwh').value = detected.battery ? 10 : 0;
            $('planExistingBatteryKw').value = 5;
        }
        $('planExistingHint').textContent = existingHint(detected, year);
        $('planInputs').classList.remove('hidden');
    }

    function existingHint(d, year) {
        const parts = [];
        if (d.solarKw > 0) parts.push(`Your readings show solar sent to the grid on ${d.exportDays} of ${year.days} days, so you have panels: about ${d.solarKw} kW is a guess from how much you send out at the busiest times.`);
        else parts.push('Your readings show little or no solar sent to the grid.');
        if (d.reason === 'dark') parts.push(`Power went out to the grid after dark on ${d.darkDays} days, which means a battery. 10 kWh is a guess.`);
        else if (d.reason === 'quiet') parts.push(`On ${d.quietNights} nights you bought next to nothing for hours, which usually means a battery. 10 kWh is a guess.`);
        else parts.push('No sign of a battery.');
        parts.push('Change these to match your system; new panels and batteries are added on top.');
        return parts.join(' ');
    }

    // ---------- Running the search ----------

    function readFinance() {
        const f = Object.assign({}, Amber.PLANNER_FINANCE_DEFAULTS);
        COSTS.forEach((c) => { if (c.key in f) f[c.key] = num(c.id); });
        f.years = Math.max(1, Math.round(f.years));
        f.batteryLife = Math.max(1, Math.round(f.batteryLife));
        f.inverterLife = Math.max(1, Math.round(f.inverterLife));
        return f;
    }

    function progress(text, fraction) {
        $('planProgressText').textContent = text;
        $('planProgress').classList.toggle('hidden', fraction == null);
        $('planProgressBar').style.width = `${Math.round((fraction || 0) * 100)}%`;
    }

    async function run() {
        if (ui.busy || !ui.year || !ui.year.ok) return;
        ui.busy = true;
        $('planRun').disabled = true;
        saveSettings();
        try {
            const saved = loadSettings();
            saved.siteId = ui.site.id;
            try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(saved)); } catch (e) { /* ignore */ }
            await search();
        } catch (err) {
            console.error(err);
            progress(`Something went wrong: ${err.message}`, null);
        } finally {
            ui.busy = false;
            $('planRun').disabled = false;
        }
    }

    async function search() {
        const site = ui.site;
        const year = ui.year;
        const state = stateOf(site);
        const timeZone = Amber.STATE_TIMEZONES[state] || 'Australia/Sydney';
        const f = readFinance();
        const plans = planList(site);
        const baseline = $('planBaseline').value;
        const retailer = $('planRetailer').value;
        const solarMode = $('planSolarMode').value;
        const batteryMode = $('planBatteryMode').value;

        progress('Working out the changes you\'re planning…', 0);
        const loads = Amber.plannerExtraLoads(year, {
            ev: { kmPerYear: num('planEvKm'), chargeAt: $('planEvCharge').value },
            hotWater: $('planHotWater').value ? { from: $('planHotWater').value, people: num('planPeople') || 3, runAt: $('planHotWaterRun').value } : null,
            gas: { heatingMJ: num('planGasHeatingMJ'), cooking: $('planGasCooking').checked, allGone: $('planGasAllGone').checked, centsPerMJ: num('planGasCents'), supplyCentsPerDay: num('planGasSupply') }
        }, timeZone);

        const existing = { solarKw: num('planExistingSolarKw'), facing: $('planExistingFacing').value, kwh: num('planExistingBatteryKwh'), kw: num('planExistingBatteryKw') || 5 };
        let solarPerKw = null;
        let weather = null;
        if (solarMode !== 'none' || existing.kwh > 0) {
            progress('Working out what panels would make on your roof…', 0.02);
            weather = await Amber.loadSolarWeather($('planLocation').value);
        }
        if (solarMode !== 'none') {
            const perKw = Amber.solarSlotsPerKw(year, weather, { tilt: num('planTilt'), orientation: $('planOrientation').value, shadingPct: num('planShading') });
            solarPerKw = Amber.clipToInverter(perKw, 1 / INVERTER_RATIO);
        }
        // A battery the home already has: take it out of the readings, then run it afresh on every plan.
        let searchYear = year;
        let unwound = null;
        if (existing.kwh > 0) {
            progress('Working out what your battery does now…', 0.03);
            const pv = existing.solarKw > 0 ? Amber.solarSlotsPerKw(year, weather, { tilt: num('planTilt'), orientation: existing.facing }).map((x) => x * existing.solarKw) : null;
            unwound = Amber.plannerUnwindBattery(year, {
                kwh: existing.kwh, kw: existing.kw, rte: (num('planRte') || 90) / 100, solarKw: existing.solarKw, pv,
                cosZ: Amber.solarCosZenithSlots(year, weather.lat, weather.lon)
            });
            searchYear = unwound.year;
        }
        const roof = Math.max(1, num('planRoofKw'));
        const solarSizes = solarMode === 'none' ? [0]
            : solarMode === 'fixed' ? [0, Math.max(0.5, num('planSolarKw'))]
                : [0].concat(SOLAR_SIZES.filter((s) => s < roof), [roof]);
        const maxBattery = Math.max(5, num('planBatteryMax'));
        const fixedBattery = Math.max(1, num('planBatteryKwh'));
        const batterySizes = batteryMode === 'none' ? [0]
            : batteryMode === 'fixed' ? [0, fixedBattery * 0.6, fixedBattery * 0.8, fixedBattery]
                : [0].concat(BATTERY_SIZES.filter((b) => b < maxBattery), [maxBattery]);
        const amberModel = Amber.amberPlannerModel(searchYear, site, app().readAmberRates());

        const t0 = Date.now();
        const res = await Amber.plannerSearch({
            year: searchYear, plans, state, amberModel, solarPerKw, solarSizes, batterySizes,
            existing: existing.kwh > 0 ? { kwh: existing.kwh, kw: existing.kw } : null,
            battery: { kwPerKwh: num('planKwPerKwh') || 0.4, rte: (num('planRte') || 90) / 100 },
            exportLimitKw: num('planExportLimit'), extra: loads.extra, clScale: loads.clScale,
            keepPlans: 6, mustPlans: [baseline], batteryPlans: retailer ? [retailer] : null
        }, (p) => {
            const text = p.phase === 'existing' ? `Running your battery on every plan… ${p.done} of ${p.total}`
                : p.phase === 'probe' ? `Checking which plans suit a battery… ${p.done} of ${p.total}` : `Trying sizes and plans… ${p.done} of ${p.total}`;
            const at = p.phase === 'existing' ? 0.04 + 0.11 * p.done / p.total : p.phase === 'probe' ? 0.15 + 0.1 * p.done / p.total : 0.25 + 0.75 * p.done / p.total;
            progress(text, at);
        });
        const check = unwound ? Amber.plannerExistingCheck(res.prep, baseline, year) : null;
        ui.results = analyse(res, { f, baseline, retailer, solarMode, batteryMode, solarSizes, fixedBattery, loads, weather, plans, existing, unwound, check, seconds: (Date.now() - t0) / 1000 });
        progress(`Done: ${ui.results.options.length.toLocaleString('en-AU')} options compared.`, null);
        ui.selected = null;
        renderAll();
        $('planResults').classList.remove('hidden');
        $('planRecommendation').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---------- Results ----------

    function optionFor(rows, f, today, free, r) {
        const at = (s, b, p) => rows.find((x) => x.solarKw === s && x.batteryKwh === b && x.plan === p);
        const opt = {
            solarKw: r.solarKw, batteryKwh: r.batteryKwh, today, free: free.bill,
            planOnly: at(0, 0, r.plan).bill, solarOnly: at(r.solarKw, 0, r.plan).bill,
            batteryBills: rows.filter((x) => x.solarKw === r.solarKw && x.plan === r.plan).map((x) => ({ kwh: x.batteryKwh, bill: x.bill }))
        };
        return opt;
    }

    function analyse(res, o) {
        const rows = res.rows;
        const at = (s, b, p) => rows.find((x) => x.solarKw === s && x.batteryKwh === b && x.plan === p);
        const today = at(0, 0, o.baseline).bill;
        const free = rows.filter((x) => x.solarKw === 0 && x.batteryKwh === 0).reduce((a, b) => (b.bill < a.bill ? b : a));
        // Payback is measured against the cheapest way to get there with nothing bought: the
        // cheapest plan, or the chosen plan when it's fixed.
        const reference = o.retailer ? at(0, 0, o.retailer) : free;
        const solarFixed = o.solarMode === 'fixed' ? o.solarSizes[1] : null;
        const options = rows.filter((r) => {
            if (o.solarMode === 'none' && r.solarKw !== 0) return false;
            if (o.solarMode === 'fixed' && r.solarKw !== solarFixed) return false;
            if (o.batteryMode === 'none' && r.batteryKwh !== 0) return false;
            if (o.batteryMode === 'fixed' && r.batteryKwh !== o.fixedBattery) return false;
            if (o.retailer && r.plan !== o.retailer) return false;
            return true;
        }).map((r) => {
            const opt = optionFor(rows, o.f, today, reference, r);
            return Object.assign({}, r, { opt, fin: Amber.plannerFinance(opt, o.f), saving: today - r.bill });
        });
        return Object.assign({ res, rows, today, free, reference, options }, o);
    }

    function ranked() {
        const by = $('planRankBy').value;
        const list = ui.results.options.slice();
        if (by === 'bill') list.sort((a, b) => a.bill - b.bill || a.fin.capex.total - b.fin.capex.total);
        else if (by === 'payback') {
            const pb = (x) => (x.fin.payback == null ? Infinity : x.fin.payback);
            list.sort((a, b) => {
                const hw = (x) => (x.solarKw > 0 || x.batteryKwh > 0 ? 1 : 0);
                return hw(b) - hw(a) || pb(a) - pb(b) || b.fin.npv - a.fin.npv;
            });
        } else list.sort((a, b) => b.fin.npv - a.fin.npv);
        return list;
    }

    function describe(x) {
        const has = ui.results && ui.results.existing && ui.results.existing.kwh > 0;
        const parts = [];
        parts.push(x.solarKw > 0 ? `${kw(x.solarKw)} of ${has || (ui.results && ui.results.existing.solarKw > 0) ? 'new ' : ''}solar` : 'no new panels');
        parts.push(x.batteryKwh > 0 ? `a ${kwh(x.batteryKwh)} ${has ? 'extra ' : ''}battery` : has ? 'no extra battery' : 'no battery');
        return parts.join(' and ');
    }

    function renderAll() {
        renderRecommendation();
        renderExistingCheck();
        renderOptions();
        renderDetail();
        renderAssumptions();
    }

    function scaled(opt, k) {
        return Object.assign({}, opt, {
            today: opt.today * k, free: opt.free * k, planOnly: opt.planOnly * k, solarOnly: opt.solarOnly * k,
            batteryBills: opt.batteryBills.map((b) => ({ kwh: b.kwh, bill: b.bill * k }))
        });
    }

    function paybackText(fin) {
        if (fin.capex.total <= 0) return 'nothing to pay back';
        if (fin.payback == null) return `doesn't pay back within ${ui.results.f.years} years`;
        return `pays back in ${fin.payback < 1 ? 'under a year' : `${fin.payback.toFixed(1)} years`}`;
    }

    function renderRecommendation() {
        const r = ui.results;
        const best = ranked()[0];
        const box = $('planRecommendation');
        if (!best) {
            box.innerHTML = '<p class="text-sm text-gray-700">No options match what you fixed. Try "Find the best" for one of them.</p>';
            return;
        }
        const fin = best.fin;
        const hardware = best.solarKw > 0 || best.batteryKwh > 0;
        const lines = [];
        lines.push(`<p class="text-lg">Next year's bill: <strong>${dollars(best.bill)}</strong>, against <strong>${dollars(r.today)}</strong> on ${esc(label(r.baseline))} today: <strong class="${best.saving >= 0 ? 'text-green-700' : 'text-red-700'}">${dollars(Math.abs(best.saving))} a year ${best.saving >= 0 ? 'less' : 'more'}</strong>.</p>`);
        if (hardware) {
            lines.push(`<p>Up front: <strong>${dollars(fin.capex.total)}</strong> after ${dollars(fin.capex.rebates)} of rebates. It ${paybackText(fin)}, and over ${r.f.years} years it's worth <strong>${dollars(fin.npv)}</strong> in today's money${fin.irr != null ? ` (like ${(fin.irr * 100).toFixed(1)} % interest a year)` : ''}.</p>`);
        }
        if (r.free.plan !== r.baseline && r.today - r.free.bill > 1) {
            const onTop = r.reference === r.free
                ? 'Payback above counts only what the system adds on top of that.'
                : `You chose to stay on ${esc(label(r.retailer))}, so payback is measured against that plan with nothing new.`;
            lines.push(`<p>${hardware ? 'Without buying anything, just' : 'Just'} switching to ${esc(label(r.free.plan))} would save <strong>${dollars(r.today - r.free.bill)}</strong> a year. ${hardware ? onTop : ''}</p>`);
        }
        if (!hardware) {
            const bestKit = ranked().filter((x) => x.solarKw > 0 || x.batteryKwh > 0).sort((a, b) => b.fin.npv - a.fin.npv)[0];
            if (bestKit) {
                lines.push(`<p>None of the panels or batteries tried pays for itself over ${r.f.years} years at these prices. The closest is ${esc(describe(bestKit))} on ${esc(label(bestKit.plan))}: ${dollars(bestKit.fin.capex.total)} up front, it ${paybackText(bestKit.fin)} and is worth ${dollars(bestKit.fin.npv)} overall. Cheaper quotes or bigger rebates could change that: try your own prices under "Prices and rebates".</p>`);
            }
        }
        if (hardware) {
            const wait = Amber.plannerWaitAYear(best.opt, r.f);
            lines.push(`<p class="text-sm text-gray-600">Waiting a year: up front would be ${dollars(wait.capexLater)} (hardware cheaper, rebates smaller), but you'd miss a year of savings, so overall you'd be <strong>${dollars(Math.abs(wait.change))} ${wait.change > 0 ? 'better' : 'worse'} off</strong>.</p>`);
        }
        const k = r.loads.kwh;
        const added = k.ev + k.hotWater + k.heating + k.cooking;
        if (added > 0) {
            lines.push(`<p class="text-sm text-gray-600">Your planned changes add ${Math.round(added).toLocaleString('en-AU')} kWh a year to every option (car ${Math.round(k.ev)}, hot water ${Math.round(k.hotWater)}, heating ${Math.round(k.heating)}, cooking ${Math.round(k.cooking)})${r.loads.gasSaving > 0 ? `, and you'd stop paying about ${dollars(r.loads.gasSaving)} a year for gas` : ''}.</p>`);
        }
        box.innerHTML = `<h3 class="text-xl font-bold text-gray-900 mb-2">Best for you: ${esc(describe(best))}, on ${esc(label(best.plan))}</h3><div class="space-y-2 text-gray-800">${lines.join('')}</div>`;
    }

    function system(x) {
        if (x.solarKw > 0 && x.batteryKwh > 0) return `${kw(x.solarKw)} + ${kwh(x.batteryKwh)}`;
        if (x.solarKw > 0) return `${kw(x.solarKw)} solar`;
        if (x.batteryKwh > 0) return `${kwh(x.batteryKwh)} battery`;
        return 'Nothing new';
    }

    const shortLabel = (name) => (name === 'Amber' ? 'Amber' : label(name));
    const th = (t, right) => `<th scope="col" class="px-2 py-2 ${right ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider">${t}</th>`;
    const td = (t, cls) => `<td class="px-2 py-2 ${cls || 'text-right whitespace-nowrap'}">${t}</td>`;

    function renderExistingCheck() {
        const r = ui.results;
        const box = $('planExistingCheck');
        if (!r.check) { box.classList.add('hidden'); return; }
        box.classList.remove('hidden');
        const c = r.check;
        const st = r.unwound.stats;
        const k = (v) => Math.round(v).toLocaleString('en-AU');
        const gap = c.readings.bill !== 0 ? (c.modelled.bill - c.readings.bill) / Math.abs(c.readings.bill) : 0;
        const close = Math.abs(gap) <= 0.1;
        const th = (t, right) => `<th scope="col" class="px-2 py-2 ${right ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider">${t}</th>`;
        const row = (name, f) => `<tr><td class="px-2 py-2">${name}</td><td class="px-2 py-2 text-right whitespace-nowrap">${f(c.readings)}</td><td class="px-2 py-2 text-right whitespace-nowrap">${f(c.modelled)}</td><td class="px-2 py-2 text-right whitespace-nowrap">${f(c.without)}</td></tr>`;
        const sources = [];
        if (st.fromSolar > 1) sources.push(`${k(st.fromSolar)} kWh of your solar`);
        if (st.fromGrid > 1) sources.push(`${k(st.fromGrid)} kWh from the grid`);
        $('planExistingCheckBody').innerHTML = `<p class="text-sm text-gray-700 mb-3">Worked out from your readings: over the year your ${esc(kwh(r.existing.kwh))} battery gave about ${k(st.toHome)} kWh to your home${st.toGrid > 1 ? ` and sold ${k(st.toGrid)} kWh to the grid` : ''}${sources.length ? `, charging from ${sources.join(' and ')}` : ''} (about ${(st.cycles / 365).toFixed(1)} cycles a day). The planner then takes it out of your readings and runs it again on every plan, the way it would behave on that plan.</p>`
            + `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th(`The year on ${esc(label(r.baseline))}`)}${th('Your readings', 1)}${th('Planner\'s battery', 1)}${th('No battery', 1)}</tr></thead><tbody class="divide-y divide-gray-200">`
            + row('Bill', (x) => dollars(x.bill))
            + row('Bought (kWh)', (x) => k(x.importKwh))
            + row('Sent out (kWh)', (x) => k(x.exportKwh))
            + '</tbody></table>'
            + `<p class="text-sm mt-3 ${close ? 'text-gray-700' : 'text-amber-800'}">The planner's version of your battery comes to ${dollars(c.modelled.bill)}, ${Math.abs(gap) < 0.005 ? 'the same as' : `${(Math.abs(gap) * 100).toFixed(0)} % ${gap > 0 ? 'more than' : 'less than'}`} your real readings. `
            + (close ? 'That\'s close, so the comparisons below are on firm ground.' : 'That\'s a sizeable gap: check the battery size and power above (take off any backup reserve), and treat the answers below as rougher than usual.')
            + ` Every option is worked out the same way, so they compare fairly. Without the battery the same year would cost ${dollars(c.without.bill)}, so on this plan it saves you about <strong>${dollars(c.without.bill - c.modelled.bill)}</strong> a year.</p>`;
    }

    function renderOptions() {
        const r = ui.results;
        const list = ranked();
        const top = list.slice(0, 15);
        const doNothing = r.rows.find((x) => x.solarKw === 0 && x.batteryKwh === 0 && x.plan === r.baseline);
        let html = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th('Solar + battery')}${th('Plan')}${th('Up front', 1)}${th('Bill next year', 1)}${th('Saves a year', 1)}${th('Pays back', 1)}${th(`Worth (${r.f.years} yrs)`, 1)}</tr></thead><tbody class="divide-y divide-gray-200">`;
        const row = (x, i, note) => {
            const fin = x.fin;
            const selected = ui.selected ? (ui.selected === x) : i === 0;
            const pb = !fin ? '—' : fin.capex.total <= 0 ? '—' : fin.payback == null ? 'never' : `${fin.payback.toFixed(1)} yrs`;
            return `<tr class="cursor-pointer hover:bg-gray-50 ${selected ? 'bg-indigo-50 font-semibold' : ''}" data-plan-option="${i}" tabindex="0" role="button">`
                + td(esc(system(x)), 'text-left whitespace-nowrap')
                + td(`${esc(shortLabel(x.plan))}${note ? ` <span class="text-xs font-normal text-gray-500">(${note})</span>` : ''}`, 'text-left')
                + td(fin ? dollars(fin.capex.total) : '$0')
                + td(dollars(x.bill))
                + td(dollars(r.today - x.bill), `text-right whitespace-nowrap ${r.today - x.bill >= 0 ? 'text-green-700' : 'text-red-700'}`)
                + td(pb)
                + td(fin ? dollars(fin.npv) : '—')
                + '</tr>';
        };
        top.forEach((x, i) => { html += row(x, i); });
        html += '<tr class="bg-gray-50"><td colspan="7" class="px-2 py-1 text-xs text-gray-500">For comparison</td></tr>';
        html += row(doNothing, -1, 'what you have now');
        if (r.free.plan !== r.baseline) html += row(r.free, -2, 'just switch plan');
        html += '</tbody></table>';
        html += `<p class="text-xs text-gray-500 mt-2">${r.options.length.toLocaleString('en-AU')} options compared${r.res.searchedPlans.length ? `; batteries tried on ${r.res.searchedPlans.length} plan${r.res.searchedPlans.length === 1 ? '' : 's'}` : ''}. Tap a row for its year month by month.</p>`;
        $('planOptionsTable').innerHTML = html;
        const pick = (tr) => {
            const i = parseInt(tr.getAttribute('data-plan-option'), 10);
            ui.selected = i >= 0 ? top[i] : (i === -1 ? doNothing : r.free);
            renderOptions();
            renderDetail();
        };
        $('planOptionsTable').querySelectorAll('[data-plan-option]').forEach((tr) => {
            tr.addEventListener('click', () => pick(tr));
            tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tr); } });
        });
    }

    function renderDetail() {
        const r = ui.results;
        const x = ui.selected || ranked()[0];
        if (!x) return;
        const prep = r.res.prep;
        const ev = Amber.plannerEvaluate(prep, x.plan, x.solarKw, x.batteryKwh);
        const now = Amber.plannerEvaluate(prep, r.baseline, 0, 0);
        $('planDetailTitle').textContent = `Next year, month by month: ${describe(x)} on ${label(x.plan)}`;
        let html = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th('Month')}${th('Bought (kWh)', 1)}${th('Sent out (kWh)', 1)}${x.solarKw > 0 ? th('Solar made (kWh)', 1) : ''}${th('Bill', 1)}${th('Today\'s bill', 1)}${th('Saves', 1)}</tr></thead><tbody class="divide-y divide-gray-200">`;
        const tot = { imp: 0, exp: 0, solar: 0, bill: 0, now: 0 };
        ev.months.forEach((m, i) => {
            const n = now.months[i];
            tot.imp += m.importKwh; tot.exp += m.exportKwh; tot.solar += m.solarKwh; tot.bill += m.bill; tot.now += n.bill;
            const name = `${MONTHS[parseInt(m.key.substring(5, 7), 10) - 1]} ${m.key.substring(0, 4)}${m.days < 28 ? ` (${m.days} days)` : ''}`;
            html += `<tr><td class="px-2 py-2 whitespace-nowrap">${name}</td><td class="px-2 py-2 text-right">${Math.round(m.importKwh).toLocaleString('en-AU')}</td><td class="px-2 py-2 text-right">${Math.round(m.exportKwh).toLocaleString('en-AU')}</td>${x.solarKw > 0 ? `<td class="px-2 py-2 text-right">${Math.round(m.solarKwh).toLocaleString('en-AU')}</td>` : ''}<td class="px-2 py-2 text-right">${dollars(m.bill)}</td><td class="px-2 py-2 text-right">${dollars(n.bill)}</td><td class="px-2 py-2 text-right ${n.bill - m.bill >= 0 ? 'text-green-700' : 'text-red-700'}">${dollars(n.bill - m.bill)}</td></tr>`;
        });
        html += `<tr class="bg-gray-50 font-semibold"><td class="px-2 py-2">Year</td><td class="px-2 py-2 text-right">${Math.round(tot.imp).toLocaleString('en-AU')}</td><td class="px-2 py-2 text-right">${Math.round(tot.exp).toLocaleString('en-AU')}</td>${x.solarKw > 0 ? `<td class="px-2 py-2 text-right">${Math.round(tot.solar).toLocaleString('en-AU')}</td>` : ''}<td class="px-2 py-2 text-right">${dollars(ev.cost.total)}</td><td class="px-2 py-2 text-right">${dollars(now.cost.total)}</td><td class="px-2 py-2 text-right">${dollars(now.cost.total - ev.cost.total)}</td></tr></tbody></table>`;

        const facts = [];
        const nowImport = now.imp.reduce((s, v) => s + v, 0) + now.cl.reduce((s, v) => s + v, 0);
        const change = nowImport > 0 ? Math.round((tot.imp / nowImport - 1) * 100) : 0;
        facts.push(`Power bought from the grid: ${Math.round(nowImport).toLocaleString('en-AU')} → ${Math.round(tot.imp).toLocaleString('en-AU')} kWh a year${change ? ` (${Math.abs(change)} % ${change < 0 ? 'less' : 'more'})` : ''}.${change > 0 && ev.sim ? ' The battery buys extra when power is cheap, to use or sell when it\'s dear, and loses a little on the way.' : ''}`);
        if (x.solarKw > 0) {
            const f = ev.flows;
            const viaBattery = ev.sim ? ev.sim.charged - ev.sim.gridCharged : 0;
            facts.push(`New panels make ${Math.round(f.solarKwh).toLocaleString('en-AU')} kWh a year: ${Math.round(f.solarSelf).toLocaleString('en-AU')} used straight away${viaBattery > 0 ? `, the battery stores up to ${Math.round(viaBattery).toLocaleString('en-AU')} of what would have been sent out` : ''}${f.curtailed > 1 ? `, and ${Math.round(f.curtailed).toLocaleString('en-AU')} kWh is lost to the ${num('planExportLimit')} kW export limit` : ''}.`);
        }
        if (ev.sim) {
            const which = r.existing.kwh > 0 ? (x.batteryKwh > 0 ? `Your ${kwh(r.existing.kwh)} battery and the new one together` : `Your ${kwh(r.existing.kwh)} battery`) : 'The battery';
            facts.push(`${which} cycle${r.existing.kwh > 0 && x.batteryKwh > 0 ? '' : 's'} about ${Math.round(ev.sim.cycles)} times a year (${(ev.sim.cycles / 365).toFixed(1)} a day)${ev.sim.gridCharged > 1 ? `, charging ${Math.round(ev.sim.gridCharged).toLocaleString('en-AU')} kWh from the grid when it's cheap or free` : ''}${ev.sim.exported > 1 ? ` and selling ${Math.round(ev.sim.exported).toLocaleString('en-AU')} kWh back when prices are high` : ''}.`);
        }
        html += `<ul class="list-disc pl-5 mt-3 space-y-1 text-sm text-gray-700">${facts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
        $('planDetailBody').innerHTML = html;
        renderPayback(x);
    }

    function renderPayback(x) {
        const r = ui.results;
        const notes = $('planPaybackNotes');
        const canvas = $('planPaybackChart');
        if (ui.chart) { ui.chart.destroy(); ui.chart = null; }
        if (!x.fin || x.fin.capex.total <= 0) {
            canvas.parentElement.classList.add('hidden');
            notes.innerHTML = '<p>Nothing to buy here, so nothing to pay back: the saving is just the plan.</p>';
            return;
        }
        canvas.parentElement.classList.remove('hidden');
        const low = Amber.plannerFinance(scaled(x.opt, 0.8), r.f);
        const high = Amber.plannerFinance(scaled(x.opt, 1.2), r.f);
        const series = (fin) => [-fin.capex.total].concat(fin.flows.map((y) => y.cumulative));
        const labels = ['Now'].concat(x.fin.flows.map((y) => `Year ${y.year}`));
        if (typeof Chart === 'function') {
            ui.chart = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        { label: 'Today\'s prices', data: series(x.fin), borderColor: '#4f46e5', backgroundColor: '#4f46e5', borderWidth: 2, pointRadius: 0, tension: 0.1 },
                        { label: 'Prices 20 % higher', data: series(high), borderColor: '#16a34a', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.1 },
                        { label: 'Prices 20 % lower', data: series(low), borderColor: '#dc2626', borderDash: [5, 4], borderWidth: 1.5, pointRadius: 0, tension: 0.1 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: { y: { title: { display: true, text: 'Money ahead ($)' }, ticks: { callback: (v) => dollars(v) } } },
                    plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${dollars(c.parsed.y)}` } } }
                }
            });
        }
        const repl = x.batteryKwh > 0 ? ` The battery is replaced in year ${r.f.batteryLife + 1}${r.f.batteryLife + 1 <= r.f.years ? '' : ' (after this chart)'}, the inverter in year ${r.f.inverterLife + 1}: the dips.` : '';
        notes.innerHTML = `<p>Paid ${dollars(x.fin.capex.total)} now; the line climbs as the savings come in. It ${paybackText(x.fin)} at today's prices (${high.payback != null ? `${high.payback.toFixed(1)} years` : 'never'} if prices are 20 % higher, ${low.payback != null ? `${low.payback.toFixed(1)} years` : 'never'} if 20 % lower).${repl}</p>`
            + `<p class="text-gray-600">Savings here are on top of ${r.reference === r.free ? 'just switching plan, since that needs nothing bought' : `staying on ${esc(label(r.retailer))} with nothing new`}. They shrink as the panels and battery wear, and grow as power prices rise ${r.f.escalation} % a year.</p>`;
    }

    function renderAssumptions() {
        const r = ui.results;
        const y = ui.year;
        const town = Amber.SOLAR_LOCATIONS.find((l) => l.id === $('planLocation').value);
        const items = [
            `Next year is your readings from ${fmtDate(y.first)} to ${fmtDate(y.last)} with the changes you entered, priced at today's plan rates (${r.plans.length - 1} plans for your network, prices as at ${fmtDate(Amber.TEMPLATES_AS_AT)}). Amber uses its prices over those same 12 months: a different year's wholesale prices could make it cheaper or dearer.`,
            'Each option is worked out half hour by half hour, with every plan\'s daily charges, free windows, caps and demand charges, the same way as the Compare tab.',
            r.weather ? `New panels: a typical year of sunshine for ${town ? town.name : 'your area'} (PVGIS, EU Joint Research Centre), matched to PVGIS's own yield, with ${num('planShading')} % shade. West-facing panels may come out a little low: that weather data has cloudier afternoons than mornings. The inverter is sized at 75 % of the panels, as most installers do.` : 'No new panels.',
            r.existing.kwh > 0
                ? `Your ${kwh(r.existing.kwh)} battery is taken out of your readings (an estimate: the meter can't see what it covers at home, so that comes from its size, the days it filled up and ran flat, and your use on nights it was empty), then run again on every plan, together with any new battery. Your panels stay in the readings; new ones are added on top.`
                : 'New panels are added on top of your meter readings, so panels you already have keep doing what they did.',
            'The battery covers your home when power is dear, soaks up solar that would sell cheaply, charges from the grid in free or cheap hours, and sells when an export pays well. It knows each day\'s prices in the morning (as fixed plans and Amber\'s forecasts allow), so a real battery may do a little worse, especially on Amber\'s price spikes.',
            `Money: prices rise ${r.f.escalation} % a year; the battery loses ${r.f.batteryFade} % of its capacity a year and is replaced after ${r.f.batteryLife} years; the inverter after ${r.f.inverterLife}; panels lose ${r.f.solarDegradation} % a year. "Worth" is today's money at ${r.f.discount} % a year.`,
            'Not included: maintenance, any payments for joining a virtual power plant, the value of backup power in a blackout, or your network moving you to a different tariff after you install.'
        ];
        if (y.exportUnpriced) items.push(`${y.exportUnpriced} half hours had no wholesale price, so Amber pays nothing for solar sent out then.`);
        $('planAssumptions').innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('');
    }

    Amber.plannerUi = { show, run };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
