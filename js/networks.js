(function (root) {
    const Amber = root.Amber = root.Amber || {};

    /*
     * Network tariffs and Amber's other charges, for estimating what Amber would have charged a
     * household that isn't on Amber (NEM12 import). All c/kWh and c/day figures are ex GST, as
     * published on Amber's "<Network> Residential Tariffs — FY2026-27" help pages (effective
     * 1 July 2026). Times are local wall-clock; days 0 = Sunday; months 1–12.
     *
     * Amber's usage price each interval = (loss factor × wholesale + network energy rate +
     * environmental + market + hedging [+ GreenPower]) + GST. Feed-in = −(loss factor × wholesale)
     * + network export charge (or − reward), no GST. Checked against a year of Amber prices on
     * Ausgrid EA116/EA029 (loss factor 1.048, from those prices). Other networks' loss factors are
     * typical values, not measured.
     *
     * priceCap: Amber's quarterly wholesale energy price cap (inc GST, FY27 Q2): the usage-weighted
     * wholesale part of the usage price is credited down to it each quarter.
     */
    const ALL = [0, 1, 2, 3, 4, 5, 6];
    const WD = [1, 2, 3, 4, 5];
    const SUMMER_NOV_MAR = [11, 12, 1, 2, 3];
    const NOT_NOV_MAR = [4, 5, 6, 7, 8, 9, 10];
    const AUSGRID_SEASONS = [11, 12, 1, 2, 3, 6, 7, 8];
    const VIC_PEAK_MONTHS = [12, 1, 2, 6, 7, 8];
    const VIC_SHOULDER_MONTHS = [3, 4, 5, 9, 10, 11];
    const VIC_EXPORT_CHARGE_MONTHS = [9, 10, 11, 12, 1, 2, 3, 4, 5];
    const w = (start, end, days, months) => Object.assign({ start, end, days: days || ALL }, months ? { months } : {});
    const band = (rate, windows) => ({ rate, windows });
    const perMonth = (months, rate, other) => {
        const out = {};
        for (let m = 1; m <= 12; m++) out[m] = months.includes(m) ? rate : other;
        return out;
    };
    const VIC_CHARGES = { environmental: 1.63, market: 1.05, hedging: 1.00, greenPower: 0.73 };
    const NSW_CHARGES = { environmental: 1.01, market: 0.96, hedging: 1.00, greenPower: 0.73 };

    // Victorian CER (two-way) tariffs share a shape.
    function vicCer(daily, peak, shoulder, offpeak) {
        return {
            name: 'Residential CER (two-way)', daily,
            bands: [band(peak, [w('16:00', '21:00', ALL, VIC_PEAK_MONTHS)]), band(shoulder, [w('16:00', '21:00', ALL, VIC_SHOULDER_MONTHS)]), band(1.00, [w('11:00', '16:00')])],
            rate: offpeak,
            export: { bands: [band(-7.00, [w('16:00', '21:00', ALL, VIC_PEAK_MONTHS)]), band(1.00, [w('11:00', '16:00', ALL, VIC_EXPORT_CHARGE_MONTHS)])], freeKwhPerDay: 1 }
        };
    }
    function vicTou(daily, peak, offpeak, name) {
        return { name: name || 'Residential time of use', daily, bands: [band(peak, [w('16:00', '21:00')]), band(1.00, [w('11:00', '16:00')])], rate: offpeak };
    }

    Amber.NETWORKS = {
        ausgrid: {
            name: 'Ausgrid', state: 'NSW', region: 'NSW1', lossFactor: 1.048, measuredLossFactor: true,
            metering: 42.95, charges: NSW_CHARGES, priceCap: 14.98,
            nmiPrefixes: ['4102', '4103', '4104', '4001'],
            defaultTariff: 'EA025', defaultControlled: 'EA030',
            tariffs: {
                EA025: { name: 'Residential time of use', daily: 63.23, bands: [band(32.52, [w('15:00', '21:00', ALL, AUSGRID_SEASONS)])], rate: 5.36 },
                EA116: { name: 'Residential demand', daily: 67.01, rate: 2.81, demand: { rate: 39.49, window: w('15:00', '21:00', ALL, AUSGRID_SEASONS) } },
                EA111: { name: 'Residential demand (introductory)', daily: 57.29, rate: 11.80, demand: { rate: 1.46, window: w('15:00', '21:00', ALL, AUSGRID_SEASONS) } },
                EA010: { name: 'Residential flat (closed)', daily: 50.86, rate: 12.70 }
            },
            // Ausgrid's export tariff is mandatory; its 6.85 kWh/day free level is settled on the bill (see EXPORT_TARIFFS.EA029).
            exportTariffs: {
                EA029: { name: 'Export tariff (mandatory)', bands: [band(1.23, [w('10:00', '15:00')]), band(-3.86, [w('16:00', '21:00')])], settledOnBill: true }
            },
            defaultExport: 'EA029',
            controlled: {
                EA030: { name: 'Controlled load 1', daily: 4.04, rate: 2.97 },
                EA040: { name: 'Controlled load 2', daily: 7.59, rate: 5.62 }
            }
        },
        endeavour: {
            name: 'Endeavour Energy', state: 'NSW', region: 'NSW1', lossFactor: 1.05,
            metering: 38.53, charges: NSW_CHARGES, priceCap: 15.17,
            nmiPrefixes: ['4310', '4311', '4312'],
            defaultTariff: 'N71', defaultControlled: 'N50',
            tariffs: {
                N71: { name: 'Residential time of use', daily: 70.19, bands: [band(23.45, [w('16:00', '20:00', WD, SUMMER_NOV_MAR)]), band(15.20, [w('16:00', '20:00', WD, NOT_NOV_MAR)]), band(4.54, [w('10:00', '14:00')])], rate: 11.73 },
                N72: { name: 'Residential demand', daily: 70.19, bands: [band(4.54, [w('10:00', '14:00')])], rate: 10.15, demand: { rate: 12.98, byMonth: perMonth(SUMMER_NOV_MAR, 18.18, 9.27), window: w('16:00', '20:00', WD) } },
                N73: { name: 'Residential demand (transitional)', daily: 70.19, bands: [band(4.54, [w('10:00', '14:00')])], rate: 10.91, demand: { rate: 11.68, byMonth: perMonth(SUMMER_NOV_MAR, 16.36, 8.34), window: w('16:00', '20:00', WD) } },
                N70: { name: 'Residential flat', daily: 70.19, rate: 12.03 }
            },
            exportTariffs: {
                N61: { name: 'Prosumer (two-way, opt-in)', bands: [band(-11.71, [w('16:00', '20:00', WD, SUMMER_NOV_MAR)]), band(-3.47, [w('16:00', '20:00', WD, NOT_NOV_MAR)]), band(1.86, [w('10:00', '14:00')])], freeKwhPerDay: 8 }
            },
            controlled: {
                N50: { name: 'Controlled load 1', daily: 11.87, rate: 4.82 },
                N54: { name: 'Controlled load 2', daily: 11.87, rate: 7.38 }
            }
        },
        essential: {
            name: 'Essential Energy', state: 'NSW', region: 'NSW1', lossFactor: 1.06,
            metering: 37.42, charges: NSW_CHARGES, priceCap: 14.97,
            nmiPrefixes: ['4204', '4407', '4508'],
            defaultTariff: 'BLNRSS2', defaultControlled: 'BLNC1AU',
            tariffs: {
                BLNRSS2: { name: 'Residential time of use (Sun Soaker)', daily: 147.04, bands: [band(17.96, [w('07:00', '10:00'), w('15:00', '22:00')])], rate: 6.33 },
                // Monthly kVA demand (519.25 c/kVA/month), taken as kW and spread over weekdays.
                BLND1AR: { name: 'Residential time of use demand', daily: 147.04, bands: [band(10.84, [w('17:00', '20:00', WD)]), band(7.37, [w('07:00', '17:00', WD), w('20:00', '22:00', WD)])], rate: 4.38, demand: { rate: 23.88, monthly: 519.25, window: w('17:00', '20:00', WD) } },
                BLNN2AU: { name: 'Residential anytime (closed)', daily: 147.04, rate: 14.55 }
            },
            exportTariffs: {
                BLNREX2: { name: 'Solar export (two-way)', bands: [band(-11.72, [w('17:00', '20:00')]), band(0.83, [w('10:00', '15:00')])], freeKwhPerDay: 7.5 }
            },
            controlled: {
                BLNC1AU: { name: 'Controlled load 1', daily: 13.38, rate: 3.50 },
                BLNC2AU: { name: 'Controlled load 2', daily: 13.38, rate: 7.00 }
            }
        },
        evoenergy: {
            name: 'Evoenergy', state: 'ACT', region: 'NSW1', lossFactor: 1.04,
            metering: 39.55, charges: { environmental: 0.98, market: 0.96, hedging: 1.00, greenPower: 0.73 }, priceCap: 15.10,
            nmiPrefixes: ['7001', '7102'],
            defaultTariff: '017', defaultControlled: '060',
            tariffs: {
                '017': { name: 'New residential time of use', daily: 57.69, bands: [band(19.08, [w('07:00', '09:00'), w('17:00', '21:00')]), band(4.81, [w('11:00', '15:00')])], rate: 7.39 },
                // The 9pm–9am off-peak demand charge (2.08 c/kW/day) is not modelled.
                '023': { name: 'New residential demand', daily: 57.75, bands: [band(4.67, [w('11:00', '15:00')])], rate: 6.57, demand: { rate: 15.26, byMonth: perMonth([6, 7, 8], 21.81, 13.08), window: w('17:00', '21:00') } },
                '025': { name: 'Residential demand (closed)', daily: 57.75, rate: 6.37, demand: { rate: 18.88, window: w('17:00', '20:00') } },
                '015': { name: 'Residential time of use (closed)', daily: 57.69, bands: [band(18.91, [w('07:00', '09:00'), w('17:00', '20:00')]), band(10.07, [w('09:00', '17:00'), w('20:00', '22:00')])], rate: 6.48 },
                '010': { name: 'Residential basic (closed)', daily: 57.69, rate: 11.78 }
            },
            exportTariffs: {},
            controlled: {
                '060': { name: 'Off-peak night', daily: 0, rate: 5.41 },
                '070': { name: 'Off-peak day and night', daily: 0, rate: 6.20 }
            }
        },
        energex: {
            name: 'Energex', state: 'QLD', region: 'QLD1', lossFactor: 1.05,
            metering: 34.26, charges: { environmental: 0.58, market: 0.98, hedging: 1.00, greenPower: 0.73 }, priceCap: 14.68,
            nmiPrefixes: ['3114', '3115', '3116', '3117', 'QB'],
            defaultTariff: '6900', defaultControlled: '9000',
            tariffs: {
                6900: { name: 'Residential time of use', daily: 77.40, bands: [band(19.53, [w('16:00', '21:00')]), band(0.43, [w('11:00', '16:00')])], rate: 6.07 },
                // 700 c/kW/month, spread over the days of the month.
                3900: { name: 'Residential time of use demand', daily: 57.40, bands: [band(2.53, [w('16:00', '21:00')]), band(0.43, [w('11:00', '16:00')])], rate: 6.07, demand: { rate: 23.01, monthly: 700, window: w('16:00', '21:00') } },
                8400: { name: 'Residential flat', daily: 99.40, rate: 9.39 },
                96200: {
                    name: 'Residential two-way (trial)', daily: 65.10,
                    bands: [band(19.53, [w('17:00', '20:00', ALL, SUMMER_NOV_MAR)]), band(0.43, [w('09:00', '15:00')])], rate: 6.07,
                    export: { bands: [band(-12.20, [w('17:00', '20:00', ALL, SUMMER_NOV_MAR)]), band(2.21, [w('11:00', '13:00', ALL, NOT_NOV_MAR)])] }
                }
            },
            exportTariffs: {},
            controlled: {
                9000: { name: 'Controlled load 1 (super economy)', daily: 0, rate: 2.68 },
                9100: { name: 'Controlled load 2 (economy)', daily: 0, rate: 2.68 }
            }
        },
        sapn: {
            name: 'SA Power Networks', state: 'SA', region: 'SA1', lossFactor: 1.07,
            metering: 39.77, charges: { environmental: 0.88, market: 2.02, hedging: 1.00, greenPower: 0.73 }, priceCap: 19.73,
            nmiPrefixes: ['2001', '2002'],
            defaultTariff: 'RTOU', defaultControlled: 'CL',
            tariffs: {
                RTOU: {
                    name: 'Residential time of use', daily: 65.53,
                    bands: [band(21.33, [w('06:00', '10:00'), w('16:00', '24:00')]), band(5.35, [w('10:00', '16:00')])], rate: 10.67,
                    controlled: { bands: [band(21.33, [w('06:30', '09:30'), w('16:30', '23:30')]), band(5.35, [w('09:30', '16:30')])], rate: 10.67 },
                    export: { bands: [band(1.00, [w('10:00', '16:00')])], freeKwhPerDay: 9 }
                },
                RESELE: {
                    name: 'Residential Electrify', daily: 65.53,
                    bands: [band(36.01, [w('17:00', '21:00')]), band(3.21, [w('10:00', '16:00')])], rate: 10.68,
                    controlled: { bands: [band(21.33, [w('06:30', '09:30'), w('16:30', '23:30')]), band(5.35, [w('09:30', '16:30')])], rate: 10.67 },
                    export: { bands: [band(-13.22, [w('17:00', '21:00', ALL, SUMMER_NOV_MAR)]), band(1.00, [w('10:00', '16:00')])], freeKwhPerDay: 9 }
                },
                RSR: {
                    name: 'Residential single rate', daily: 65.53, rate: 16.34,
                    controlled: { rate: 8.17 },
                    export: { bands: [band(0.75, [w('00:00', '24:00')])], freeKwhPerDay: 11 }
                }
            },
            exportTariffs: {},
            controlled: {
                CL: { name: 'Controlled load (rates set by the import tariff)', daily: 0, rate: 8.17 }
            }
        },
        citipower: {
            name: 'CitiPower', state: 'VIC', region: 'VIC1', lossFactor: 1.04,
            metering: 15.20, charges: VIC_CHARGES, priceCap: 13.26,
            nmiPrefixes: ['6102'],
            defaultTariff: 'CRSTOU', defaultControlled: 'CDS',
            tariffs: {
                CRSTOU: vicTou(31.51, 19.76, 4.95),
                CRCER: vicCer(31.51, 27.81, 19.33, 3.27),
                C1R: { name: 'Residential single rate', daily: 31.51, rate: 9.09 }
            },
            exportTariffs: {},
            controlled: { CDS: { name: 'Dedicated circuit', daily: 0, rate: 1.00 } }
        },
        powercor: {
            name: 'Powercor', state: 'VIC', region: 'VIC1', lossFactor: 1.06,
            metering: 17.47, charges: VIC_CHARGES, priceCap: 13.61,
            nmiPrefixes: ['6203'],
            defaultTariff: 'PRSTOU', defaultControlled: 'DD1',
            tariffs: {
                PRSTOU: vicTou(43.84, 22.09, 5.52),
                PRCER: vicCer(43.84, 27.86, 20.80, 4.20),
                D1: { name: 'Residential single rate', daily: 43.84, rate: 10.47 }
            },
            exportTariffs: {},
            controlled: { DD1: { name: 'Dedicated circuit', daily: 0, rate: 1.00 } }
        },
        jemena: {
            name: 'Jemena', state: 'VIC', region: 'VIC1', lossFactor: 1.04,
            metering: 18.97, charges: VIC_CHARGES, priceCap: 13.46,
            nmiPrefixes: ['6001'],
            defaultTariff: 'A100', defaultControlled: 'A180',
            tariffs: {
                A100: { name: 'Residential single rate', daily: 33.09, rate: 9.49 },
                A130: vicTou(33.08, 18.21, 4.55, 'Residential Daytime Saver'),
                A10E: Object.assign(vicTou(33.15, 18.21, 4.55, 'Residential export (two-way)'), {
                    export: { bands: [band(-15.00, [w('16:00', '21:00')]), band(3.00, [w('11:00', '16:00')])], freeKwhPerDay: 1 }
                })
            },
            exportTariffs: {},
            controlled: { A180: { name: 'Off-peak heating', daily: 0, rate: 4.25 } }
        },
        'united energy': {
            name: 'United Energy', state: 'VIC', region: 'VIC1', lossFactor: 1.05,
            metering: 13.61, charges: VIC_CHARGES, priceCap: 13.34,
            nmiPrefixes: ['6407'],
            defaultTariff: 'URSTOU', defaultControlled: 'LVDED',
            tariffs: {
                URSTOU: vicTou(31.51, 20.92, 5.22),
                URCER: vicCer(31.51, 26.24, 20.10, 4.08),
                LVS1R: { name: 'Residential single rate', daily: 31.51, rate: 9.72 }
            },
            exportTariffs: {},
            controlled: { LVDED: { name: 'Dedicated circuit', daily: 0, rate: 1.00 } }
        },
        ausnet: {
            name: 'AusNet Services', state: 'VIC', region: 'VIC1', lossFactor: 1.06,
            metering: 13.98, charges: VIC_CHARGES, priceCap: 13.73,
            nmiPrefixes: ['6305', '6306'],
            defaultTariff: 'NASS11', defaultControlled: 'NEE30',
            tariffs: {
                NASS11: vicTou(39.81, 26.96, 5.33),
                RCER11: Object.assign(vicTou(39.81, 26.96, 5.33, 'Residential CER (two-way)'), {
                    export: { bands: [band(-10.00, [w('16:00', '21:00')]), band(1.00, [w('11:00', '16:00')])], freeKwhPerDay: 1 }
                }),
                NEE24: { name: 'Residential two-rate', daily: 39.81, bands: [band(12.05, [w('08:00', '20:00', WD)])], rate: 4.68 },
                NEE11: { name: 'Residential single rate', daily: 39.81, rate: 13.43 }
            },
            exportTariffs: {},
            controlled: { NEE30: { name: 'Dedicated circuit', daily: 0, rate: 4.90 } }
        }
    };

    // Amber's subscription (c/day inc GST): $25 a month.
    Amber.AMBER_SUBSCRIPTION_CENTS = 82.181;
    Amber.NETWORKS_AS_AT = '2026-07-01';

    Amber.networkInfo = function (nameOrKey) {
        if (!nameOrKey) return null;
        if (Amber.NETWORKS[nameOrKey]) return Object.assign({ key: nameOrKey }, Amber.NETWORKS[nameOrKey]);
        const key = Amber.canonicalNetwork(nameOrKey);
        return key && Amber.NETWORKS[key] ? Object.assign({ key }, Amber.NETWORKS[key]) : null;
    };

    /** Network key from an NMI's first characters, or null. */
    Amber.networkForNmi = function (nmi) {
        const n = String(nmi || '').toUpperCase();
        let best = null;
        Object.keys(Amber.NETWORKS).forEach((key) => {
            (Amber.NETWORKS[key].nmiPrefixes || []).forEach((p) => {
                if (n.startsWith(p) && (!best || p.length > best.len)) best = { key, len: p.length };
            });
        });
        return best ? best.key : null;
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
