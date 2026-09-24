(function (root) {
    const Amber = root.Amber = root.Amber || {};

    const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
    const WEEKDAYS = [1, 2, 3, 4, 5];
    const AS_AT = '2026-07-01';
    const MARKET = '2026-09-23';

    // Consumption, daily, demand and controlled-load figures are GST-inclusive (inc GST).
    // Feed-in is the published c/kWh (household FIT is typically GST-free).
    // DMO/VDO: AER / ESC 2026-27, locked 1 July 2026 – 30 June 2027.
    // Market offers: Energy Made Easy / CDR current as at MARKET.
    Amber.supplierTemplates = {
        ACT: {
            'ActewAGL Home (Flat)': {
                rateType: 'flat', daily: 122.00, flat: 33.59, feedIn: 4.4, cl: 18.65,
                demand: { e: false }, asAt: MARKET
            },
            'ActewAGL Home (TOU)': {
                rateType: 'tou', daily: 122.00, feedIn: 4.4, cl: 18.65, clock: 'local',
                tou: {
                    peak: {
                        rate: 45.20,
                        windows: [
                            { start: '07:00', end: '09:00', days: ALL_DAYS },
                            { start: '17:00', end: '20:00', days: ALL_DAYS }
                        ]
                    },
                    offpeak: { rate: 27.20 }
                },
                demand: { e: false }, asAt: MARKET
            }
        },
        NSW: {
            '2026-27 DMO (Ausgrid, Flat)': {
                rateType: 'flat', daily: 166.00, flat: 33.14, feedIn: 5.0, cl: 19.31,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Ausgrid, TOU)': {
                rateType: 'tou', daily: 176.00, feedIn: 5.0, cl: 19.31, clock: 'local',
                tou: {
                    peak: { rate: 60.20, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 24.04 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Endeavour, Flat)': {
                rateType: 'flat', daily: 185.00, flat: 33.73, feedIn: 5.0, cl: 20.64,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Endeavour, TOU)': {
                rateType: 'tou', daily: 185.00, feedIn: 5.0, cl: 20.64, clock: 'local',
                tou: {
                    peak: { rate: 46.57, windows: [{ start: '16:00', end: '20:00', days: ALL_DAYS }] },
                    shoulder: {
                        rate: 35.69,
                        windows: [
                            { start: '20:00', end: '10:00', days: ALL_DAYS },
                            { start: '14:00', end: '16:00', days: ALL_DAYS }
                        ]
                    },
                    offpeak: { rate: 12.35 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Essential Energy, Flat)': {
                rateType: 'flat', daily: 272.00, flat: 35.01, feedIn: 5.0, cl: 20.64,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Essential Energy, TOU)': {
                rateType: 'tou', daily: 272.00, feedIn: 5.0, cl: 20.64, clock: 'local',
                tou: {
                    peak: {
                        rate: 42.12,
                        windows: [
                            { start: '07:00', end: '10:00', days: ALL_DAYS },
                            { start: '15:00', end: '22:00', days: ALL_DAYS }
                        ]
                    },
                    offpeak: { rate: 24.15 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'Origin Go Variable (Ausgrid, Flat)': {
                rateType: 'flat', daily: 135.99, flat: 27.11, feedIn: 3.0, cl: 15.78,
                demand: { e: false }, asAt: '2026-09-13'
            },
            'Origin Go Variable (Ausgrid, TOU)': {
                rateType: 'tou', daily: 144.27, feedIn: 3.0, cl: 15.78, clock: 'local',
                tou: {
                    peak: { rate: 49.20, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 19.67 }
                },
                demand: { e: false }, asAt: '2026-09-13'
            },
            'EnergyAustralia Flexi Plan (Ausgrid, Flat)': {
                rateType: 'flat', daily: 151.12, flat: 30.12, feedIn: 3.0, cl: 17.55,
                demand: { e: false }, asAt: '2026-09-14'
            },
            'EnergyAustralia Flexi Plan (Ausgrid, TOU)': {
                rateType: 'tou', daily: 160.37, feedIn: 3.0, cl: 17.55, clock: 'local',
                tou: {
                    peak: { rate: 53.73, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: {
                        rate: 26.64,
                        windows: [
                            { start: '07:00', end: '14:00', days: WEEKDAYS },
                            { start: '20:00', end: '22:00', days: WEEKDAYS },
                            { start: '07:00', end: '22:00', days: [6, 0] }
                        ]
                    },
                    offpeak: { rate: 22.76 }
                },
                demand: { e: false }, asAt: '2026-09-14'
            },
            'Red Energy Living Energy Saver (Ausgrid, Flat)': {
                rateType: 'flat', daily: 122.50, flat: 28.00, feedIn: 2.5, cl: 15.75,
                demand: { e: false }, asAt: '2026-09-08'
            },
            'Red Energy Living Energy Saver (Ausgrid, TOU)': {
                rateType: 'tou', daily: 116.50, feedIn: 2.5, cl: 15.75, clock: 'nem',
                tou: {
                    peak: { rate: 44.00, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: {
                        rate: 30.51,
                        windows: [
                            { start: '07:00', end: '14:00', days: WEEKDAYS },
                            { start: '20:00', end: '22:00', days: WEEKDAYS },
                            { start: '07:00', end: '22:00', days: [6, 0] }
                        ]
                    },
                    offpeak: { rate: 22.51 }
                },
                demand: { e: false }, asAt: '2026-09-08'
            },
            'Red Energy Living Energy Saver (Endeavour, Flat)': {
                rateType: 'flat', daily: 140.73, flat: 29.46, feedIn: 2.5, cl: 18.20,
                demand: { e: false }, asAt: '2026-09-08'
            },
            'Red Energy Living Energy Saver (Endeavour, TOU)': {
                rateType: 'tou', daily: 117.30, feedIn: 2.5, cl: 18.20, clock: 'nem',
                tou: {
                    peak: { rate: 38.80, windows: [{ start: '13:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: {
                        rate: 29.82,
                        windows: [
                            { start: '07:00', end: '13:00', days: WEEKDAYS },
                            { start: '20:00', end: '22:00', days: WEEKDAYS },
                            { start: '07:00', end: '22:00', days: [6, 0] }
                        ]
                    },
                    offpeak: { rate: 25.50 }
                },
                demand: { e: false }, asAt: '2026-09-08'
            },
            'OVO The One Plan (Ausgrid, Flat)': {
                rateType: 'flat', daily: 120.87, flat: 26.81, feedIn: 3.0, cl: 17.55,
                demand: { e: false }, asAt: MARKET
            },
            'OVO The One Plan (Ausgrid, TOU)': {
                rateType: 'tou', daily: 128.23, feedIn: 3.0, cl: 17.55, clock: 'local',
                tou: {
                    peak: { rate: 48.70, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 19.44 }
                },
                demand: { e: false }, asAt: MARKET
            }
        },
        NT: {
            'Jacana Energy (Flat)': {
                rateType: 'flat', daily: 62.45, flat: 31.6788, feedIn: 8.86, cl: 18.9,
                demand: { e: false }, asAt: AS_AT
            },
            'Jacana Energy (TOU)': {
                rateType: 'tou', daily: 62.45, feedIn: 8.86, cl: 18.9, clock: 'local',
                tou: {
                    shoulder: { rate: 25.8294, windows: [{ start: '09:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 33.2165 }
                },
                demand: { e: false }, asAt: AS_AT
            }
        },
        QLD: {
            '2026-27 DMO (Energex, Flat)': {
                rateType: 'flat', daily: 192.00, flat: 27.97, feedIn: 5.0, cl: 19.0,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (Energex, TOU)': {
                rateType: 'tou', daily: 178.00, feedIn: 5.0, cl: 19.0, clock: 'local',
                tou: {
                    peak: { rate: 47.79, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 6.98, windows: [{ start: '11:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 25.30 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'EnergyAustralia Flexi Plan (Energex, Flat)': {
                rateType: 'flat', daily: 174.56, flat: 25.43, feedIn: 4.0, cl: 14.94,
                demand: { e: false }, asAt: '2026-09-13'
            },
            'Origin Go Variable (Energex, Flat)': {
                rateType: 'flat', daily: 167.58, flat: 24.41, feedIn: 3.0, cl: 14.31,
                demand: { e: false }, asAt: '2026-09-13'
            },
            'Origin Go Variable (Energex, TOU)': {
                rateType: 'tou', daily: 155.19, feedIn: 3.0, cl: 14.31, clock: 'local',
                tou: {
                    peak: { rate: 41.70, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 22.08, windows: [{ start: '21:00', end: '11:00', days: ALL_DAYS }] },
                    offpeak: { rate: 6.10 }
                },
                demand: { e: false }, asAt: '2026-09-13'
            },
            'OVO The One Plan (Energex, Flat)': {
                rateType: 'flat', daily: 137.90, flat: 24.66, feedIn: 2.0, cl: 14.93,
                demand: { e: false }, asAt: MARKET
            },
            'OVO The One Plan (Energex, TOU)': {
                rateType: 'tou', daily: 127.73, feedIn: 2.0, cl: 14.93, clock: 'local',
                tou: {
                    peak: { rate: 42.13, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: {
                        rate: 22.30,
                        windows: [
                            { start: '00:00', end: '11:00', days: ALL_DAYS },
                            { start: '21:00', end: '24:00', days: ALL_DAYS }
                        ]
                    },
                    offpeak: { rate: 6.15 }
                },
                demand: { e: false }, asAt: MARKET
            }
        },
        SA: {
            '2026-27 DMO (SA Power Networks, Flat)': {
                rateType: 'flat', daily: 180.00, flat: 41.91, feedIn: 5.0, cl: 23.0,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 DMO (SA Power Networks, TOU)': {
                rateType: 'tou', daily: 180.00, feedIn: 5.0, cl: 23.0, clock: 'local',
                tou: {
                    peak: {
                        rate: 56.22,
                        windows: [
                            { start: '06:00', end: '10:00', days: ALL_DAYS },
                            { start: '16:00', end: '24:00', days: ALL_DAYS }
                        ]
                    },
                    shoulder: { rate: 17.04, windows: [{ start: '10:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 32.55 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'EnergyAustralia Flexi Plan (SA Power Networks, Flat)': {
                rateType: 'flat', daily: 163.68, flat: 38.10, feedIn: 3.0, cl: 20.22,
                demand: { e: false }, asAt: '2026-09-14'
            },
            'EnergyAustralia Flexi Plan (SA Power Networks, TOU)': {
                rateType: 'tou', daily: 163.68, feedIn: 3.0, cl: 20.22, clock: 'local',
                tou: {
                    peak: {
                        rate: 51.11,
                        windows: [
                            { start: '06:00', end: '10:00', days: ALL_DAYS },
                            { start: '16:00', end: '24:00', days: ALL_DAYS }
                        ]
                    },
                    shoulder: { rate: 15.49, windows: [{ start: '10:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 29.59 }
                },
                demand: { e: false }, asAt: '2026-09-14'
            },
            'Origin Go Variable (SA Power Networks, Flat)': {
                rateType: 'flat', daily: 155.50, flat: 36.20, feedIn: 4.4, cl: 19.16,
                demand: { e: false }, asAt: '2026-09-13'
            },
            'Origin Go Variable (SA Power Networks, TOU)': {
                rateType: 'tou', daily: 155.50, feedIn: 4.4, cl: 19.16, clock: 'local',
                tou: {
                    peak: {
                        rate: 48.55,
                        windows: [
                            { start: '06:00', end: '10:00', days: ALL_DAYS },
                            { start: '16:00', end: '24:00', days: ALL_DAYS }
                        ]
                    },
                    shoulder: { rate: 14.72, windows: [{ start: '10:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 28.11 }
                },
                demand: { e: false }, asAt: '2026-09-13'
            },
            'Red Energy Living Energy Saver (SA Power Networks, Flat)': {
                rateType: 'flat', daily: 110.00, flat: 37.90, feedIn: 2.0, cl: 20.23,
                demand: { e: false }, asAt: AS_AT
            },
            'Red Energy Living Energy Saver (SA Power Networks, TOU)': {
                rateType: 'tou', daily: 108.50, feedIn: 2.0, cl: 20.23, clock: 'local',
                tou: {
                    peak: {
                        rate: 48.00,
                        windows: [
                            { start: '06:00', end: '10:00', days: ALL_DAYS },
                            { start: '15:00', end: '01:00', days: ALL_DAYS }
                        ]
                    },
                    shoulder: { rate: 20.98, windows: [{ start: '10:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 26.62 }
                },
                demand: { e: false }, asAt: AS_AT
            }
        },
        TAS: {
            'Aurora Peak and Off-Peak (Tariff 93, TOU)': {
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
            'Aurora Single Rate (Tariff 32, Flat)': {
                rateType: 'flat', daily: 182.00, flat: 24.75, feedIn: 9.276, cl: 14.02,
                demand: { e: false }, asAt: AS_AT
            },
            'Aurora Lights and Power (Tariff 31, Flat)': {
                rateType: 'flat', daily: 167.6815, flat: 27.9538, feedIn: 9.276, cl: 21.1193,
                demand: { e: false }, asAt: AS_AT
            }
        },
        VIC: {
            '2026-27 VDO (AusNet Services, Flat)': {
                rateType: 'flat', daily: 128.24, flat: 31.98, feedIn: 4.9, cl: 22.11,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (AusNet Services, TOU)': {
                rateType: 'tou', daily: 128.24, feedIn: 4.9, cl: 22.11, clock: 'local',
                tou: {
                    peak: { rate: 47.64, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 17.59, windows: [{ start: '11:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.60 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (CitiPower, Flat)': {
                rateType: 'flat', daily: 121.14, flat: 25.96, feedIn: 4.9, cl: 16.59,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (CitiPower, TOU)': {
                rateType: 'tou', daily: 121.14, feedIn: 4.9, cl: 16.59, clock: 'local',
                tou: {
                    peak: { rate: 38.31, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.17 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Jemena, Flat)': {
                rateType: 'flat', daily: 127.13, flat: 27.47, feedIn: 4.9, cl: 21.41,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Jemena, TOU)': {
                rateType: 'tou', daily: 127.13, feedIn: 4.9, cl: 21.41, clock: 'local',
                tou: {
                    peak: { rate: 37.57, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.76 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Powercor, Flat)': {
                rateType: 'flat', daily: 138.05, flat: 28.22, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (Powercor, TOU)': {
                rateType: 'tou', daily: 138.05, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 41.67, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.49 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (United Energy, Flat)': {
                rateType: 'flat', daily: 119.12, flat: 27.35, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: AS_AT
            },
            '2026-27 VDO (United Energy, TOU)': {
                rateType: 'tou', daily: 119.12, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 40.32, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.14 }
                },
                demand: { e: false }, asAt: AS_AT
            },
            'OVO The One Plan (CitiPower, Flat)': {
                rateType: 'flat', daily: 90.30, flat: 19.35, feedIn: 1.0, cl: 12.36,
                demand: { e: false }, asAt: '2026-08-07'
            },
            'OVO The One Plan (CitiPower, TOU)': {
                rateType: 'tou', daily: 92.50, feedIn: 1.0, cl: 12.36, clock: 'local',
                tou: {
                    peak: { rate: 29.25, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 9.00, windows: [{ start: '11:00', end: '16:00', days: ALL_DAYS }] },
                    offpeak: { rate: 16.16 }
                },
                demand: { e: false }, asAt: '2026-08-07'
            },
            'Red Energy Living Energy Saver (CitiPower, Flat)': {
                rateType: 'flat', daily: 99.80, flat: 21.98, feedIn: 1.0, cl: 12.36,
                demand: { e: false }, asAt: MARKET
            }
        },
        WA: {
            'Synergy Home Plan A1 (Flat)': {
                rateType: 'flat', daily: 119.2419, flat: 33.2621, feedIn: 2.0, cl: 0,
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                clock: 'local',
                demand: { e: false }, asAt: AS_AT
            },
            'Synergy Midday Saver (TOU)': {
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
