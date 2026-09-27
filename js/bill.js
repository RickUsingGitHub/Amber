(function (root) {
    const Amber = root.Amber = root.Amber || {};

    function roundCents(n) {
        if (!Number.isFinite(n)) return null;
        return Math.round(n * 1000) / 1000;
    }

    function toNumber(str) {
        if (str == null) return null;
        const n = parseFloat(String(str).replace(/,/g, ''));
        return Number.isFinite(n) ? n : null;
    }

    Amber.normalizeBillText = function (raw) {
        // Amber's bill font maps brackets and dashes to private-use glyphs
        // (\ue081/\ue082 ≈ "(" ")", \ue088/\ue089 ≈ "-"), so restore them before stripping.
        return String(raw || '')
            .replace(/\u00a0/g, ' ')
            .replace(/[\ue081]/g, '(')
            .replace(/[\ue082]/g, ')')
            .replace(/[–—−‒‐‑―\ue088\ue089]/g, '-')
            .replace(/[\ue000-\uf8ff]/g, ' ')
            .replace(/¢/g, 'c')
            .replace(/[^\x20-\x7E\n]/g, ' ')
            .replace(/[ \t]+/g, ' ')
            .replace(/\n{2,}/g, '\n')
            .trim();
    };

    Amber.billRatesAreExGst = function (text) {
        return /\(\s*excl(?:uding)?\s*GST/i.test(text) || /Totals\s*\(\s*excl/i.test(text);
    };

    Amber.inferBillDays = function (text) {
        const period = text.match(/Billing Period:\s*(\d+)\s*days/i);
        if (period) return parseInt(period[1], 10);
        const supply = text.match(/Network Daily Supply Charges\s+(\d+)\s*days/i);
        if (supply) return parseInt(supply[1], 10);
        const range = text.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s*-+\s*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (range) {
            const parseAu = (s) => {
                const [d, m, y] = s.split('/').map((x) => parseInt(x, 10));
                return new Date(y, m - 1, d);
            };
            const a = parseAu(range[1]);
            const b = parseAu(range[2]);
            if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime())) {
                return Math.round((b - a) / 86400000) + 1;
            }
        }
        const anyDays = text.match(/\b(\d{1,2})\s+days\b/i);
        if (anyDays) return parseInt(anyDays[1], 10);
        return null;
    };

    function dollarsToIncGstCents(dollars, exGst) {
        if (!Number.isFinite(dollars)) return null;
        return roundCents(dollars * (exGst ? 1.1 : 1) * 100);
    }

    Amber.parseConnectionDollarsPerDay = function (text) {
        const daily = text.match(/Network\s*-\s*Daily[\s\S]{0,90}?\b(\d{1,2})\s+([\d.]+)\s*\$/);
        const metering = text.match(/Metering Charge[\s\S]{0,90}?\b(\d{1,2})\s+([\d.]+)\s*\$/);
        if (daily && metering) {
            const a = toNumber(daily[2]);
            const b = toNumber(metering[2]);
            if (a != null && b != null) return a + b;
        }
        const summary = text.match(/Network Daily Supply Charges[\s\S]{0,80}?([\d.]+)\s*\$\s*\/\s*Day/i);
        if (summary) return toNumber(summary[1]);
        return null;
    };

    Amber.parseSubscriptionDollarsPerDay = function (text, days) {
        const detailed = text.match(/Amber Monthly Subscription[\s\S]{0,90}?\b(\d{1,2})\s+([\d.]+)\s*\$([\d.]+)/i);
        if (detailed) {
            const rate = toNumber(detailed[2]);
            if (rate != null && rate < 20) return rate;
        }
        const perDay = text.match(/Amber Monthly Subscription[\s\S]{0,80}?([\d.]+)\s*\$\s*\/\s*day/i);
        if (perDay) return toNumber(perDay[1]);
        const costOnly = text.match(/Amber Monthly Subscription\s+\$([\d.]+)/i);
        if (costOnly && days) {
            const cost = toNumber(costOnly[1]);
            if (cost != null) return cost / days;
        }
        return null;
    };

    Amber.parseDemandDollarsPerKwDay = function (text, days) {
        const row = text.match(/Network\s*-\s*Peak Demand[\s\S]{0,120}?([\d.]+)\s*kW\s+([\d.]+)\s*\$\s*\/\s*kW\s*\/\s*Day\s*\$?\s*([\d.]+)/i);
        if (!row) return null;
        const kw = toNumber(row[1]);
        const price = toNumber(row[2]);
        const cost = toNumber(row[3]);
        if (price == null) return null;
        if (kw && cost != null && days) {
            const asPeriod = Math.abs(kw * price - cost);
            const asDaily = Math.abs(kw * price * days - cost);
            if (asPeriod <= asDaily && asPeriod / Math.max(cost, 0.01) < 0.05) {
                return price / days;
            }
            if (asDaily / Math.max(cost, 0.01) < 0.05) return price;
        }
        if (days && price > 2) return price / days;
        return price;
    };

    const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

    /** "01/07/2026", "1/7/26", "1 Jul 2026", "01 July 2026" -> "2026-07-01". */
    function auDateToIso(s) {
        const str = String(s || '').trim();
        let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        let day;
        let month;
        let year;
        if (m) {
            day = +m[1]; month = +m[2]; year = +m[3];
        } else {
            m = str.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/);
            if (!m) return null;
            day = +m[1]; month = MONTHS[m[2].substring(0, 3).toLowerCase()]; year = +m[3];
        }
        if (year < 100) year += 2000;
        if (!month || month > 12 || day < 1 || day > 31) return null;
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const DATE_RE = '(\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9}\\.?,?\\s+\\d{2,4})';

    /**
     * Billing period start/end. Tries, in order: a date range near "Billing Period", any date
     * range in the text, "01 Aug - 31 Aug 2026" (year on the end only), then the file name
     * (Amber names bills like 20260801-20260831.pdf).
     */
    Amber.parseBillPeriod = function (rawText, fileName) {
        const text = String(rawText || '').replace(/(\d)\s*\/\s*(?=\d)/g, '$1/');
        const range = new RegExp(`${DATE_RE}\\s*(?:-+|to)\\s*${DATE_RE}`, 'i');
        const ok = (start, end) => start && end && end >= start ? { start, end } : null;
        // Two dates separated only by spaces (the dash may have been an unreadable glyph):
        // accept when 1–120 days apart.
        const spaced = new RegExp(`${DATE_RE}\\s+${DATE_RE}`, 'i');
        const plausible = (m) => {
            if (!m) return null;
            const r = ok(auDateToIso(m[1]), auDateToIso(m[2]));
            if (!r) return null;
            const days = Amber.inclusiveDayCount ? Amber.inclusiveDayCount(r.start, r.end) : 2;
            return days >= 2 && days <= 121 ? r : null;
        };
        const labelled = (label) => {
            const at = text.match(new RegExp(`${label}[\\s\\S]{0,160}`, 'i'));
            return at ? (plausible(at[0].match(range)) || plausible(at[0].match(spaced))) : null;
        };
        let found = labelled('Time\\s*period') || labelled('Bill(?:ing)?\\s*Period')
            || plausible(text.match(range)) || plausible(text.match(spaced));
        if (found) return found;
        let m;

        m = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s*(?:-+|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
        if (m) {
            const endIso = auDateToIso(`${m[3]} ${m[4]} ${m[5]}`);
            let startIso = auDateToIso(`${m[1]} ${m[2]} ${m[5]}`);
            if (startIso && endIso && startIso > endIso) startIso = auDateToIso(`${m[1]} ${m[2]} ${+m[5] - 1}`);
            found = ok(startIso, endIso);
            if (found) return found;
        }

        m = String(fileName || '').match(/(20\d{2})(\d{2})(\d{2})\D{0,3}(20\d{2})(\d{2})(\d{2})/);
        if (m) {
            found = ok(`${m[1]}-${m[2]}-${m[3]}`, `${m[4]}-${m[5]}-${m[6]}`);
            if (found) { found.fromFileName = true; return found; }
        }
        return { start: null, end: null };
    };

    function money(re, text) {
        const m = text.match(re);
        return m ? toNumber(m[1]) : null;
    }

    /**
     * Bill line items for the bill check. Amounts are as printed on the bill (ex GST in the
     * charges summary); null when a line isn't found.
     */
    Amber.parseBillCheck = function (text, fileName) {
        const period = Amber.parseBillPeriod(text, fileName);
        const usage = text.match(/\bUsage\s+([\d,]+(?:\.\d+)?)\s*kWh\s+[\d.]+\s*\$\s*\/\s*kWh\s+\$\s*([\d,]+(?:\.\d+)?)/i);
        const demandRow = text.match(/Network\s*-\s*Peak Demand[\s\S]{0,120}?([\d.]+)\s*kW\s+[\d.]+\s*\$\s*\/\s*kW\s*\/\s*Day\s*\$?\s*([\d,.]+)/i);
        const exportCredits = Amber.parseExportCredits(text);
        const feedIn = text.match(/(?:Feed[- ]?in|Solar Export|Export(?:ed)?(?: Energy)?|Credits?)[^\n$]{0,60}?([\d,]+(?:\.\d+)?)\s*kWh[^\n$]{0,60}?(-)?\s*\$\s*(-)?\s*\(?([\d,]+(?:\.\d+)?)\)?/i);
        const check = {
            start: period.start,
            end: period.end,
            periodFromFileName: !!period.fromFileName,
            usageKwh: usage ? toNumber(usage[1]) : null,
            usageCost: usage ? toNumber(usage[2]) : money(/Usage Totals\s*\(excl GST\):\s*\$\s*([\d,.]+)/i, text),
            demandKw: demandRow ? toNumber(demandRow[1]) : null,
            demandCost: demandRow ? toNumber(demandRow[2]) : money(/Network Demand Charges\s+\$\s*([\d,.]+)/i, text),
            supplyCost: money(/Daily Supply Totals\s*\(excl GST\):\s*\$\s*([\d,.]+)/i, text)
                ?? money(/Network Daily Supply Charges[^\n$]*\$\s*\/\s*Day\s+\$\s*([\d,.]+)/i, text),
            subscriptionCost: money(/Amber Fee Totals\s*\(excl GST\):\s*\$\s*([\d,.]+)/i, text)
                ?? money(/Amber Monthly Subscription\s+\$\s*([\d,.]+)/i, text),
            gst: money(/GST\s*-?\s*10%\s+\$\s*([\d,.]+)/i, text),
            chargesTotal: money(/CHARGES TOTAL\s+\$\s*([\d,.]+)/i, text),
            feedInKwh: exportCredits ? exportCredits.exportKwh : (feedIn ? toNumber(feedIn[1]) : null),
            feedInCredit: exportCredits ? exportCredits.credit : (feedIn ? toNumber(feedIn[4]) : null),
            exportRewardKwh: exportCredits ? exportCredits.rewardKwh : null,
            exportRewardCredit: exportCredits ? exportCredits.rewardCredit : null,
            exportRows: exportCredits ? exportCredits.rows : null
        };
        const found = Object.keys(check).filter((k) => check[k] != null && !['start', 'end', 'exportRows', 'periodFromFileName'].includes(k));
        check.found = found;
        check.ok = !!(check.start && check.end && found.length >= 2);
        return check;
    };

    /**
     * "YOUR EXPORT CREDITS" table: rows like "Solar Exports 01 Aug - 31 Aug 44.39 kWh 0.1428 $6.34"
     * and "Export Reward Energy ... 1.25 kWh 0.0401 $0.05", then "Export Totals (excl GST): $6.39".
     * Export reward kWh (Ausgrid EA029 evening exports) are part of total exports, so exported
     * kWh come from the Solar Exports row; the credit is the section total.
     */
    Amber.parseExportCredits = function (text) {
        const start = text.search(/EXPORT CREDITS/i);
        if (start < 0) return null;
        const endRel = text.substring(start).search(/Export Totals/i);
        const section = text.substring(start, endRel >= 0 ? start + endRel + 60 : start + 1500);
        const rowRe = /([A-Za-z][A-Za-z ]*?)\s+\d{1,2}\s+[A-Za-z]{3,9}\s*-\s*\d{1,2}\s+[A-Za-z]{3,9}\s+([\d,]+(?:\.\d+)?)\s*kWh\s+([\d.]+)\s+-?\$\s*([\d,]+(?:\.\d+)?)/gi;
        const rows = [];
        let m;
        while ((m = rowRe.exec(section))) {
            rows.push({ label: m[1].replace(/^(Charge Description|Dates|Amount|Rate|Credit|\(\$\/kWh\)|\s)+/i, '').trim(), kwh: toNumber(m[2]), rate: toNumber(m[3]), credit: toNumber(m[4]) });
        }
        if (!rows.length) return null;
        const solar = rows.find((r) => /solar|export(?!.*reward)/i.test(r.label) && !/reward/i.test(r.label));
        const reward = rows.find((r) => /reward/i.test(r.label));
        const total = section.match(/Export Totals\s*\(excl GST\):?\s*\$\s*([\d,.]+)/i);
        return {
            rows,
            exportKwh: solar ? solar.kwh : rows.reduce((s, r) => s + r.kwh, 0),
            credit: total ? toNumber(total[1]) : rows.reduce((s, r) => s + r.credit, 0),
            rewardKwh: reward ? reward.kwh : null,
            rewardCredit: reward ? reward.credit : null
        };
    };

    /**
     * Compare bill lines with meter-data totals (from Amber.periodTotals, GST-inclusive).
     * Bill charges are ex GST, so meter charges are divided by 1.1 to match.
     * Returns rows { key, label, unit, bill, meter, diff, ok } for lines present on the bill.
     */
    Amber.compareBill = function (check, totals) {
        const ex = (v) => v / 1.1;
        const rows = [];
        const add = (key, label, unit, bill, meter, tol) => {
            if (bill == null || meter == null || !Number.isFinite(meter)) return;
            const diff = meter - bill;
            rows.push({ key, label, unit, bill, meter, diff, ok: Math.abs(diff) <= tol(bill) });
        };
        const kwhTol = (b) => Math.max(1, Math.abs(b) * 0.01);
        const dollarTol = (b) => Math.max(0.5, Math.abs(b) * 0.01);
        add('usageKwh', 'Usage', 'kWh', check.usageKwh, totals.importKwh, kwhTol);
        add('usageCost', 'Usage charges', '$', check.usageCost, ex(totals.amberUsage), dollarTol);
        add('demandKw', 'Peak demand', 'kW', check.demandKw, totals.demandKw, () => 0.05);
        add('demandCost', 'Demand charges', '$', check.demandCost, ex(totals.amberDemand), dollarTol);
        add('supplyCost', 'Daily supply', '$', check.supplyCost, ex(totals.amberConnection), dollarTol);
        add('subscriptionCost', 'Amber subscription', '$', check.subscriptionCost, ex(totals.amberSubscription), dollarTol);
        add('gst', 'GST', '$', check.gst, totals.amberCharges - ex(totals.amberCharges), dollarTol);
        add('chargesTotal', 'Charges total (inc GST)', '$', check.chargesTotal, totals.amberCharges, dollarTol);
        add('feedInKwh', 'Solar exports', 'kWh', check.feedInKwh, totals.exportKwh, kwhTol);
        add('feedInCredit', 'Export credits', '$', check.feedInCredit, -totals.amberFeedIn, dollarTol);
        add('exportRewardKwh', 'Export reward (4–9 pm exports)', 'kWh', check.exportRewardKwh, totals.eveningExportKwh, (b) => Math.max(0.3, Math.abs(b) * 0.05));
        return rows;
    };

    Amber.parseAmberBillText = function (raw, fileName) {
        const text = Amber.normalizeBillText(raw);
        const days = Amber.inferBillDays(text);
        const exGst = Amber.billRatesAreExGst(text);
        const connectionDay = Amber.parseConnectionDollarsPerDay(text);
        const subscriptionDay = Amber.parseSubscriptionDollarsPerDay(text, days);
        const demandDay = Amber.parseDemandDollarsPerKwDay(text, days);
        const found = [];
        const connectionCents = dollarsToIncGstCents(connectionDay, exGst);
        const subscriptionCents = dollarsToIncGstCents(subscriptionDay, exGst);
        const demandCents = dollarsToIncGstCents(demandDay, exGst);
        if (connectionCents != null) found.push('daily connection');
        if (subscriptionCents != null) found.push('subscription');
        if (demandCents != null) found.push('demand');
        return {
            check: Amber.parseBillCheck(text, fileName),
            days,
            exGst,
            connectionCents,
            subscriptionCents,
            demandCents,
            found,
            ok: found.length > 0
        };
    };

    Amber.extractPdfText = async function (buffer) {
        const pdfjsLib = root.pdfjsLib;
        if (!pdfjsLib) throw new Error('PDF reader is not loaded.');
        if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
        }
        const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        const loading = pdfjsLib.getDocument({
            data,
            disableWorker: false,
            isEvalSupported: false,
            useSystemFonts: true
        });
        const doc = await loading.promise;
        const pages = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(content.items.map((item) => item.str).join(' '));
        }
        return pages.join('\n');
    };

    Amber.readBillFile = async function (file, loadPdfJs) {
        if (!file) throw new Error('No file selected.');
        const name = (file.name || '').toLowerCase();
        const type = file.type || '';
        if (type.indexOf('image/') === 0) {
            throw new Error('Images cannot be read here. Upload the PDF Amber emailed you, or type the rates from the charges page.');
        }
        const buffer = await file.arrayBuffer();
        if (type === 'application/pdf' || name.endsWith('.pdf')) {
            if (typeof loadPdfJs === 'function') await loadPdfJs();
            return Amber.extractPdfText(buffer);
        }
        const text = new TextDecoder('utf-8').decode(buffer);
        if (!text.trim()) throw new Error('That file looks empty.');
        return text;
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
