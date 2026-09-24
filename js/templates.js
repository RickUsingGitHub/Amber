(function (root) {
    const Amber = root.Amber = root.Amber || {};

    const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
    const WEEKDAYS = [1, 2, 3, 4, 5];
    const AS_AT = '2026-07-01';

    // Consumption, daily, demand and controlled-load figures are GST-inclusive (inc GST).
    // Feed-in is the published c/kWh (household FIT is typically GST-free).
    Amber.supplierTemplates = {
        ACT: {
            'ActewAGL Home (standing)': {
                rateType: 'flat', daily: 134.20, flat: 36.9536, feedIn: 4.4, cl: 18.65,
                demand: { e: false }, asAt: AS_AT
            },
            'ActewAGL Home Time-of-use (standing)': {
                rateType: 'tou', daily: 134.20, feedIn: 4.4, cl: 18.65, clock: 'nem',
                tou: {
                    peak: {
                        rate: 49.72,
                        windows: [
                            { start: '07:00', end: '09:00', days: ALL_DAYS },
                            { start: '17:00', end: '20:00', days: ALL_DAYS }
                        ]
                    },
                    shoulder: {
                        rate: 33.5661,
                        windows: [
                            { start: '09:00', end: '17:00', days: ALL_DAYS },
                            { start: '20:00', end: '22:00', days: ALL_DAYS }
                        ]
                    },
                    offpeak: { rate: 29.92 }
                },
                demand: { e: false }, asAt: AS_AT
            }
        },
        NSW: {
            '2026-27 DMO (Ausgrid)': {
                rateType: 'flat', daily: 166.00, flat: 33.14, feedIn: 5.0, cl: 19.31,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO TOU (Ausgrid)': {
                rateType: 'tou', daily: 176.00, feedIn: 5.0, cl: 19.31, clock: 'local',
                tou: {
                    peak: { rate: 60.20, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 24.04 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Endeavour)': {
                rateType: 'flat', daily: 185.00, flat: 33.73, feedIn: 5.0, cl: 20.64,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Essential Energy)': {
                rateType: 'flat', daily: 244.10, flat: 34.52, feedIn: 5.0, cl: 20.64,
                demand: { e: false }, asAt: AS_AT
            },
            'AGL Standing Offer (Ausgrid)': {
                rateType: 'flat', daily: 166.19, flat: 33.14, feedIn: 5.0, cl: 19.31,
                demand: { e: false }, asAt: AS_AT
            },
            'Origin Go Variable (Ausgrid)': {
                rateType: 'flat', daily: 149.59, flat: 29.82, feedIn: 5.0, cl: 18.0,
                demand: { e: false }, asAt: AS_AT
            },
            'Origin Standing (Ausgrid)': {
                rateType: 'flat', daily: 166.21, flat: 33.14, feedIn: 3.0, cl: 19.31,
                demand: { e: false }, asAt: AS_AT
            },
            'EnergyAustralia Flexi Plan (Ausgrid)': {
                rateType: 'tou', daily: 176.41, feedIn: 3.0, cl: 18.77, clock: 'local',
                tou: {
                    peak: { rate: 59.10, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: {
                        rate: 29.30,
                        windows: [
                            { start: '07:00', end: '14:00', days: WEEKDAYS },
                            { start: '20:00', end: '22:00', days: WEEKDAYS }
                        ]
                    },
                    offpeak: { rate: 25.03 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'Red Energy Standing Offer (Ausgrid)': {
                rateType: 'flat', daily: 166.22, flat: 33.14, feedIn: 6.0, cl: 19.31,
                demand: { e: false }, asAt: AS_AT
            },
            'Red Energy Living Energy Saver (Ausgrid)': {
                rateType: 'flat', daily: 122.5, flat: 28.0, feedIn: 2.5, cl: 15.75,
                demand: { e: false }, asAt: '2026-09-08'
            }
        },
        NT: {
            'Jacana Energy Standard Residential': {
                rateType: 'flat', daily: 62.45, flat: 31.6788, feedIn: 8.86, cl: 18.9,
                demand: { e: false }, asAt: AS_AT
            },
            'Jacana Energy Time of Use': {
                rateType: 'tou', daily: 62.45, feedIn: 8.86, cl: 18.9, clock: 'local',
                tou: {
                    shoulder: { rate: 25.8294, windows: [{ start: '09:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 33.2165 }
                },
                demand: { e: false }, asAt: AS_AT
            }
        },
        QLD: {
            '2026-27 DMO (Energex)': {
                rateType: 'flat', daily: 192.00, flat: 27.97, feedIn: 5.0, cl: 19.0,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO TOU (Energex)': {
                rateType: 'tou', daily: 178.00, feedIn: 5.0, cl: 19.0, clock: 'local',
                tou: {
                    peak: { rate: 47.79, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 6.98, windows: [{ start: '11:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 25.30 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'EnergyAustralia Flexi Plan (Energex)': {
                rateType: 'flat', daily: 192.01, flat: 27.97, feedIn: 4.8, cl: 19.1,
                demand: { e: false }, asAt: AS_AT
            }
        },
        SA: {
            'EnergyAustralia Flexi Plan': {
                rateType: 'flat', daily: 136.4, flat: 36.82, feedIn: 5.5, cl: 23.0,
                demand: { e: false }, asAt: AS_AT
            },
            'EnergyAustralia Total Plan': {
                rateType: 'tou', daily: 152.46, feedIn: 5.7, cl: 23.2, clock: 'local',
                tou: {
                    peak: { rate: 63.11, windows: [{ start: '18:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: { rate: 42.53, windows: [{ start: '07:00', end: '18:00', days: WEEKDAYS }] },
                    offpeak: { rate: 31.71 }
                },
                demand: { e: true, r: 42.21, s: '18:00', f: '21:00', days: WEEKDAYS },
                asAt: AS_AT
            }
        },
        TAS: {
            'Aurora Peak and Off-Peak (Tariff 93)': {
                rateType: 'tou', daily: 172.3469, feedIn: 9.276, cl: 14.02, clock: 'nem',
                tou: {
                    peak: {
                        rate: 36.1878,
                        windows: [
                            { start: '07:00', end: '10:00', days: WEEKDAYS },
                            { start: '16:00', end: '21:00', days: WEEKDAYS }
                        ]
                    },
                    offpeak: { rate: 17.02 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'Aurora Single Rate (Tariff 32)': {
                rateType: 'flat', daily: 182.00, flat: 24.75, feedIn: 9.276, cl: 14.02,
                demand: { e: false }, asAt: AS_AT
            },
            'Aurora Lights and Power (Tariff 31)': {
                rateType: 'flat', daily: 167.6815, flat: 27.9538, feedIn: 9.276, cl: 21.1193,
                demand: { e: false }, asAt: AS_AT
            }
        },
        VIC: {
            '2026-27 VDO (AusNet Services)': {
                rateType: 'flat', daily: 128.24, flat: 31.98, feedIn: 4.9, cl: 22.11,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO TOU (AusNet Services)': {
                rateType: 'tou', daily: 128.24, feedIn: 4.9, cl: 22.11, clock: 'local',
                tou: {
                    peak: { rate: 47.64, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 17.59, windows: [{ start: '11:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.60 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (CitiPower)': {
                rateType: 'flat', daily: 121.14, flat: 25.96, feedIn: 4.9, cl: 16.59,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO TOU (CitiPower)': {
                rateType: 'tou', daily: 121.14, feedIn: 4.9, cl: 16.59, clock: 'local',
                tou: {
                    peak: { rate: 38.31, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.17 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Jemena)': {
                rateType: 'flat', daily: 127.13, flat: 27.47, feedIn: 4.9, cl: 21.41,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO TOU (Jemena)': {
                rateType: 'tou', daily: 127.13, feedIn: 4.9, cl: 21.41, clock: 'local',
                tou: {
                    peak: { rate: 37.57, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.76 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Powercor)': {
                rateType: 'flat', daily: 138.05, flat: 28.22, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO TOU (Powercor)': {
                rateType: 'tou', daily: 138.05, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 41.67, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.49 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (United Energy)': {
                rateType: 'flat', daily: 119.12, flat: 27.35, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO TOU (United Energy)': {
                rateType: 'tou', daily: 119.12, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 40.32, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.14 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'OVO The One Plan (CitiPower)': {
                rateType: 'flat', daily: 99.33, flat: 21.29, feedIn: 4.9, cl: 16.59,
                demand: { e: false }, asAt: '2026-08-31'
            }
        },
        WA: {
            'Synergy Home Plan (A1)': {
                rateType: 'flat', daily: 119.2419, flat: 33.2621, feedIn: 2.0, cl: 0,
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                clock: 'local',
                demand: { e: false }, asAt: AS_AT
            },
            'Synergy Midday Saver': {
                rateType: 'tou', daily: 132.7806, feedIn: 2.0, cl: 0, clock: 'local',
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                tou: {
                    peak: { rate: 55.3253, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 8.8520, windows: [{ start: '09:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 24.3431 }
                },
                demand: { e: false }, asAt: AS_AT
            }
        }
    };

    Amber.cloneTemplates = function () {
        return JSON.parse(JSON.stringify(Amber.supplierTemplates));
    };

    Amber.templateAsAt = function (plan) {
        if (plan && plan.asAt) return plan.asAt;
        return Amber.TEMPLATES_AS_AT;
    };

    Amber.latestAsAtForState = function (state, templates) {
        const source = templates || Amber.supplierTemplates;
        const plans = source[state] || {};
        let latest = Amber.TEMPLATES_AS_AT;
        Object.keys(plans).forEach((name) => {
            const asAt = plans[name].asAt;
            if (asAt && asAt > latest) latest = asAt;
        });
        return latest;
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
