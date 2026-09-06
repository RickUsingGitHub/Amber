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
        return String(raw || '')
            .replace(/[–—]/g, '-')
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

    Amber.parseAmberBillText = function (raw) {
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
