(function (root) {
    const Amber = root.Amber = root.Amber || {};

    const ALL_DAYS = [1, 2, 3, 4, 5, 6, 0];
    const WEEKDAYS = [1, 2, 3, 4, 5];

    Amber.supplierTemplates = {
        ACT: {
            '2026 ActewAGL - Standard Home': {
                rateType: 'flat', daily: 206.17, flat: 41.00, feedIn: 7.5, cl: 18.15,
                demand: { e: false }, asAt: '2026-07-01'
            },
            'ActewAGL - Standard Home': {
                rateType: 'flat', daily: 196.35, flat: 39.04, feedIn: 8.0, cl: 17.28,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'ActewAGL - TOU': {
                rateType: 'tou', daily: 196.35, feedIn: 8.0, cl: 17.28, clock: 'local',
                tou: {
                    peak: { rate: 48.23, windows: [{ start: '17:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: { rate: 43.89, windows: [{ start: '07:00', end: '17:00', days: WEEKDAYS }] },
                    offpeak: { rate: 33.24 }
                },
                demand: { e: false }, asAt: '2025-07-01'
            }
        },
        NSW: {
            'Diamond Energy - TOU (Ausgrid T53)': {
                rateType: 'tou', daily: 132.0, feedIn: 3, cl: 17.93, clock: 'local',
                tou: {
                    peak: { rate: 55.61, windows: [{ start: '17:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: {
                        rate: 32.42,
                        windows: [
                            { start: '07:00', end: '17:00', days: WEEKDAYS },
                            { start: '21:00', end: '22:00', days: WEEKDAYS },
                            { start: '07:00', end: '22:00', days: [0, 6] }
                        ]
                    },
                    offpeak: { rate: 33.00 }
                },
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2025 AGL Standing Offer': {
                rateType: 'flat', daily: 108.97, flat: 40.18, feedIn: 5.0, cl: 19.51,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 EnergyAustralia - Total Plan': {
                rateType: 'tou', daily: 127.66, feedIn: 7.2, cl: 18.77, clock: 'local',
                tou: {
                    peak: { rate: 54.13, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: { rate: 28.60, windows: [{ start: '07:00', end: '14:00', days: WEEKDAYS }] },
                    offpeak: { rate: 21.37 }
                },
                demand: { e: true, r: 35.23, s: '17:00', f: '20:00', days: WEEKDAYS },
                asAt: '2026-07-01'
            },
            'EnergyAustralia - Total Plan': {
                rateType: 'tou', daily: 121.58, feedIn: 7.6, cl: 17.88, clock: 'local',
                tou: {
                    peak: { rate: 51.55, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: { rate: 27.24, windows: [{ start: '07:00', end: '14:00', days: WEEKDAYS }] },
                    offpeak: { rate: 20.35 }
                },
                demand: { e: true, r: 33.55, s: '17:00', f: '20:00', days: WEEKDAYS },
                asAt: '2025-07-01'
            },
            'EnergyAustralia - Solar Max': {
                rateType: 'flat', daily: 109.12, flat: 40.172, feedIn: 8, cl: 0,
                demand: { e: false, r: 0, s: '16:00', f: '21:00', days: [] },
                asAt: '2025-07-01'
            },
            'AGL - Standard': {
                rateType: 'flat', daily: 102.8, flat: 36.5, feedIn: 5.0, cl: 0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Origin - Go Variable': {
                rateType: 'tou', daily: 110.0, feedIn: 6.0, cl: 18.0, clock: 'local',
                tou: {
                    peak: { rate: 55.2, windows: [{ start: '14:00', end: '20:00', days: WEEKDAYS }] },
                    shoulder: { rate: 30.1, windows: [{ start: '07:00', end: '14:00', days: WEEKDAYS }] },
                    offpeak: { rate: 22.5 }
                },
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Red Energy - Living Energy Saver': {
                rateType: 'flat', daily: 105.0, flat: 34.2, feedIn: 6.0, cl: 16.5,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Alinta Energy - Homesaver': {
                rateType: 'flat', daily: 112.0, flat: 35.8, feedIn: 5.2, cl: 17.0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 Simply Energy (ENGIE) - Basic Saver': {
                rateType: 'flat', daily: 98.5, flat: 29.9, feedIn: 6.0, cl: 18.5,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026 Tango Energy - Everyday Easy': {
                rateType: 'flat', daily: 95.0, flat: 27.5, feedIn: 5.0, cl: 17.5,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026 OVO Energy - Simpler Plan': {
                rateType: 'flat', daily: 101.0, flat: 30.2, feedIn: 7.0, cl: 18.0,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026 Energy Locals - Predictable Plan': {
                rateType: 'flat', daily: 99.0, flat: 29.0, feedIn: 6.5, cl: 18.0,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026 ReAmped Energy - Easy Saver': {
                rateType: 'flat', daily: 97.0, flat: 28.5, feedIn: 5.5, cl: 17.8,
                demand: { e: false }, asAt: '2026-07-01'
            }
        },
        NT: {
            '2026 Jacana Energy - Standard': {
                rateType: 'flat', daily: 157.5, flat: 29.93, feedIn: 8.86, cl: 18.9,
                demand: { e: false }, asAt: '2026-07-01'
            },
            'Jacana Energy - Standard': {
                rateType: 'flat', daily: 150.0, flat: 28.5, feedIn: 9.33, cl: 18.0,
                demand: { e: false }, asAt: '2025-07-01'
            }
        },
        QLD: {
            '2025 Origin Go Variable': {
                rateType: 'flat', daily: 117.11, flat: 29.5, feedIn: 5.0, cl: 19.0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 EnergyAustralia - Basic Home': {
                rateType: 'tou', daily: 136.6, feedIn: 4.8, cl: 19.1, clock: 'local',
                tou: {
                    peak: { rate: 46.73, windows: [{ start: '16:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: { rate: 25.52, windows: [{ start: '07:00', end: '16:00', days: WEEKDAYS }] },
                    offpeak: { rate: 20.79 }
                },
                demand: { e: true, r: 36.86, s: '16:00', f: '21:00', days: WEEKDAYS },
                asAt: '2026-07-01'
            },
            'EnergyAustralia - Basic Home': {
                rateType: 'tou', daily: 130.1, feedIn: 5.0, cl: 18.2, clock: 'local',
                tou: {
                    peak: { rate: 44.5, windows: [{ start: '16:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: { rate: 24.3, windows: [{ start: '07:00', end: '16:00', days: WEEKDAYS }] },
                    offpeak: { rate: 19.8 }
                },
                demand: { e: true, r: 35.1, s: '16:00', f: '21:00', days: WEEKDAYS },
                asAt: '2025-07-01'
            },
            'AGL - Standard': {
                rateType: 'flat', daily: 125.6, flat: 28.9, feedIn: 5.0, cl: 0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Origin - Basic': {
                rateType: 'flat', daily: 128.0, flat: 29.5, feedIn: 5.0, cl: 19.0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Red Energy - QLD Saver': {
                rateType: 'flat', daily: 132.5, flat: 30.1, feedIn: 6.0, cl: 20.2,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 Tango Energy - Everyday Easy QLD': {
                rateType: 'flat', daily: 108.0, flat: 27.8, feedIn: 6.0, cl: 19.0,
                demand: { e: false }, asAt: '2026-07-01'
            }
        },
        SA: {
            '2025 Origin Standing Offer': {
                rateType: 'flat', daily: 140.0, flat: 43.5, feedIn: 6.0, cl: 23.0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 EnergyAustralia - Total Plan': {
                rateType: 'tou', daily: 152.46, feedIn: 5.7, cl: 23.2, clock: 'local',
                tou: {
                    peak: { rate: 63.11, windows: [{ start: '18:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: { rate: 42.53, windows: [{ start: '07:00', end: '18:00', days: WEEKDAYS }] },
                    offpeak: { rate: 31.71 }
                },
                demand: { e: true, r: 42.21, s: '18:00', f: '21:00', days: WEEKDAYS },
                asAt: '2026-07-01'
            },
            'EnergyAustralia - Total Plan': {
                rateType: 'tou', daily: 145.2, feedIn: 6.0, cl: 22.1, clock: 'local',
                tou: {
                    peak: { rate: 60.1, windows: [{ start: '18:00', end: '21:00', days: WEEKDAYS }] },
                    shoulder: { rate: 40.5, windows: [{ start: '07:00', end: '18:00', days: WEEKDAYS }] },
                    offpeak: { rate: 30.2 }
                },
                demand: { e: true, r: 40.2, s: '18:00', f: '21:00', days: WEEKDAYS },
                asAt: '2025-07-01'
            },
            'AGL - Standard': {
                rateType: 'flat', daily: 138.0, flat: 42.3, feedIn: 6.0, cl: 0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Origin - Value': {
                rateType: 'flat', daily: 140.0, flat: 43.5, feedIn: 7.0, cl: 23.0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Alinta - Homesaver SA': {
                rateType: 'flat', daily: 135.5, flat: 41.8, feedIn: 6.5, cl: 21.5,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 Tango Energy - Everyday Easy SA': {
                rateType: 'flat', daily: 138.0, flat: 41.5, feedIn: 5.5, cl: 21.0,
                demand: { e: false }, asAt: '2026-07-01'
            }
        },
        TAS: {
            '2026 Aurora Energy - Residential Peak and Off-Peak': {
                rateType: 'tou', daily: 172.3469, feedIn: 10.26, cl: 20.42, clock: 'nem',
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
                demand: { e: false }, asAt: '2026-07-01'
            },
            'Aurora Energy - Residential Peak and Off-Peak': {
                rateType: 'tou', daily: 151.1814, feedIn: 10.8, cl: 19.45, clock: 'nem',
                tou: {
                    peak: {
                        rate: 35.4782,
                        windows: [
                            { start: '07:00', end: '10:00', days: WEEKDAYS },
                            { start: '16:00', end: '21:00', days: WEEKDAYS }
                        ]
                    },
                    offpeak: { rate: 16.6862 }
                },
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Aurora Energy - Standard Residential': {
                rateType: 'flat', daily: 113.77, flat: 29.95, feedIn: 10.8, cl: 19.45,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '1st Energy - Standing Offer': {
                rateType: 'flat', daily: 113.77, flat: 29.95, feedIn: 9.0, cl: 19.45,
                demand: { e: false }, asAt: '2025-07-01'
            }
        },
        VIC: {
            '2026-27 VDO (AusNet Services)': {
                rateType: 'flat', daily: 128.24, flat: 31.98, feedIn: 4.9, cl: 22.11,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO TOU (AusNet Services)': {
                rateType: 'tou', daily: 128.24, feedIn: 4.9, cl: 22.11, clock: 'local',
                tou: {
                    peak: { rate: 47.64, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.60 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO (CitiPower)': {
                rateType: 'flat', daily: 121.14, flat: 25.96, feedIn: 4.9, cl: 16.59,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO TOU (CitiPower)': {
                rateType: 'tou', daily: 121.14, feedIn: 4.9, cl: 16.59, clock: 'local',
                tou: {
                    peak: { rate: 38.31, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.17 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO (Jemena)': {
                rateType: 'flat', daily: 127.13, flat: 27.47, feedIn: 4.9, cl: 21.41,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO TOU (Jemena)': {
                rateType: 'tou', daily: 127.13, feedIn: 4.9, cl: 21.41, clock: 'local',
                tou: {
                    peak: { rate: 37.57, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 21.76 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO (Powercor)': {
                rateType: 'flat', daily: 138.05, flat: 28.22, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO TOU (Powercor)': {
                rateType: 'tou', daily: 138.05, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 41.67, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.49 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO (United Energy)': {
                rateType: 'flat', daily: 119.12, flat: 27.35, feedIn: 4.9, cl: 17.26,
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026-27 VDO TOU (United Energy)': {
                rateType: 'tou', daily: 119.12, feedIn: 4.9, cl: 17.26, clock: 'local',
                tou: {
                    peak: { rate: 40.32, windows: [{ start: '16:00', end: '21:00', days: ALL_DAYS }] },
                    offpeak: { rate: 22.14 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2025-26 VDO (AusNet Services)': {
                rateType: 'flat', daily: 141.46, flat: 34.77, feedIn: 4.9, cl: 23.99,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2025-26 VDO (CitiPower)': {
                rateType: 'flat', daily: 124.07, flat: 27.33, feedIn: 4.9, cl: 20.12,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 EnergyAustralia - Flexi Plan': {
                rateType: 'tou', daily: 121.07, feedIn: 4.65, cl: 21.11, clock: 'local',
                tou: {
                    peak: { rate: 51.35, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 34.76, windows: [{ start: '07:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 25.83 }
                },
                demand: { e: true, r: 31.29, s: '15:00', f: '21:00', days: WEEKDAYS },
                asAt: '2026-07-01'
            },
            'EnergyAustralia - Flexi Plan': {
                rateType: 'tou', daily: 115.3, feedIn: 4.9, cl: 20.1, clock: 'local',
                tou: {
                    peak: { rate: 48.9, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 33.1, windows: [{ start: '07:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 24.6 }
                },
                demand: { e: true, r: 29.8, s: '15:00', f: '21:00', days: WEEKDAYS },
                asAt: '2025-07-01'
            },
            'AGL - Victorian Default Offer': {
                rateType: 'flat', daily: 120.0, flat: 31.5, feedIn: 4.9, cl: 0,
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Red Energy - Red EV Saver': {
                rateType: 'tou', daily: 118.0, feedIn: 5.2, cl: 21.0, clock: 'local',
                tou: {
                    peak: { rate: 47.5, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 32.0, windows: [{ start: '07:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 23.8 }
                },
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Origin - Basic VIC': {
                rateType: 'flat', daily: 122.3, flat: 32.1, feedIn: 4.9, cl: 20.5,
                demand: { e: false }, asAt: '2025-07-01'
            },
            '2026 Tango Energy - Everyday Easy VIC': {
                rateType: 'flat', daily: 100.0, flat: 29.5, feedIn: 4.9, cl: 0,
                demand: { e: false }, asAt: '2026-07-01'
            }
        },
        WA: {
            '2026 Synergy - Home Plan (A1)': {
                rateType: 'flat', daily: 119.2419, flat: 33.2621, feedIn: 2.0, cl: 0,
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                clock: 'local',
                demand: { e: false }, asAt: '2026-07-01'
            },
            '2026 Synergy - Midday Saver': {
                rateType: 'tou', daily: 132.7806, feedIn: 2.0, cl: 0, clock: 'local',
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                tou: {
                    peak: { rate: 55.3253, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 8.8520, windows: [{ start: '09:00', end: '15:00', days: ALL_DAYS }] },
                    offpeak: { rate: 24.3431 }
                },
                demand: { e: false }, asAt: '2026-07-01'
            },
            'Synergy - Home Plan (A1)': {
                rateType: 'flat', daily: 116.0505, flat: 32.3719, feedIn: 2.0, cl: 0,
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                clock: 'local',
                demand: { e: false }, asAt: '2025-07-01'
            },
            'Synergy - Smart Home Plan': {
                rateType: 'tou', daily: 116.05, feedIn: 2.0, cl: 0, clock: 'local',
                feedInWindows: [{ rate: 10, start: '15:00', end: '21:00', days: ALL_DAYS }],
                tou: {
                    peak: { rate: 61.56, windows: [{ start: '15:00', end: '21:00', days: ALL_DAYS }] },
                    shoulder: { rate: 32.24, windows: [{ start: '07:00', end: '15:00', days: WEEKDAYS }] },
                    offpeak: { rate: 16.96 }
                },
                demand: { e: false }, asAt: '2025-07-01'
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
