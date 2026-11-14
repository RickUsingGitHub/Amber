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
        compareBtn: 'Gets your meter readings for these dates (from Amber, or from what\'s already saved in this browser) and works out what they cost on Amber and on the plan you\'re comparing with. Results appear on the Compare and Usage tabs.',
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
        loadBill: 'Choose the PDF bill Amber emailed you. It\'s read here in your browser (nothing is uploaded), fills in the boxes below with your real charges, and opens a line-by-line check on the Bill? tab.',
        csvImport: 'Amber\'s connection here only reaches back about 3 months. For a longer history, download your usage file from Amber (Usage, then Export, in the Amber app or website; Amber support can email up to 12 months) and import it here. It\'s saved in this browser so every tab can use it.',
        nem12: 'NEM12 is the standard file of meter readings that every Australian retailer and network can give you. Ask your current retailer for your "interval data" or download it from your network\'s website (for example Ausgrid, Endeavour, Energex or Powercor). A year of data gives the fairest answer.',
        nem12Nmi: 'If your NEM12 file contains readings for more than one meter identifier (NMI), choose which property to load.',
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
        cdrPlanFile: 'Import a JSON plan file from the Australian Energy Regulator\'s Consumer Data Right (Energy Made Easy) API or a saved Amber Compare plan JSON.',
        compareWhatIf: 'Test how adding an electric vehicle or a heat-pump hot-water system would change the cost on Amber and on every other plan for these dates.',
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
        rowExportCharge: 'Some networks (such as Ausgrid) charge a small fee for solar sent out in the middle of the day above a free daily amount. The free amount is added up over each calendar month, as on your bill. Amber passes the fee on.',
        rowTotal: 'Everything added up for the period.',
        allPlans: 'Your exact usage priced on every plan we have for your network, cheapest first. Tap a plan to show it in full in the table above.',
        monthly: 'The same comparison month by month, for each whole calendar month within the dates you chose. Pick Last 12 months to see summer against winter.',
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
        billCheck: 'Choose the PDF bill Amber emailed you. The app reads it here in your browser, loads your meter readings for the bill\'s dates (the dates at the top stay as they are), and checks each line of the bill against them. Differences of a few cents are normal rounding.',

        // ---------- Solar & battery tab ----------
        planner: 'Uses your last 12 months of meter readings to try every mix of solar panels, home battery and retailer plan, half hour by half hour, and shows which pays for itself best. It works with Amber or with any retailer\'s NEM12 file. It\'s an estimate: get quotes before you buy.',
        planRetailers: 'Untick any company you wouldn\'t use, or single plans under it. Only ticked plans are searched, shown as options, and used for "Whatever\'s cheapest". Untick all, then tick one company or plan, to see the best setup with just that one. Your choice is remembered in this browser.',
        planCompareWith: 'What every option is measured against: this plan\'s bill with nothing new bought. "Whatever\'s cheapest" (the default) uses the cheapest of the plans you\'ve ticked under "Companies and plans to consider", as things are, because switching plan costs nothing: payback and worth then count only what new panels and a battery add. Pick the plan you\'re on now to see everything you\'d gain, switching included (it can be one you\'ve unticked). Unticking companies can change which plan is cheapest, and so the numbers: to compare two runs fairly, pick the same plan here in both.',
        planLocation: 'How much sun your panels get depends on where you live. The app uses a typical year of sunshine for this town from the European Commission\'s PVGIS service. Pick the closest one.',
        planExportLimit: 'Most networks cap how fast a home can send solar to the grid, usually 5 kW (some allow 10 kW, and some only 1.5 kW without approval). Solar above the limit that you can\'t use or store is wasted. Your installer can tell you yours.',
        planExisting: 'Panels and a battery you already have. Your meter readings already include them, so new panels and batteries are added on top. A battery is run again on every plan, because it would charge and discharge differently on a different plan (for example filling up in a free midday window, or chasing Amber\'s price spikes). The app fills in a guess from your readings: change it to match your system.',
        planExistingBattery: 'How much of your battery is used day to day, in kWh. If you keep some for blackouts (a Tesla Powerwall keeps 20% by default), take that off: a 13.5 kWh Powerwall with 20% kept back uses about 10.8. Leave 0 if you don\'t have one. Battery power is how fast it charges and discharges (5 kW for most home batteries).',
        planExistingCheck: 'The meter can\'t see what your battery does inside the house, so the app works it out from your readings, then runs your battery again on the plan your readings are from (Amber, or the plan picked on the Compare tab). If that comes close to what your readings actually cost, the comparisons are on firm ground. Every option is worked out the same way, so they compare fairly even if it\'s a little off.',
        planDecide: 'Leave everything on "Find the best size" to let the app search. If you have a quote in mind, pick "A size I choose" and the app keeps it fixed. "No new panels" or "No battery" leaves them out. You can also rule companies in or out under "Companies and plans to consider". These are new purchases: anything you already have goes under "What you already have".',
        planOrientation: 'The direction your panels would face. North gets the most sun over a year in Australia. East or west gets roughly 10 to 20% less, but makes more of its power in the morning or afternoon. "Half east, half west" splits the panels across both sides of the roof.',
        planTilt: 'The slope of the panels in degrees. Most Australian roofs are 15 to 25 degrees. Flat panels are 0.',
        planShading: 'Trees, chimneys or nearby buildings that shade the panels. 0% means no shade at all; 10% is a little afternoon shade; above 25% panels may not be worth it.',
        planCosts: 'Typical installed prices in late 2026 including GST, and the federal rebates. Quotes vary a lot, so change these to match yours. The app also allows for parts wearing out and being replaced.',
        planChanges: 'Things you\'re planning that change how much power you\'ll use, such as an electric car or swapping gas appliances for electric. The app adds this use to your readings before it searches, so the right size battery and solar are chosen for the home you\'ll have.',
        planEv: 'How far the car is driven each year, and when it would charge. The app assumes 17 kWh per 100 km and a 7 kW home charger. "In the day" uses your own solar; "overnight" suits a cheap overnight rate.',
        planHotWater: 'A heat-pump hot-water system uses about a third of the power of an ordinary electric one. Pick what it would replace: an electric system on a controlled load (your controlled load readings shrink) or a gas one (new electricity use, and your gas bill shrinks).',
        planGasHeating: 'Your gas use for heating, in megajoules (MJ) a year, from your gas bill. The app works out the power a reverse-cycle air conditioner would need for the same warmth, mostly in winter. Leave at 0 if you don\'t heat with gas.',
        planStc: 'The federal Small-scale Technology Certificates (STCs) that lower the price of solar, usually taken off the installer\'s quote. Roughly $280 per kW; the amount shrinks every year until the scheme ends in 2030.',
        planBatteryRebate: 'The federal Cheaper Home Batteries rebate, paid per usable kWh and usually taken off the quote. About $255 a kWh from May 2026. Bigger batteries get less: the full amount on the first 14 kWh, 60% of it from 14 to 28 kWh, 15% from 28 to 50 kWh and nothing above that. The app works this out for each battery size. The rebate shrinks every January and July until 2030, so check the current figure with your installer. Some states add their own rebate.',
        planRebateStepDown: 'How much smaller the rebates get each year. Used for the "wait a year" comparison only: a replacement battery, years from now, is costed with no rebate. The battery rebate now steps down every January and July, so it may shrink faster than this.',
        planRte: 'A battery loses a little energy on the way in and out. 90% means 10 kWh in gives 9 kWh back out. Most lithium home batteries are 88 to 92%.',
        planBatteryPower: 'How fast the battery can charge or discharge, compared with its size. 0.4 means a 13.5 kWh battery runs at about 5.4 kW. The app keeps this between 2.5 kW and 15 kW.',
        planBatteryWear: 'Batteries slowly hold less. 2% a year means a 10 kWh battery holds about 8 kWh after 10 years. The app also replaces it at the end of its life.',
        planEscalation: 'How fast electricity prices rise each year. Higher rises make solar and batteries pay back sooner. 3% is close to the long-run average.',
        planDiscount: 'The return you\'d get if you left the money in the bank or paid off your mortgage instead. Future savings are worth less than money now by this much a year. It\'s used for the 20-year value (NPV).',
        planSavesYear: 'Next year\'s bill on this option against the bill with nothing new on the plan you compare against (by default the cheapest plan for you as things are).',
        planPaysBack: 'When the savings have paid back what you spent, in plain dollars, and you stay ahead from then on. Replacing the battery (and inverter) later can put you behind again for a while: a * means it was back to $0 sooner but then fell behind.',
        planWorth: 'Everything the option saves over these years, minus everything it costs (including replacing the battery and inverter), counted in today\'s money: each future dollar counts for less, at the interest you\'d otherwise earn. A battery replaced within these years still has life left at the end, and that\'s counted too. Above $0 means it beats leaving the money in the bank.',
        planOptions: 'Each row is one mix of new solar, battery and plan, with next year\'s bill, what it saves, when it pays back and what it\'s worth over the years. Tap the ? on a column heading for what it counts. Tap a row to see its year month by month and its payback chart.',
        planEnthusiasm: 'A quick verdict on the option. Strong: every $1 you pay up front comes back as $1.75 or more in today\'s money, it still pays if power prices are 20% lower than you set (and, with new panels, if feed-in prices from 10am to 3pm halve), and it pays back within 8 years. Good: $1.40 or more back, and still pays in both of those cases. Modest: $1.15 or more back. Marginal: just over $1 back. Not worth it: less back than you put in. It also says whether waiting a year would cost you anything. It\'s a rule of thumb: how keen to be also depends on how sure you are about prices, rebates and your plans for the home.',
        planBreakdown: 'The option against the same plan with nothing new, part by part: what you\'d pay for power bought, what you\'d earn for power sent to the grid, and any export or demand charge. Underneath, where the new panels\' power goes over a year: used at home, stored or sent out, or lost to the export limit or the inverter. On Amber, power sent out earns last year\'s actual feed-in prices for each half hour; if a lot more solar is installed around you, daytime prices could be lower in future.',
        planSwitchOff: 'On Amber the feed-in price goes negative at times, mostly in the middle of sunny days: sending power out then costs you. Ticked: your panels stop sending power out at those times (a battery soaks up what it can first), so you neither pay nor earn. That takes a "curtailable" inverter: one Amber can switch off remotely, from Amber\'s list of supported inverters, so ask for one if you\'re buying and check the one you have. Untick if your inverter can\'t: the planner then charges you for power sent out at negative prices.',
        planForesight: 'How much the battery knows about the rest of the day\'s prices and solar when deciding when to charge and discharge. "Optimal foresight" assumes the battery sees the day\'s prices in advance; "Realistic forecast" uses a smoothed forecast and discounts sudden unpredicted wholesale spikes; "Simple time-of-use rules" charges only from solar or cheap off-peak periods and discharges during dearer hours.',
        planMatrix: 'A grid of every solar panel size (rows) against every battery size (columns), showing the best plan\'s 20-year value (NPV) and payback for each combination. Tap any cell to inspect that size in detail below.',
        planNumbers: 'The averages behind the option on show (tap a row in "Your options" to change it), so you can check they look right. Compare the price per kWh bought and the daily charges with your bills or the plan\'s price list, and the panels\' kWh a day per kW with installers\' quotes. As a rule of thumb, each kWh from new panels should be worth somewhere between the feed-in price and the price of power (more of it used at home means nearer the price of power), and should be worth more than it costs; a battery should save more per kWh it gives back than it costs per kWh. Prices through the day are plain averages of every half hour, to show when power is cheap or dear.',
        planPayback: 'The total you\'re ahead (or behind) each year after paying for the system, in plain dollars, against nothing new on the plan you compare against. Where the line crosses zero for good is the payback year. Replacing the battery and inverter makes it dip, and can put you behind again for a while. The dashed lines show power prices 20% higher or lower.',

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
