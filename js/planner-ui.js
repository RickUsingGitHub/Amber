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
    const FIELDS = EXISTING.concat(['planCompareWith', 'planLocation', 'planExportLimit', 'planSolarMode', 'planSolarKw', 'planRoofKw', 'planBatteryMode', 'planBatteryKwh',
        'planBatteryMax', 'planOrientation', 'planTilt', 'planShading', 'planEvKm', 'planEvCharge', 'planHotWater', 'planPeople',
        'planHotWaterRun', 'planSwitchOff', 'planGasHeatingMJ', 'planGasCooking', 'planGasAllGone', 'planGasCents', 'planGasSupply', 'planRankBy']).concat(COSTS.map((c) => c.id));

    const ui = { site: null, year: null, busy: false, results: null, selected: null, chart: null, built: false, excluded: { companies: new Set(), plans: new Set() }, groups: null };

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
        out.planExcluded = { companies: Array.from(ui.excluded.companies), plans: Array.from(ui.excluded.plans) };
        const before = loadSettings();
        if (before.siteId) out.siteId = before.siteId;
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

    // ---------- Companies and plans to consider ----------

    function customPlanNames() {
        try {
            const custom = JSON.parse(localStorage.getItem('customSupplierPlans') || '{}') || {};
            return new Set([].concat(...Object.values(custom).map((byName) => Object.keys(byName || {}))));
        } catch (e) { return new Set(); }
    }

    // Companies in list order (Amber first; offers anyone can sell and your own plans last), each with its plans.
    function companyGroups(plans) {
        const custom = customPlanNames();
        const groups = new Map();
        plans.forEach((p) => {
            const c = Amber.planCompany(p.name, custom.has(p.name));
            if (!groups.has(c)) groups.set(c, []);
            groups.get(c).push(p.name);
        });
        const last = ['Default offer (DMO / VDO)', 'Solar Sharer Offer', 'Your own plans'];
        const rank = (c) => (c === 'Amber' ? -1 : last.indexOf(c));
        return new Map(Array.from(groups.entries()).sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0])));
    }

    const companyOf = (name) => {
        for (const [c, names] of ui.groups || []) if (names.includes(name)) return c;
        return '';
    };
    const allowed = (name) => !ui.excluded.companies.has(companyOf(name)) && !ui.excluded.plans.has(name);
    const allowedPlans = () => Array.from(ui.groups ? [].concat(...ui.groups.values()) : []).filter(allowed);

    function buildRetailerPanel(plans) {
        ui.groups = companyGroups(plans);
        let html = '<div class="flex gap-2 mb-3"><button type="button" class="jump-link" data-plan-all="1">Tick all</button><button type="button" class="jump-link" data-plan-all="0">Untick all</button></div><ul class="space-y-2">';
        ui.groups.forEach((names, company) => {
            const single = names.length === 1;
            html += `<li><label class="flex items-start gap-2 text-sm font-medium text-gray-800 cursor-pointer"><input type="checkbox" class="mt-0.5" data-company="${esc(company)}"${single ? ` data-plan="${esc(names[0])}"` : ''}> <span>${esc(single ? label(names[0]) : company)}</span></label>`;
            if (!single) {
                html += '<ul class="pl-6 mt-1 space-y-1">' + names.map((n) => `<li><label class="flex items-start gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" class="mt-0.5" data-plan="${esc(n)}"> <span>${esc(label(n))}</span></label></li>`).join('') + '</ul>';
            }
            html += '</li>';
        });
        $('planRetailersPanel').innerHTML = `${html}</ul>`;
        syncRetailers();
    }

    function syncRetailers() {
        if (!ui.groups) return;
        // A company with every plan left out one by one is a company left out.
        ui.groups.forEach((names, company) => {
            if (names.every((n) => ui.excluded.plans.has(n))) {
                ui.excluded.companies.add(company);
                names.forEach((n) => ui.excluded.plans.delete(n));
            }
        });
        const panel = $('planRetailersPanel');
        panel.querySelectorAll('input[data-company]').forEach((box) => {
            const names = ui.groups.get(box.getAttribute('data-company')) || [];
            const n = names.filter(allowed).length;
            box.checked = n > 0;
            box.indeterminate = n > 0 && n < names.length;
        });
        panel.querySelectorAll('input[data-plan]:not([data-company])').forEach((box) => { box.checked = allowed(box.getAttribute('data-plan')); });
        const total = Array.from(ui.groups.values()).reduce((a, names) => a + names.length, 0);
        const ok = allowedPlans();
        const companies = Array.from(ui.groups.entries()).filter(([, names]) => names.some(allowed));
        let text;
        if (ok.length === total) text = 'All companies';
        else if (!ok.length) text = 'None ticked';
        else if (ok.length === 1) text = `Only ${label(ok[0])}`;
        else if (companies.length === 1) text = `Only ${companies[0][0]}${companies[0][1].every(allowed) ? '' : ` (${ok.length} plans)`}`;
        else text = `${companies.length} of ${ui.groups.size} companies${companies.every(([, names]) => names.every(allowed)) ? '' : `, ${ok.length} plans`}`;
        $('planRetailersSummary').textContent = text;
    }

    function retailerChange(e) {
        const box = e.target.closest('input[type="checkbox"]');
        if (!box) return;
        const company = box.getAttribute('data-company') || companyOf(box.getAttribute('data-plan'));
        const names = ui.groups.get(company) || [];
        if (box.hasAttribute('data-company')) {
            names.forEach((n) => ui.excluded.plans.delete(n));
            if (box.checked) ui.excluded.companies.delete(company); else ui.excluded.companies.add(company);
        } else {
            const name = box.getAttribute('data-plan');
            if (box.checked) {
                // Ticking one plan of a company that was left out keeps the company's other plans out.
                if (ui.excluded.companies.has(company)) {
                    ui.excluded.companies.delete(company);
                    names.forEach((n) => { if (n !== name) ui.excluded.plans.add(n); });
                }
                ui.excluded.plans.delete(name);
            } else {
                ui.excluded.plans.add(name);
            }
        }
        syncRetailers();
        saveSettings();
    }

    function retailerButtons(e) {
        const btn = e.target.closest('[data-plan-all]');
        if (!btn) return;
        ui.excluded.plans.clear();
        ui.excluded.companies = btn.getAttribute('data-plan-all') === '1' ? new Set() : new Set(ui.groups.keys());
        syncRetailers();
        saveSettings();
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
        $('planRetailersPanel').addEventListener('change', retailerChange);
        $('planRetailersPanel').addEventListener('click', retailerButtons);
        document.addEventListener('click', (e) => {
            const d = $('planRetailers');
            if (d.open && !d.contains(e.target)) d.open = false;
        });
        $('planRetailers').addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('planRetailers').open) {
                $('planRetailers').open = false;
                $('planRetailers').querySelector('summary').focus();
            }
        });
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
        fillSelect($('planCompareWith'), [{ value: '', label: 'Whatever\'s cheapest' }].concat(options), '');
        const ex = saved.planExcluded || {};
        ui.excluded = { companies: new Set(ex.companies || []), plans: new Set(ex.plans || []) };
        if (!saved.planExcluded && saved.planRetailer) {
            // Settings from before tick boxes: one plan chosen means every other plan left out.
            plans.forEach((p) => { if (p.name !== saved.planRetailer) ui.excluded.plans.add(p.name); });
        }
        buildRetailerPanel(plans);
        const town = Amber.solarLocationFor(networkKeyOf(site));
        $('planLocation').value = town.id;
        if (!site.local || !year.hasFeedIn) $('planExportLimit').value = $('planExportLimit').value || 5;
        const detected = Amber.plannerDetectExisting(year, Amber.solarCosZenithSlots(year, town.lat, town.lon));
        ui.detected = detected;
        applySettings(saved);
        // A household's own defaults win over another household's saved choices.
        if (saved.siteId !== site.id) {
            $('planLocation').value = town.id;
            $('planCompareWith').value = '';
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
        if (!allowedPlans().length) {
            progress('Tick at least one company or plan under "Companies and plans to consider".', null);
            return;
        }
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
        const compareWith = $('planCompareWith').value; // '' = whatever's cheapest with nothing new
        const comparePlan = app().selectedPlanName();
        // The plan the readings were made on, for checking an existing battery against them.
        const readingsPlan = !site.local ? 'Amber' : plans.some((p) => p.name === comparePlan) ? comparePlan : compareWith;
        const allow = allowedPlans();
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
            keepPlans: 6, mustPlans: compareWith ? [compareWith] : [], allowPlans: allow, alsoPlans: compareWith ? [compareWith] : [],
            switchOffNegative: $('planSwitchOff').checked
        }, (p) => {
            const text = p.phase === 'existing' ? `Running your battery on every plan… ${p.done} of ${p.total}`
                : p.phase === 'probe' ? `Checking which plans suit a battery… ${p.done} of ${p.total}` : `Trying sizes and plans… ${p.done} of ${p.total}`;
            const at = p.phase === 'existing' ? 0.04 + 0.11 * p.done / p.total : p.phase === 'probe' ? 0.15 + 0.1 * p.done / p.total : 0.25 + 0.75 * p.done / p.total;
            progress(text, at);
        });
        ui.results = analyse(res, { f, compareWith, allow: new Set(allow), solarMode, batteryMode, solarSizes, fixedBattery, loads, weather, plans, existing, unwound, switchOff: $('planSwitchOff').checked, seconds: (Date.now() - t0) / 1000 });
        ui.results.readingsPlan = readingsPlan || ui.results.free.plan;
        ui.results.check = unwound ? Amber.plannerExistingCheck(res.prep, ui.results.readingsPlan, year) : null;
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
        const free = rows.filter((x) => x.solarKw === 0 && x.batteryKwh === 0 && o.allow.has(x.plan)).reduce((a, b) => (b.bill < a.bill ? b : a));
        // Every option is measured against one yardstick, whatever is fixed: nothing new on the plan
        // to compare against, or on whichever plan is cheapest with nothing new (switching is free).
        const compare = (o.compareWith && at(0, 0, o.compareWith)) || free;
        const base = compare.bill;
        const solarFixed = o.solarMode === 'fixed' ? o.solarSizes[1] : null;
        const options = rows.filter((r) => {
            if (o.solarMode === 'none' && r.solarKw !== 0) return false;
            if (o.solarMode === 'fixed' && r.solarKw !== solarFixed) return false;
            if (o.batteryMode === 'none' && r.batteryKwh !== 0) return false;
            if (o.batteryMode === 'fixed' && r.batteryKwh !== o.fixedBattery) return false;
            if (!o.allow.has(r.plan)) return false;
            return true;
        }).map((r) => {
            const opt = optionFor(rows, o.f, base, compare, r);
            return Object.assign({}, r, { opt, fin: Amber.plannerFinance(opt, o.f), saving: base - r.bill });
        });
        return Object.assign({ res, rows, base, free, compare, options }, o);
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

    // What to ask installers for: the sizes the planner assumed for this option (new equipment only).
    function orderText(x) {
        const parts = [];
        if (x.solarKw > 0) parts.push(`${kw(x.solarKw)} of panels with an inverter of about ${kw(x.solarKw / INVERTER_RATIO)}`);
        if (x.batteryKwh > 0) {
            const b = ui.results.res.prep.ctx.battery || {};
            const power = Math.min(15, Math.max(2.5, x.batteryKwh * (b.kwPerKwh || 0.4)));
            parts.push(`a battery with ${kwh(x.batteryKwh)} usable that can charge and discharge at about ${kw(power)}`);
        }
        return parts.join(', and ');
    }

    function orderNote(x) {
        const notes = ['These are the sizes the planner assumed.'];
        if (x.solarKw > 0) notes.push('A bigger inverter loses a little less on sunny middays.');
        if (x.solarKw > 0 && x.batteryKwh > 0) notes.push('The battery\'s power is treated as separate from the panels\' inverter: if one hybrid inverter will run both, ask for one that can handle both.');
        return notes.join(' ');
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

    const yearsText = (v) => (v < 1 ? 'under a year' : `${v.toFixed(1)} years`);
    // A replacement (battery or inverter) put it behind again after it was first back to $0.
    const dipped = (fin) => fin.firstPayback != null && fin.capex.total > 0 && (fin.payback == null || fin.payback > fin.firstPayback + 0.05);

    function paybackText(fin) {
        const years = ui.results.f.years;
        if (fin.capex.total <= 0) return 'nothing to pay back';
        if (fin.payback == null) {
            return dipped(fin)
                ? `is back to $0 after ${yearsText(fin.firstPayback)}, but replacing the battery puts it behind again and it isn't ahead for good within ${years} years`
                : `doesn't pay back within ${years} years`;
        }
        if (dipped(fin)) return `pays back for good in ${yearsText(fin.payback)} (it's back to $0 after ${yearsText(fin.firstPayback)}, then replacing the battery puts it behind for a while)`;
        return `pays back in ${yearsText(fin.payback)}`;
    }

    // ---------- How keen to be ----------
    // A verdict from today's dollars back per $1 up front, whether it still pays with power prices
    // 20 % lower, and how soon it pays back for good (thresholds in the planEnthusiasm help).
    const KEEN = [
        { word: 'Not worth it', why: 'at these prices it costs more than it saves', dot: 'bg-red-500', text: 'text-red-700' },
        { word: 'Marginal', why: 'it only just pays for itself, and could easily not', dot: 'bg-orange-500', text: 'text-orange-700' },
        { word: 'Modest', why: 'worth it on paper, but not by much', dot: 'bg-amber-500', text: 'text-amber-700' },
        { word: 'Good', why: 'clearly worth doing', dot: 'bg-green-500', text: 'text-green-700' },
        { word: 'Strong', why: 'well worth doing', dot: 'bg-green-600', text: 'text-green-800' }
    ];

    // What if feed-in prices from 10am to 3pm halve (as more rooftop solar pushes them down)? The
    // option and everything it's measured against, re-run with those prices. Cached per option.
    function dayFeedIn(x) {
        const r = ui.results;
        if (!x.fin || !(x.solarKw > 0)) return null;
        const key = `${x.solarKw}|${x.batteryKwh}|${x.plan}`;
        r.dayCache = r.dayCache || {};
        if (r.dayCache[key]) return r.dayCache[key];
        const dp = r.dayPrep || (r.dayPrep = Amber.plannerPrepare(Object.assign({}, r.res.prep.ctx, { dayFeedInScale: 0.5 })));
        const bill = (plan, s, b) => Amber.plannerBill(dp, plan, s, b);
        const opt = Object.assign({}, x.opt, {
            free: bill(r.compare.plan, 0, 0), planOnly: bill(x.plan, 0, 0), solarOnly: bill(x.plan, x.solarKw, 0),
            batteryBills: x.batteryKwh > 0 ? x.opt.batteryBills.map((bb) => ({ kwh: bb.kwh, bill: bill(x.plan, x.solarKw, bb.kwh) })) : []
        });
        opt.today = opt.free;
        r.dayCache[key] = { fin: Amber.plannerFinance(opt, r.f) };
        return r.dayCache[key];
    }

    function keenness(x) {
        const fin = x.fin;
        if (!fin || fin.capex.total <= 0) return null;
        const f = ui.results.f;
        const back = 1 + fin.npv / fin.capex.total;
        const low = Amber.plannerFinance(scaled(x.opt, 0.8), f);
        const day = dayFeedIn(x);
        const robust = low.npv > 0 && (!day || day.fin.npv > 0);
        const level = Amber.plannerKeenLevel({ npv: fin.npv, capex: fin.capex.total, payback: fin.payback, lowNpv: low.npv, dayNpv: day ? day.fin.npv : null });
        return { level, back, low, day, robust, wait: Amber.plannerWaitAYear(x.opt, f) };
    }

    function keenHtml(x, lead) {
        const k = keenness(x);
        if (!k) return '';
        const r = ui.results;
        const fin = x.fin;
        const l = KEEN[k.level];
        const dots = [1, 2, 3, 4].map((i) => `<span class="inline-block w-2.5 h-2.5 rounded-full ${i <= k.level ? l.dot : 'bg-gray-300'}"></span>`).join('');
        let why = `every $1 up front comes back as about $${Math.max(0, k.back).toFixed(2)} in today's money over ${r.f.years} years`;
        if (fin.irr != null) why += ` (like ${(fin.irr * 100).toFixed(1)} % a year, against the ${r.f.discount} % you'd otherwise earn)`;
        if (fin.npv > 0) why += k.low.npv > 0 ? '; it still pays if power prices are 20 % lower than you set' : `; if power prices are 20 % lower than you set, it doesn't pay (${dollars(k.low.npv)})`;
        if (fin.npv > 0 && k.day) why += k.day.fin.npv > 0 ? `; if feed-in prices from 10am to 3pm halve, it's still worth ${dollars(k.day.fin.npv)}` : `; if feed-in prices from 10am to 3pm halve, it doesn't pay (${dollars(k.day.fin.npv)})`;
        let timing = '';
        const capex = fin.capex.total;
        const quiet = k.wait.change > -0.01 * capex; // waiting costs under 1 % of the up-front cost, or pays
        const cost = k.wait.change >= 0 ? `${dollars(k.wait.change)} better off` : `${dollars(-k.wait.change)} worse off`;
        if (k.level > 0 && quiet && k.level <= 2) timing = ` Waiting a year costs next to nothing (${cost}), so it's reasonable to wait and see what prices, rebates and technology do.`;
        else if (k.level > 0 && quiet) timing = ` There's no rush: waiting a year costs next to nothing (${cost}), though it's worth doing either way.`;
        else if (k.level > 0 && k.wait.change < -0.03 * capex) timing = ` Waiting a year would cost about ${dollars(-k.wait.change)}, so if you're going to do it, sooner is better.`;
        const lbl = lead || 'How keen to be';
        return `<div class="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 mb-3" data-keen="${k.level}">`
            + `<div class="flex flex-wrap items-center gap-2"><span class="text-sm font-semibold text-gray-800" data-help="planEnthusiasm" data-help-label="${esc(lbl)}">${esc(lbl)}</span>`
            + `<span class="flex gap-1" role="img" aria-label="${k.level} of 4">${dots}</span><span class="text-sm font-bold ${l.text}">${l.word}</span></div>`
            + `<p class="text-sm text-gray-700 mt-1">${l.why.charAt(0).toUpperCase()}${l.why.slice(1)}: ${why}.${timing}</p></div>`;
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
        lines.push(`<p class="text-lg">Next year's bill: <strong>${dollars(best.bill)}</strong>, against <strong>${dollars(r.base)}</strong> with nothing new on ${esc(label(r.compare.plan))}${r.compareWith ? '' : ` (the cheapest plan ${r.allow.size < r.plans.length ? 'you\'d use ' : ''}for you as things are)`}: <strong class="${best.saving >= 0 ? 'text-green-700' : 'text-red-700'}">${dollars(Math.abs(best.saving))} a year ${best.saving >= 0 ? 'less' : 'more'}</strong>.</p>`);
        if (hardware) {
            lines.push(`<p>What to ask installers for: <strong>${esc(orderText(best))}</strong>. <span class="text-sm text-gray-600">${esc(orderNote(best))}</span></p>`);
            lines.push(`<p>Up front: <strong>${dollars(fin.capex.total)}</strong> after ${dollars(fin.capex.rebates)} of rebates. It ${paybackText(fin)}, and over ${r.f.years} years it's worth <strong>${dollars(fin.npv)}</strong> in today's money${fin.irr != null ? ` (like ${(fin.irr * 100).toFixed(1)} % interest a year)` : ''}.</p>`);
        }
        if (r.free.plan !== r.compare.plan && r.base - r.free.bill > 1) {
            const onTop = `Payback and worth here include that, because you're comparing against ${esc(label(r.compare.plan))}: pick "Whatever's cheapest" to count only what the panels and battery add.`;
            lines.push(`<p>${hardware ? 'Without buying anything, just' : 'Just'} switching to ${esc(label(r.free.plan))} would save <strong>${dollars(r.base - r.free.bill)}</strong> a year. ${hardware ? onTop : ''}</p>`);
        }
        if (!hardware) {
            const bestKit = ranked().filter((x) => x.solarKw > 0 || x.batteryKwh > 0).sort((a, b) => b.fin.npv - a.fin.npv)[0];
            if (bestKit) {
                lines.push(`<p>None of the panels or batteries tried pays for itself over ${r.f.years} years at these prices. The closest is ${esc(describe(bestKit))} on ${esc(label(bestKit.plan))}: ${dollars(bestKit.fin.capex.total)} up front, it ${paybackText(bestKit.fin)} and is worth ${dollars(bestKit.fin.npv)} overall. Cheaper quotes or bigger rebates could change that: try your own prices under "Prices and rebates".</p>`);
            }
        }
        if (hardware) {
            const wait = Amber.plannerWaitAYear(best.opt, r.f);
            lines.push(`<p class="text-sm text-gray-600">Waiting a year: up front would be ${dollars(wait.capexLater)} (hardware cheaper, rebates smaller) and you'd miss a year of savings; overall you'd be <strong>${dollars(Math.abs(wait.change))} ${wait.change > 0 ? 'better' : 'worse'} off</strong> by waiting.</p>`);
        }
        const k = r.loads.kwh;
        const added = k.ev + k.hotWater + k.heating + k.cooking;
        if (added > 0) {
            lines.push(`<p class="text-sm text-gray-600">Your planned changes add ${Math.round(added).toLocaleString('en-AU')} kWh a year to every option (car ${Math.round(k.ev)}, hot water ${Math.round(k.hotWater)}, heating ${Math.round(k.heating)}, cooking ${Math.round(k.cooking)})${r.loads.gasSaving > 0 ? `, and you'd stop paying about ${dollars(r.loads.gasSaving)} a year for gas` : ''}.</p>`);
        }
        const kit = hardware ? best : ranked().filter((x) => x.solarKw > 0 || x.batteryKwh > 0).sort((a, b) => b.fin.npv - a.fin.npv)[0];
        const keen = kit ? keenHtml(kit, hardware ? 'How keen to be' : 'New panels or a battery') : '';
        box.innerHTML = `<h3 class="text-xl font-bold text-gray-900 mb-2">Best for you: ${esc(describe(best))}, on ${esc(label(best.plan))}</h3>${keen}<div class="space-y-2 text-gray-800">${lines.join('')}</div>`;
    }

    function system(x) {
        if (x.solarKw > 0 && x.batteryKwh > 0) return `${kw(x.solarKw)} + ${kwh(x.batteryKwh)}`;
        if (x.solarKw > 0) return `${kw(x.solarKw)} solar`;
        if (x.batteryKwh > 0) return `${kwh(x.batteryKwh)} battery`;
        return 'Nothing new';
    }

    const shortLabel = (name) => (name === 'Amber' ? 'Amber' : label(name));
    const th = (t, right, help) => `<th scope="col" class="px-2 py-2 ${right ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider"${help ? ` data-help="${help}" data-help-label="${t}"` : ''}>${t}</th>`;
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
            + `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th(`The year on ${esc(label(r.readingsPlan))}`)}${th('Your readings', 1)}${th('Planner\'s battery', 1)}${th('No battery', 1)}</tr></thead><tbody class="divide-y divide-gray-200">`
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
        let html = `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th('Solar + battery')}${th('Plan')}${th('Up front', 1)}${th('Bill next year', 1)}${th('Saves a year', 1, 'planSavesYear')}${th('Pays back', 1, 'planPaysBack')}${th(`Worth in today's money (${r.f.years} yrs)`, 1, 'planWorth')}</tr></thead><tbody class="divide-y divide-gray-200">`;
        const row = (x, i, note) => {
            const fin = x.fin;
            const selected = ui.selected ? (ui.selected === x) : i === 0;
            const pb = !fin ? '—' : fin.capex.total <= 0 ? '—' : `${fin.payback == null ? 'never' : `${fin.payback.toFixed(1)} yrs`}${dipped(fin) ? '*' : ''}`;
            return `<tr class="cursor-pointer hover:bg-gray-50 ${selected ? 'bg-indigo-50 font-semibold' : ''}" data-plan-option="${i}" tabindex="0" role="button">`
                + td(esc(system(x)), 'text-left whitespace-nowrap')
                + td(`${esc(shortLabel(x.plan))}${note ? ` <span class="text-xs font-normal text-gray-500">(${note})</span>` : ''}`, 'text-left')
                + td(fin ? dollars(fin.capex.total) : '$0')
                + td(dollars(x.bill))
                + td(dollars(r.base - x.bill), `text-right whitespace-nowrap ${r.base - x.bill >= 0 ? 'text-green-700' : 'text-red-700'}`)
                + td(pb)
                + td(fin ? dollars(fin.npv) : '—')
                + '</tr>';
        };
        top.forEach((x, i) => { html += row(x, i); });
        html += '<tr class="bg-gray-50"><td colspan="7" class="px-2 py-1 text-xs text-gray-500">For comparison</td></tr>';
        html += row(r.compare, -1, r.compareWith ? 'what you compare against' : 'cheapest with nothing new');
        if (r.free.plan !== r.compare.plan) html += row(r.free, -2, 'cheapest with nothing new');
        html += '</tbody></table>';
        if (top.some((x) => x.fin && dipped(x.fin))) html += '<p class="text-xs text-gray-500 mt-2">* Back to $0 sooner, then behind again for a while when the battery is replaced: "Pays back" is when it\'s ahead for good.</p>';
        html += `<p class="text-xs text-gray-500 mt-2">${r.options.length.toLocaleString('en-AU')} options compared${r.res.searchedPlans.length ? `; batteries tried on ${r.res.searchedPlans.length} plan${r.res.searchedPlans.length === 1 ? '' : 's'}` : ''}. Tap a row for its year month by month.</p>`;
        $('planOptionsTable').innerHTML = html;
        const pick = (tr) => {
            const i = parseInt(tr.getAttribute('data-plan-option'), 10);
            ui.selected = i >= 0 ? top[i] : (i === -1 ? r.compare : r.free);
            renderOptions();
            renderDetail();
        };
        $('planOptionsTable').querySelectorAll('[data-plan-option]').forEach((tr) => {
            tr.addEventListener('click', () => pick(tr));
            tr.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(tr); } });
        });
    }

    // The year's bill in parts, the same way for Amber and other plans.
    function billParts(ev) {
        const c = ev.cost;
        const exportCharge = c.exportCharge || 0;
        const sum = (a) => a.reduce((s, v) => s + v, 0);
        return {
            bought: (c.usage || 0) - exportCharge + (c.controlled || 0), boughtKwh: sum(ev.imp) + sum(ev.cl),
            sold: c.feedIn || 0, soldKwh: sum(ev.exp),
            exportCharge, demand: c.demand || 0,
            fixed: (c.daily || 0) + (c.connection || 0) + (c.subscription || 0),
            total: c.total
        };
    }

    // Where an option's saving comes from: against the same plan with nothing new, so it shows
    // what the new panels or battery do (a plan switch is shown separately in the month table).
    // Power thrown away at the export limit (after any battery has stored what it can).
    const lostToLimit = (ev) => (ev.sim ? ev.sim.limited : ev.flows.curtailed);

    function breakdownHtml(x, ev, base) {
        if (!(x.solarKw > 0 || x.batteryKwh > 0)) return '';
        const r = ui.results;
        const a = billParts(base);
        const b = billParts(ev);
        const k = (v) => Math.round(v).toLocaleString('en-AU');
        const row = (name, before, after, kwhBefore, kwhAfter) => {
            const saves = before - after;
            if (Math.abs(before) < 0.5 && Math.abs(after) < 0.5) return '';
            return `<tr><td class="px-2 py-2">${name}${kwhBefore != null ? ` <span class="text-xs text-gray-500">(${k(kwhBefore)} → ${k(kwhAfter)} kWh)</span>` : ''}</td>`
                + `<td class="px-2 py-2 text-right whitespace-nowrap">${dollars(before)}</td><td class="px-2 py-2 text-right whitespace-nowrap">${dollars(after)}</td>`
                + `<td class="px-2 py-2 text-right whitespace-nowrap ${Math.abs(saves) < 0.5 ? 'text-gray-500' : saves > 0 ? 'text-green-700' : 'text-red-700'}">${Math.abs(saves) < 0.5 ? '—' : dollars(saves)}</td></tr>`;
        };
        const th2 = (t, right) => `<th scope="col" class="px-2 py-2 ${right ? 'text-right' : 'text-left'} text-xs font-medium text-gray-500 uppercase tracking-wider">${t}</th>`;
        let html = `<h4 class="text-sm font-semibold text-gray-800 mt-5 mb-1" data-help="planBreakdown" data-help-label="Where the saving comes from">Where the saving comes from</h4>`
            + `<p class="text-xs text-gray-600 mb-2">${esc(label(x.plan))} with nothing new, against ${esc(describe(x))} on the same plan.</p>`
            + `<table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th2('Part of the bill')}${th2('Nothing new', 1)}${th2('With it', 1)}${th2('Saves', 1)}</tr></thead><tbody class="divide-y divide-gray-200">`
            + row('Power bought', a.bought, b.bought, a.boughtKwh, b.boughtKwh)
            + row('Solar and battery sent to the grid', a.sold, b.sold, a.soldKwh, b.soldKwh)
            + row('Network export charge', a.exportCharge, b.exportCharge)
            + row('Demand charge', a.demand, b.demand)
            + row('Daily charges', a.fixed, b.fixed)
            + `<tr class="bg-gray-50 font-semibold"><td class="px-2 py-2">Year</td><td class="px-2 py-2 text-right">${dollars(a.total)}</td><td class="px-2 py-2 text-right">${dollars(b.total)}</td><td class="px-2 py-2 text-right">${dollars(a.total - b.total)}</td></tr></tbody></table>`;
        if (x.solarKw > 0) {
            const f = ev.flows;
            const clipped = (r.res.prep.ctx.solarPerKw && r.res.prep.ctx.solarPerKw.clipped || 0) * x.solarKw;
            const made = f.solarKwh + clipped;
            const pct = (v) => (made > 0 ? Math.round((v / made) * 100) : 0);
            const lost = Math.max(0, lostToLimit(ev) - lostToLimit(base));
            const offNew = Math.max(0, (ev.switchedOff || 0) - (base.switchedOff || 0));
            const sentOut = Math.max(0, f.solarKwh - f.solarSelf - lost - offNew);
            const parts = [`${k(f.solarSelf)} (${pct(f.solarSelf)} %) is used at home as it's made`, `${k(sentOut)} (${pct(sentOut)} %) goes to the battery or the grid`,
                `${k(lost)} (${pct(lost)} %) is lost because the ${num('planExportLimit')} kW export limit is already used`];
            if (offNew > 1) parts.push(`${k(offNew)} (${pct(offNew)} %) isn't sent because the feed-in price is negative then (the panels switch off)`);
            if (clipped > 1) parts.push(`${k(clipped)} (${pct(clipped)} %) is clipped by the inverter on the sunniest middays`);
            let negative = '';
            if (!r.switchOff) {
                // Panels that can't switch off: what sending power out at negative prices costs.
                const sell = r.res.prep.pricesOf(r.res.prep.byName[x.plan]).sell;
                let negKwh = 0;
                let negCost = 0;
                for (let i = 0; i < ev.exp.length; i++) if (ev.exp[i] > 0 && sell[i] < 0) { negKwh += ev.exp[i]; negCost -= ev.exp[i] * sell[i] / 100; }
                if (negKwh > 1) negative = ` With panels that can't switch off, ${k(negKwh)} kWh a year goes out while the feed-in price is negative, costing about ${dollars(negCost)}.`;
            }
            html += `<p class="text-xs text-gray-600 mt-2">The new panels could make ${k(made)} kWh a year: ${parts.join('; ')}.${negative} `
                + 'Sent-out solar earns each half hour\'s feed-in price from your readings\' year (on Amber, last year\'s actual prices), which is often small or even negative at midday and better early, late and in winter.</p>';
        }
        return html;
    }

    function renderDetail() {
        const r = ui.results;
        const x = ui.selected || ranked()[0];
        if (!x) return;
        const prep = r.res.prep;
        const ev = Amber.plannerEvaluate(prep, x.plan, x.solarKw, x.batteryKwh);
        const now = Amber.plannerEvaluate(prep, r.compare.plan, 0, 0);
        $('planDetailTitle').textContent = `Next year, month by month: ${describe(x)} on ${label(x.plan)}`;
        let html = `<p class="text-sm text-gray-600 mb-2">Compared with nothing new on ${esc(label(r.compare.plan))}.</p><table class="min-w-full divide-y divide-gray-200 text-sm"><thead class="bg-gray-50"><tr>${th('Month')}${th('Bought (kWh)', 1)}${th('Sent out (kWh)', 1)}${x.solarKw > 0 ? th('Solar made (kWh)', 1) : ''}${th('Bill', 1)}${th('Compared with', 1)}${th('Saves', 1)}</tr></thead><tbody class="divide-y divide-gray-200">`;
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
        if (x.solarKw > 0 || x.batteryKwh > 0) facts.push(`What to ask installers for: ${orderText(x)}. ${orderNote(x)}`);
        facts.push(`Power bought from the grid: ${Math.round(nowImport).toLocaleString('en-AU')} → ${Math.round(tot.imp).toLocaleString('en-AU')} kWh a year${change ? ` (${Math.abs(change)} % ${change < 0 ? 'less' : 'more'})` : ''}.${change > 0 && ev.sim ? ' The battery buys extra when power is cheap, to use or sell when it\'s dear, and loses a little on the way.' : ''}`);
        if (x.solarKw > 0) {
            const f = ev.flows;
            const viaBattery = ev.sim ? ev.sim.charged - ev.sim.gridCharged : 0;
            facts.push(`New panels make ${Math.round(f.solarKwh).toLocaleString('en-AU')} kWh a year: ${Math.round(f.solarSelf).toLocaleString('en-AU')} used straight away${viaBattery > 0 ? `, the battery stores up to ${Math.round(viaBattery).toLocaleString('en-AU')} of what would have been sent out` : ''}${lostToLimit(ev) > 1 ? `, and ${Math.round(lostToLimit(ev)).toLocaleString('en-AU')} kWh is lost to the ${num('planExportLimit')} kW export limit` : ''}.`);
        }
        if (ev.sim) {
            const which = r.existing.kwh > 0 ? (x.batteryKwh > 0 ? `Your ${kwh(r.existing.kwh)} battery and the new one together` : `Your ${kwh(r.existing.kwh)} battery`) : 'The battery';
            facts.push(`${which} cycle${r.existing.kwh > 0 && x.batteryKwh > 0 ? '' : 's'} about ${Math.round(ev.sim.cycles)} times a year (${(ev.sim.cycles / 365).toFixed(1)} a day)${ev.sim.gridCharged > 1 ? `, charging ${Math.round(ev.sim.gridCharged).toLocaleString('en-AU')} kWh from the grid when it's cheap or free` : ''}${ev.sim.exported > 1 ? ` and selling ${Math.round(ev.sim.exported).toLocaleString('en-AU')} kWh back when prices are high` : ''}.`);
        }
        html += `<ul class="list-disc pl-5 mt-3 space-y-1 text-sm text-gray-700">${facts.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
        html += breakdownHtml(x, ev, Amber.plannerEvaluate(prep, x.plan, 0, 0));
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
        let repl = x.batteryKwh > 0 ? ` The battery is replaced in year ${r.f.batteryLife + 1}${r.f.batteryLife + 1 <= r.f.years ? '' : ' (after this chart)'}, the inverter in year ${r.f.inverterLife + 1}: the dips.` : '';
        const fin = x.fin;
        if (fin.residual && fin.residual.total > 0 && fin.batteryBought) {
            const left = r.f.batteryLife - (r.f.years - fin.batteryBought.year + 1);
            repl += ` When the ${r.f.years} years are up, the replacement battery still has ${left} of its ${r.f.batteryLife} years to go, worth about ${dollars(fin.residual.total)} then (with the inverter's). That isn't on the chart, which is cash only, but it counts toward the worth in today's money.`;
        }
        notes.innerHTML = keenHtml(x) + `<p>Paid ${dollars(x.fin.capex.total)} now; the line climbs as the savings come in. It ${paybackText(x.fin)} at today's prices (${high.payback != null ? `${high.payback.toFixed(1)} years` : 'never'} if prices are 20 % higher, ${low.payback != null ? `${low.payback.toFixed(1)} years` : 'never'} if 20 % lower).${repl}</p>`
            + `<p class="text-gray-600">Savings here are against nothing new on ${esc(label(r.compare.plan))}${r.compare === r.free ? ', the cheapest plan as things are, so they count only what the panels and battery add' : ', so they include anything gained just by switching plan'}. They shrink as the panels and battery wear, and grow as power prices rise ${r.f.escalation} % a year.</p>`;
    }

    function renderAssumptions() {
        const r = ui.results;
        const y = ui.year;
        const town = Amber.SOLAR_LOCATIONS.find((l) => l.id === $('planLocation').value);
        const items = [
            `Next year is your readings from ${fmtDate(y.first)} to ${fmtDate(y.last)} with the changes you entered, priced at today's plan rates (${r.plans.length - 1} plans for your network, prices as at ${fmtDate(Amber.TEMPLATES_AS_AT)}). Amber uses its prices over those same 12 months: a different year's wholesale prices could make it cheaper or dearer.`,
            'Each option is worked out half hour by half hour, with every plan\'s daily charges, free windows, caps and demand charges, the same way as the Compare tab.',
            r.weather ? `New panels: a typical year of sunshine for ${town ? town.name : 'your area'} (PVGIS, EU Joint Research Centre), matched to PVGIS's own yield, with ${num('planShading')} % shade. West-facing panels may come out a little low: that weather data has cloudier afternoons than mornings. The inverter is assumed to be 75 % of the panel size (panels up to 133 % of the inverter, as most installers fit them); each option shows the sizes to ask for.` : 'No new panels.',
            r.existing.kwh > 0
                ? `Your ${kwh(r.existing.kwh)} battery is taken out of your readings (an estimate: the meter can't see what it covers at home, so that comes from its size, the days it filled up and ran flat, and your use on nights it was empty), then run again on every plan, together with any new battery. Your panels stay in the readings; new ones are added on top.`
                : 'New panels are added on top of your meter readings, so panels you already have keep doing what they did.',
            'The battery covers your home when power is dear, soaks up solar that would sell cheaply, charges from the grid in free or cheap hours, and sells when an export pays well. It knows each day\'s prices in the morning (as fixed plans and Amber\'s forecasts allow), so a real battery may do a little worse, especially on Amber\'s price spikes.',
            `Money: prices rise ${r.f.escalation} % a year; the battery loses ${r.f.batteryFade} % of its capacity a year and is replaced after ${r.f.batteryLife} years; the inverter after ${r.f.inverterLife}; panels lose ${r.f.solarDegradation} % a year. "Worth" is today's money at ${r.f.discount} % a year.`,
            r.switchOff
                ? 'When a feed-in price is negative (on Amber it happens in the middle of sunny days), a battery soaks up what it can and the panels switch off for the rest, so nothing is paid to export. Untick "Panels switch off when the feed-in price is negative" if yours can\'t.'
                : 'Your panels can\'t switch off, so power sent out while the feed-in price is negative costs you (a battery soaks up what it can first).',
            'How keen to be also checks what happens if feed-in prices from 10am to 3pm halve, as more rooftop solar pushes them down; it uses last year\'s prices otherwise.',
            'Not included: maintenance, any payments for joining a virtual power plant, the value of backup power in a blackout, or your network moving you to a different tariff after you install.'
        ];
        if (y.exportUnpriced) items.push(`${y.exportUnpriced} half hours had no wholesale price, so Amber pays nothing for solar sent out then.`);
        $('planAssumptions').innerHTML = items.map((t) => `<li>${esc(t)}</li>`).join('');
    }

    Amber.plannerUi = { show, run };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
