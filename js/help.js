(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Help bubbles. Any element with data-help="key" (a key of Amber.HELP, or plain text) gets a small
     * "?" button after its text. Hover or focus shows the explanation; tap or click pins it open;
     * Escape, a click elsewhere or another bubble closes it. Works for content added later too.
     */
    Amber.HELP = {
        // ---------- Top of the page ----------
        dates: 'The days to look at. Type a start and end date, or tap a shortcut underneath. Today is never included because its meter readings aren\'t final yet.',
        presets: 'Shortcuts for common periods. "Last 12 months" needs a year of history: Amber\'s connection only reaches back about 3 months, so import your usage file on the Start tab first.',
        compareBtn: 'Gets your meter readings for these dates (from Amber, or from what\'s already saved in this browser) and works out what they cost on Amber and on the plan you\'re comparing with. Results appear on the Compare and My usage tabs.',
        gst: 'GST is the 10% tax on your bill. On: totals include GST, the same as your bill. Off: totals without GST. Solar feed-in credits have no GST either way.',
        exportMenu: 'Download the numbers as a spreadsheet file (CSV) that opens in Excel, Numbers or Google Sheets.',
        settings: 'Housekeeping: clear the meter readings saved in this browser, or delete plans you typed in yourself.',

        // ---------- Start tab ----------
        apiKey: 'A private code that lets this page read your usage and prices from Amber. It can only read, never change your account or pay anything. To get one: log in at app.amber.com.au, open Developers, choose "Generate new token" and copy it straight away (Amber only shows it once). It starts with psk_.',
        rememberKey: 'Ticked: you won\'t need to paste the key again on this device. Untick on a shared computer: the key is then forgotten when you close this browser tab. Either way it\'s never sent anywhere except Amber.',
        site: 'If your Amber account covers more than one property, pick which one to look at. The NMI is the 10 or 11 character National Meter Identifier printed on your bill; it\'s different for every property.',
        amberCharges: 'Amber\'s fixed charges, which are added to the price of the power itself. The defaults are typical for Sydney (Ausgrid). Loading one of your Amber bills fills in your real figures. You can usually leave these alone.',
        amberDaily: 'The daily charge for being connected: your network\'s daily fee plus the meter fee, which Amber passes straight on. On your Amber bill it\'s the "Daily supply" lines, shown there without GST; this box includes GST.',
        amberSubscription: 'Amber\'s membership fee, shown per day. About $25 a month (82 cents a day) including GST. Other retailers don\'t charge this but build their margin into their prices instead.',
        amberDemand: 'Only used if your network charges for demand (for example Ausgrid\'s EA116 tariff): cents per kW per day for your busiest half hour each month. Set it to 0 if your bill has no demand line.',
        amberPrev: 'Network charges change every 1 July. Days before 1 July 2026 are costed with these. Loading a bill from before July fills them in.',
        loadBill: 'Choose the PDF bill Amber emailed you. It\'s read here in your browser (nothing is uploaded), fills in the boxes below with your real charges, and opens a line-by-line check on the Bill check tab.',
        csvImport: 'Amber\'s connection here only reaches back about 3 months. For a longer history, download your usage file from Amber (Usage, then Export, in the Amber app or website; Amber support can email up to 12 months) and import it here. It\'s saved in this browser so every tab can use it.',
        nem12: 'NEM12 is the standard file of meter readings that every Australian retailer and network can give you. Ask your current retailer for your "interval data" or download it from your network\'s website (for example Ausgrid, Endeavour, Energex or Powercor). A year of data gives the fairest answer.',
        nem12Network: 'The company that owns the poles and wires in your area. It\'s on your bill, and the app guesses it from the meter number. It decides Amber\'s network charges.',
        nem12Tariff: 'The network\'s price plan for your home. Bills often show it as "network tariff" or a code like EA025. Not sure? Keep the default, which is what most homes with a smart meter are on.',
        nem12Export: 'How the network charges or rewards solar you send to the grid. Some networks charge a little for exports in the middle of the day and pay a bonus in the evening. If you have no solar this doesn\'t matter.',
        nem12Controlled: 'For a separate hot-water or pool circuit switched on by the network. "Controlled load 1" runs overnight only; "Controlled load 2" also runs some daytime hours. Your bill shows which.',
        nem12Channels: 'A meter records several things. E channels are power you use; B channels are solar you send out. A second E channel that\'s off most of the day is usually an electric hot-water system on a controlled load. Change any guess that looks wrong.',
        greenPower: 'An optional extra Amber charge (0.73 cents per kWh plus GST) that buys renewable energy certificates to match your use. Leave unticked unless you want it.',
        nem12Build: 'Prices every reading in the file the way Amber would have, then opens the Compare tab so you can pick your current plan and see the difference.',

        // ---------- Compare tab ----------
        state: 'Plans and prices differ by state and by electricity network. Pick your state to list its plans.',
        plan: 'The plan to compare Amber with. The list shows plans for your area with their published prices, including the government\'s reference price (DMO or VDO). Pick "Enter my own rates" to type in the prices from your own bill.',
        ratesToggle: 'Shows every price the plan uses. Change any of them to match your bill; your changes are saved as your own plan.',
        planName: 'A name for your own plan so you can find it in the list again later. Saved in this browser only.',
        rateType: 'Flat rate: the same price per kWh all day. Time of use: different prices at different times of day, usually dearer in the late afternoon and evening. Your bill shows which you\'re on.',
        dailySupply: 'The fixed amount you pay every day just to be connected, whether you use any power or not. On bills it\'s called the "supply charge" or "daily charge", in cents per day.',
        usageRate: 'What you pay for each kilowatt-hour (kWh) you use. One kWh is running a 1,000-watt heater for an hour. Bills show it in cents per kWh (c/kWh).',
        clRate: 'Controlled load is a separate, cheaper circuit for an electric hot-water system or pool pump, switched on by the network at set times. Only matters if your bill has a "controlled load" line. Leave 0 to charge it at the normal price.',
        feedIn: 'What the plan pays you for each kWh your solar panels send to the grid. Leave at 0 if you don\'t have solar.',
        touFree: 'Some plans make power free (or very cheap) for a few hours in the middle of the day, when solar floods the grid. Set those hours here. Leave without any times if the plan doesn\'t have a free period.',
        touFreeCap: 'The most kWh a day you get free. Anything over it is charged at the price that would normally apply at that time. Leave blank if there\'s no limit.',
        touSuperOffpeak: 'An extra-cheap time, usually overnight, often sold for charging electric cars. Leave without any times if the plan doesn\'t have one.',
        touPeak: 'The dearest time of day, usually late afternoon to evening (for example 3pm to 9pm). Add the hours, untick any days it doesn\'t apply, and pick months if it\'s seasonal.',
        touShoulder: 'An in-between price, usually mornings and early evenings. Many plans don\'t have one; leave it without any times.',
        touOffpeak: 'The plan\'s normal cheaper price. It applies whenever none of the times above do.',
        addWindow: 'Adds another block of hours, for example a morning peak and an evening peak. Each block has its own days and (if seasonal) months.',
        windowMonths: 'Months this time applies. Leave all unticked for every month.',
        feedInTou: 'Tick if the plan pays a different solar rate at different times, for example a higher rate from 4pm to 9pm. Add each time, its rate and any daily kWh limit.',
        demandToggle: 'A demand charge is based on your single busiest half hour in a set window (for example 4pm to 9pm), charged per kW for every day of the month. Running the oven, air-con and dryer at once pushes it up. Only tick this if the plan you\'re comparing has one.',
        demandRate: 'Cents per kW per day. The charge is your busiest half hour\'s average power (in kW) × this rate × the number of days.',
        demandWindow: 'The hours when your busiest half hour counts. Use outside these hours doesn\'t affect the charge.',
        demandDays: 'The days the demand window applies. Many networks only count weekdays.',

        // ---------- Results ----------
        results: 'What the same electricity cost (or would have cost) on Amber and on the plan you picked, line by line. The coloured box underneath gives the answer in one sentence.',
        colLine: 'What the line is for: power you bought from the grid, solar you sent out, or a hot-water circuit, split into the plan\'s time bands.',
        colPeriod: 'The plan\'s time band (peak, off-peak and so on) these kWh fell into.',
        colUsage: 'How much electricity, in kilowatt-hours (kWh). One kWh is a 1,000-watt heater running for an hour.',
        colAmber: 'What Amber charged for these kWh at its live prices, which change every 5 to 30 minutes with the wholesale market. Solar credits show with a minus sign.',
        colOther: 'The same kWh at the other plan\'s published prices. The small figure in brackets is its price per kWh.',
        rowDemand: 'Amber passes on your network\'s demand charge: your busiest half hour in the evening window each month (shown in kW) × the daily demand rate × the days in that month. Spreading out big appliances in the evening lowers it.',
        rowOtherDemand: 'The other plan\'s demand charge, from the settings under "Show this plan\'s prices".',
        rowDaily: 'The fixed daily charge for being connected, for every day in the period.',
        rowSubscription: 'Amber\'s membership fee, about $25 a month. Other retailers don\'t have one; their margin is built into their prices instead.',
        rowExportCharge: 'Some networks (such as Ausgrid) charge a small fee for solar sent out in the middle of the day above a free daily amount. Amber passes it on.',
        rowTotal: 'Everything added up for the period.',
        allPlans: 'Your exact usage priced on every plan we have for your network, cheapest first. Tap a plan to show it in full in the table above.',
        monthly: 'The same comparison month by month, using every whole month of readings saved in this browser, so you can see summer against winter.',
        freeWindow: 'Free-power plans reward moving your use into their free hours. If you have a battery, an electric car, a pool pump or a timer hot-water system, this estimates what you\'d pay if you ran them in the free hours instead of when you did.',
        shiftBudgets: 'How many kWh a day you could move into the free hours (charging a battery or car, running the pool pump). Type a few numbers separated by commas; each becomes a column in the table.',
        shiftBattery: 'The usable size of your home battery in kWh (one Tesla Powerwall is 13.5). Leave blank and the app guesses from your readings; type 0 if you don\'t have one.',
        shiftWindowKw: 'How fast you can pull power from the grid during the free hours, limited by your connection and chargers. 13 kW suits a battery plus an electric car charger.',
        shiftExportKw: 'The most your battery and inverter can send to the grid at once. Most networks limit homes to 5 kW.',
        shiftRte: 'A battery loses a little energy along the way: 90% means 10 kWh in gives 9 kWh back out.',

        // ---------- My usage tab ----------
        dayGraph: 'One day of your power use. Blue bars above the line: power bought from the grid. Green bars below the line: solar sent to the grid. Red line: Amber\'s buy price at that time; green line: what Amber paid for solar. Use the arrows or the list to change the day; drag across the chart to zoom in.',
        avgGraph: 'Your average day across the dates you chose: when you usually use power, and what Amber\'s price usually is at those times. Hover a bar to also see the other plan\'s price then.',
        calendar: 'Each day\'s totals. ↓ is kWh bought from the grid, ↑ is kWh of solar sent out, and the dollar figure is that day\'s Amber cost including daily charges (red = you paid, green = you were paid). Tap a day to open its graph. "est" means the meter readings for that day aren\'t final yet.',
        moreStats: 'A few handy numbers about how you buy and sell power on Amber. The price spike and negative price lines show how much of your use landed on Amber\'s dearest or cheapest moments.',

        // ---------- Bill check tab ----------
        billCheck: 'Choose the PDF bill Amber emailed you. The app reads it here in your browser, loads your meter readings for the same dates, and checks each line of the bill against them. Differences of a few cents are normal rounding.',

        // ---------- Glossary ----------
        g_kwh: 'Kilowatt-hour: the unit electricity is sold in. One kWh runs a 1,000-watt heater for an hour, or a fridge for about a day. A typical home uses 10 to 25 kWh a day.',
        g_kw: 'Kilowatt: how much power is flowing at one moment. A kettle is about 2 kW; an electric oven, 3 to 5 kW. kWh = kW × hours.',
        g_ckwh: 'Cents per kilowatt-hour: the price of each kWh. 30 c/kWh means each kWh costs 30 cents.',
        g_wholesale: 'The price power stations get for electricity, set every 5 minutes by the national electricity market. Amber passes it straight on to you, so your price moves up and down through the day; most other retailers charge a fixed price and carry the risk themselves.',
        g_network: 'The company that owns the poles and wires to your home (for example Ausgrid, Endeavour, Energex or Powercor). You can\'t choose it; it charges every retailer the same, and the retailer passes it on.',
        g_networkTariff: 'The network\'s own price plan for your home: flat, time of use, or with a demand charge. It\'s set by the network, not the retailer, and is printed on most bills as a code (for example EA025).',
        g_tou: 'Time of use: different prices at different times of day. Peak (usually 3pm to 9pm) is dearest, off-peak cheapest, and shoulder in between.',
        g_feedin: 'Feed-in is solar power your panels send to the grid when you\'re not using it, and the credit you get for it (the feed-in tariff, FiT).',
        g_demand: 'A demand charge is based on your single busiest half hour in a set window each month, charged per kW per day. It rewards not running lots of big appliances at the same time.',
        g_controlled: 'Controlled load is a separate, cheaper circuit for an electric hot-water system or pool pump that the network switches on at set times, often overnight.',
        g_nmi: 'National Meter Identifier: the 10 or 11 character number that identifies your property\'s electricity connection. It\'s printed on every bill.',
        g_nem12: 'The standard file format for meter readings in Australia. Any retailer or network can give you one with your 5- or 30-minute readings.',
        g_dmo: 'The Default Market Offer (DMO, most states) and Victorian Default Offer (VDO) are government-set reference prices. Most market offers are cheaper.',
        g_smartshift: 'Amber\'s automatic battery control. It charges your battery when power is cheap and sells to the grid when prices spike.',
        g_gst: 'Goods and Services Tax: 10% added to electricity bills. Solar feed-in credits for households don\'t include GST.'
    };

    Amber.GLOSSARY = [
        ['kWh', 'g_kwh'], ['kW', 'g_kw'], ['c/kWh', 'g_ckwh'], ['Wholesale price', 'g_wholesale'],
        ['Network', 'g_network'], ['Network tariff', 'g_networkTariff'], ['Time of use (peak, shoulder, off-peak)', 'g_tou'],
        ['Feed-in', 'g_feedin'], ['Demand charge', 'g_demand'], ['Controlled load', 'g_controlled'], ['NMI', 'g_nmi'],
        ['NEM12', 'g_nem12'], ['DMO / VDO', 'g_dmo'], ['SmartShift', 'g_smartshift'], ['GST', 'g_gst']
    ];

    Amber.helpText = function (keyOrText) {
        if (!keyOrText) return '';
        return Amber.HELP[keyOrText] || keyOrText;
    };

    let bubble = null;
    let openFor = null;
    let pinned = false;
    let hoverTimer = null;
    let seq = 0;

    function ensureBubble() {
        if (bubble) return bubble;
        bubble = document.createElement('div');
        bubble.id = 'helpBubble';
        bubble.className = 'help-bubble hidden';
        bubble.setAttribute('role', 'tooltip');
        document.body.appendChild(bubble);
        return bubble;
    }

    function labelFor(el) {
        const text = (el.getAttribute('data-help-label') || el.textContent || '').replace(/\?$/, '').replace(/\s+/g, ' ').trim();
        return text.length > 60 ? `${text.substring(0, 57)}…` : text;
    }

    function place(btn) {
        const b = ensureBubble();
        const r = btn.getBoundingClientRect();
        const vw = document.documentElement.clientWidth;
        const width = Math.min(320, vw - 24);
        b.style.width = `${width}px`;
        let left = r.left + r.width / 2 - width / 2;
        left = Math.max(12, Math.min(left, vw - width - 12));
        b.style.left = `${left + window.scrollX}px`;
        b.style.top = '0px';
        const h = b.offsetHeight;
        const below = r.bottom + 8;
        const fitsBelow = below + h < window.innerHeight - 8 || r.top < h + 16;
        b.style.top = `${(fitsBelow ? below : r.top - h - 8) + window.scrollY}px`;
        b.classList.toggle('help-above', !fitsBelow);
    }

    function show(btn, pin) {
        const b = ensureBubble();
        if (openFor && openFor !== btn) hide();
        openFor = btn;
        pinned = !!pin;
        b.textContent = btn.getAttribute('data-help-text') || '';
        b.classList.remove('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('aria-describedby', 'helpBubble');
        place(btn);
    }

    function hide() {
        if (!bubble) return;
        bubble.classList.add('hidden');
        if (openFor) {
            openFor.setAttribute('aria-expanded', 'false');
            openFor.removeAttribute('aria-describedby');
        }
        openFor = null;
        pinned = false;
    }
    Amber.hideHelp = hide;

    /** Add a help button to every [data-help] element under root that doesn't have one yet. */
    Amber.attachHelp = function (rootEl) {
        const scope = rootEl || document;
        const els = [];
        if (scope.nodeType === 1 && scope.hasAttribute('data-help')) els.push(scope);
        if (scope.querySelectorAll) els.push(...scope.querySelectorAll('[data-help]'));
        els.forEach((el) => {
            if (el.getAttribute('data-help-done') === '1') return;
            const text = Amber.helpText(el.getAttribute('data-help'));
            if (!text) return;
            el.setAttribute('data-help-done', '1');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'help-btn';
            btn.id = `help-${++seq}`;
            btn.textContent = '?';
            btn.setAttribute('aria-label', `What is "${labelFor(el)}"?`);
            btn.setAttribute('aria-expanded', 'false');
            btn.setAttribute('data-help-text', text);
            // Labels and headings name other things, so the button sits beside them, not inside.
            if (/^(LABEL|H[1-6])$/.test(el.tagName) && el.parentNode) {
                const row = document.createElement('div');
                row.className = 'help-row';
                el.parentNode.insertBefore(row, el);
                row.appendChild(el);
                row.appendChild(btn);
            } else {
                el.appendChild(btn);
            }
        });
    };

    function init() {
        Amber.attachHelp(document);
        document.addEventListener('click', (e) => {
            const btn = e.target.closest && e.target.closest('.help-btn');
            if (btn) {
                // Don't let the click reach a surrounding label, summary or row.
                e.preventDefault();
                e.stopPropagation();
                if (openFor === btn && pinned) hide();
                else show(btn, true);
                return;
            }
            if (openFor && !(bubble && bubble.contains(e.target))) hide();
        }, true);
        document.addEventListener('mouseover', (e) => {
            const btn = e.target.closest && e.target.closest('.help-btn');
            if (!btn || pinned) return;
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(() => show(btn, false), 120);
        });
        document.addEventListener('mouseout', (e) => {
            const btn = e.target.closest && e.target.closest('.help-btn');
            if (!btn) return;
            clearTimeout(hoverTimer);
            if (!pinned && openFor === btn) hide();
        });
        document.addEventListener('focusin', (e) => {
            if (e.target.classList && e.target.classList.contains('help-btn') && openFor !== e.target) show(e.target, false);
        });
        document.addEventListener('focusout', (e) => {
            if (e.target === openFor && !pinned) hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && openFor) {
                const btn = openFor;
                hide();
                btn.focus();
            }
        });
        window.addEventListener('resize', () => { if (openFor) place(openFor); });
        if (typeof MutationObserver === 'function') {
            new MutationObserver((records) => {
                records.forEach((r) => r.addedNodes.forEach((n) => { if (n.nodeType === 1) Amber.attachHelp(n); }));
                if (openFor && !document.body.contains(openFor)) hide();
            }).observe(document.body, { childList: true, subtree: true });
        }
    }

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
