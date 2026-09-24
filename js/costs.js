(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.absKwh = function (value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        return Math.abs(n);
    };

    Amber.isEstimatedQuality = function (quality) {
        if (!quality) return false;
        const q = String(quality).toLowerCase();
        return q === 'estimated' || q === 'estimate';
    };

    Amber.getTouPeriod = function (parts, touConfig, fallbackRate) {
        const fallback = parseFloat(fallbackRate) || 0;
        if (!touConfig) return { period: 'anytime', rate: fallback };
        const checkPeriod = (period) => {
            if (!period) return false;
            if (period.windows && period.windows.length > 0) {
                return period.windows.some((window) => Amber.windowMatches(window, parts));
            }
            return Amber.windowMatches(period, parts);
        };
        if (checkPeriod(touConfig.peak)) {
            return { period: 'peak', rate: parseFloat(touConfig.peak.rate) || 0 };
        }
        if (checkPeriod(touConfig.shoulder)) {
            return { period: 'shoulder', rate: parseFloat(touConfig.shoulder.rate) || 0 };
        }
        if (touConfig.offpeak && touConfig.offpeak.rate != null && touConfig.offpeak.rate !== '') {
            return { period: 'offpeak', rate: parseFloat(touConfig.offpeak.rate) || 0 };
        }
        return { period: 'offpeak', rate: fallback };
    };

    Amber.getTouRate = function (parts, touConfig, fallbackRate) {
        return Amber.getTouPeriod(parts, touConfig, fallbackRate).rate;
    };

    Amber.PERIOD_LABELS = {
        peak: 'Peak',
        shoulder: 'Shoulder',
        offpeak: 'Off-peak',
        anytime: 'Anytime',
        controlledLoad: 'Controlled load',
        feedIn: 'Feed-in'
    };

    Amber.classifyUsagePeriod = function (item, channelType, planConfig, state) {
        if (channelType === 'feedIn') {
            return {
                period: 'feedIn',
                label: Amber.PERIOD_LABELS.feedIn,
                rate: Amber.otherRateForItem(item, 'feedIn', planConfig, state)
            };
        }
        if (channelType === 'controlledLoad') {
            return {
                period: 'controlledLoad',
                label: Amber.PERIOD_LABELS.controlledLoad,
                rate: Amber.otherRateForItem(item, 'controlledLoad', planConfig, state)
            };
        }
        if (!planConfig || planConfig.rateType === 'flat') {
            return {
                period: 'anytime',
                label: Amber.PERIOD_LABELS.anytime,
                rate: parseFloat(planConfig && planConfig.flat) || 0
            };
        }
        const parts = Amber.clockPartsForItem(item, planConfig, state);
        const found = Amber.getTouPeriod(parts, planConfig.tou, parseFloat(planConfig.flat) || 0);
        return {
            period: found.period,
            label: Amber.PERIOD_LABELS[found.period] || found.period,
            rate: found.rate
        };
    };

    Amber.channelPeriodBreakdown = function (channel, planConfig, state) {
        const buckets = Object.create(null);
        const order = ['peak', 'shoulder', 'offpeak', 'anytime', 'controlledLoad', 'feedIn'];
        (channel.usageData || []).forEach((item) => {
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            const cls = Amber.classifyUsagePeriod(item, channel.type, planConfig, state);
            if (!buckets[cls.period]) {
                buckets[cls.period] = {
                    period: cls.period,
                    label: cls.label,
                    kwh: 0,
                    amberCost: 0,
                    otherCost: 0,
                    rate: cls.rate
                };
            } else if (buckets[cls.period].rate !== cls.rate) {
                buckets[cls.period].rate = null;
            }
            buckets[cls.period].kwh += kwh;
            buckets[cls.period].amberCost += (perKwh / 100) * kwh;
            const other = (kwh * cls.rate) / 100;
            buckets[cls.period].otherCost += channel.type === 'feedIn' ? -other : other;
        });
        const rows = order.filter((key) => buckets[key] && buckets[key].kwh > 0).map((key) => buckets[key]);
        if (channel.type === 'feedIn' && rows.length === 1 && Number.isFinite(channel.totalAmberCost)) {
            rows[0].amberCost = channel.totalAmberCost;
        }
        return rows;
    };

    Amber.formatCentsPerKwh = function (rate) {
        const n = parseFloat(rate);
        if (!Number.isFinite(n)) return '';
        const text = String(Number(n.toFixed(4)));
        return `(${text}c/kWh) `;
    };

    Amber.getFeedInRate = function (parts, planConfig) {
        const defaultRate = parseFloat(planConfig && planConfig.feedIn) || 0;
        const windows = planConfig && planConfig.feedInWindows;
        if (!windows || !windows.length) return defaultRate;
        for (let i = 0; i < windows.length; i++) {
            const window = windows[i];
            if (Amber.windowMatches(window, parts)) return parseFloat(window.rate) || 0;
        }
        return defaultRate;
    };

    Amber.clockPartsForItem = function (item, planConfig, state) {
        const opts = Amber.clockOptionsForState(state, planConfig);
        const key = (opts.clock || 'local') + '|' + (opts.timeZone || '');
        if (!item._clockParts) item._clockParts = Object.create(null);
        if (item._clockParts[key]) return item._clockParts[key];
        const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
        const parts = Amber.getClockParts(nem, opts);
        item._clockParts[key] = parts;
        return parts;
    };

    Amber.otherRateForItem = function (item, channelType, planConfig, state) {
        if (channelType === 'feedIn') {
            const windows = planConfig && planConfig.feedInWindows;
            if (!windows || !windows.length) return parseFloat(planConfig && planConfig.feedIn) || 0;
            return Amber.getFeedInRate(Amber.clockPartsForItem(item, planConfig, state), planConfig);
        }
        if (planConfig.rateType === 'flat') {
            if (channelType === 'controlledLoad') {
                const cl = parseFloat(planConfig.cl);
                if (Number.isFinite(cl) && cl > 0) return cl;
            }
            return parseFloat(planConfig.flat) || 0;
        }
        if (channelType === 'controlledLoad') return parseFloat(planConfig.cl) || 0;
        const fallback = parseFloat(planConfig.flat) || 0;
        return Amber.getTouRate(Amber.clockPartsForItem(item, planConfig, state), planConfig.tou, fallback);
    };

    Amber.calculateOtherSupplierCosts = function (channelTotals, planConfig, state) {
        Object.values(channelTotals).forEach((channel) => {
            let channelOtherCost = 0;
            if (channel.type === 'feedIn') {
                channelOtherCost = channel.usageData.reduce((total, item) => {
                    const kwh = Amber.absKwh(item.kwh);
                    const rate = Amber.otherRateForItem(item, 'feedIn', planConfig, state);
                    return total - (kwh * rate) / 100;
                }, 0);
            } else if (channel.type === 'controlledLoad') {
                channelOtherCost = channel.usageData.reduce((total, item) => {
                    const kwh = Amber.absKwh(item.kwh);
                    const rate = Amber.otherRateForItem(item, 'controlledLoad', planConfig, state);
                    return total + (kwh * rate) / 100;
                }, 0);
            } else if (channel.type === 'general') {
                channelOtherCost = channel.usageData.reduce((total, item) => {
                    const kwh = Amber.absKwh(item.kwh);
                    const rate = Amber.otherRateForItem(item, 'general', planConfig, state);
                    return total + (kwh * rate) / 100;
                }, 0);
            } else {
                channelOtherCost = channel.usageData.reduce((total, item) => {
                    const kwh = Amber.absKwh(item.kwh);
                    const rate = Amber.otherRateForItem(item, channel.type, planConfig, state);
                    return total + (kwh * rate) / 100;
                }, 0);
            }
            channel.totalOtherCost = channelOtherCost;
        });
    };

    Amber.calculateDemandTariff = function (channelTotals, amberDemandCents) {
        const generalChannel = Object.values(channelTotals).find((c) => c.type === 'general');
        const empty = { cost: 0, maxDemandKwh: 0, demandDays: 0, maxDemandTime: null };
        if (!generalChannel || !generalChannel.usageData || generalChannel.usageData.length === 0) {
            return empty;
        }

        const demandWindowUsage = generalChannel.usageData.filter((item) =>
            item.tariffInformation && item.tariffInformation.demandWindow === true
        );
        if (demandWindowUsage.length === 0) return empty;

        const thirtyMinChunks = {};
        demandWindowUsage.forEach((item) => {
            const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
            const parts = Amber.parseNemParts(nem);
            const key = Amber.thirtyMinBlockKey(parts);
            thirtyMinChunks[key] = (thirtyMinChunks[key] || 0) + Amber.absKwh(item.kwh);
        });

        let maxDemandKwh = 0;
        let maxDemandTime = null;
        Object.keys(thirtyMinChunks).forEach((startTime) => {
            if (thirtyMinChunks[startTime] > maxDemandKwh) {
                maxDemandKwh = thirtyMinChunks[startTime];
                maxDemandTime = startTime;
            }
        });
        if (maxDemandKwh === 0) return empty;

        const demandDaysSet = new Set(demandWindowUsage.map((item) => Amber.usageDateStr(item)));
        const numberOfDemandDays = demandDaysSet.size;
        const rate = amberDemandCents != null ? amberDemandCents : Amber.DEFAULT_AMBER_DEMAND_CENTS;
        const demandTariffCost = maxDemandKwh * 2 * (rate / 100) * numberOfDemandDays;

        return {
            cost: demandTariffCost,
            maxDemandKwh,
            demandDays: numberOfDemandDays,
            maxDemandTime
        };
    };

    Amber.calculateOtherDemandTariff = function (channelTotals, startDateStr, endDateStr, planConfig, state) {
        const empty = { cost: 0, maxDemandKwh: 0, maxDemandTime: null, dailyCharge: 0, applicableDaysCount: 0 };
        const demand = planConfig && planConfig.demand;
        if (!demand || !demand.e) return empty;
        const demandDays = demand.days || [];
        if (!demandDays.length) return empty;

        const generalChannel = Object.values(channelTotals).find((c) => c.type === 'general');
        if (!generalChannel || !generalChannel.usageData || generalChannel.usageData.length === 0) {
            return empty;
        }

        const demandRate = parseFloat(demand.r) || 0;
        const demandWindowUsage = generalChannel.usageData.filter((item) => {
            const parts = Amber.clockPartsForItem(item, planConfig, state);
            if (!demandDays.includes(parts.weekday)) return false;
            return Amber.timeInWindow(parts, demand.s, demand.f);
        });
        if (demandWindowUsage.length === 0) return empty;

        const thirtyMinChunks = {};
        demandWindowUsage.forEach((item) => {
            const parts = Amber.clockPartsForItem(item, planConfig, state);
            const key = Amber.thirtyMinBlockKey(parts);
            thirtyMinChunks[key] = (thirtyMinChunks[key] || 0) + Amber.absKwh(item.kwh);
        });

        let maxDemandKwh = 0;
        let maxDemandTime = null;
        Object.keys(thirtyMinChunks).forEach((startTime) => {
            if (thirtyMinChunks[startTime] > maxDemandKwh) {
                maxDemandKwh = thirtyMinChunks[startTime];
                maxDemandTime = startTime;
            }
        });
        if (maxDemandKwh === 0) return empty;

        let applicableDaysCount = 0;
        let currentDate = new Date(startDateStr + 'T00:00:00');
        const endDate = new Date(endDateStr + 'T00:00:00');
        while (currentDate <= endDate) {
            if (demandDays.includes(currentDate.getDay())) applicableDaysCount++;
            currentDate.setDate(currentDate.getDate() + 1);
        }

        const dailyCharge = (maxDemandKwh * 2) * (demandRate / 100);
        return {
            cost: dailyCharge * applicableDaysCount,
            maxDemandKwh,
            maxDemandTime,
            dailyCharge,
            applicableDaysCount
        };
    };

    Amber.adjustForGst = function (cost, gstInclusive, isFeedIn) {
        if (!gstInclusive && !isFeedIn) return cost / 1.1;
        return cost;
    };

    Amber.shallowChannelCopy = function (channelTotals) {
        const copy = {};
        Object.keys(channelTotals).forEach((id) => {
            copy[id] = Object.assign({}, channelTotals[id]);
        });
        return copy;
    };

    Amber.amberFixedDaily = function (amberRates) {
        return ((amberRates.connectionCents || 0) + (amberRates.subscriptionCents || 0)) / 100;
    };

    Amber.computePlanTotals = function (channelTotals, planConfig, options) {
        const opts = options || {};
        const startDateStr = opts.startDateStr;
        const endDateStr = opts.endDateStr;
        const numDays = opts.numDays;
        const state = opts.state;
        const gstInclusive = opts.gstInclusive !== false;
        const amberRates = opts.amberRates || {
            connectionCents: Amber.DEFAULT_AMBER_CONNECTION_CENTS,
            subscriptionCents: Amber.DEFAULT_AMBER_SUBSCRIPTION_CENTS,
            demandCents: Amber.DEFAULT_AMBER_DEMAND_CENTS
        };

        const temp = Amber.shallowChannelCopy(channelTotals);
        Amber.calculateOtherSupplierCosts(temp, planConfig, state);
        const otherDemand = Amber.calculateOtherDemandTariff(temp, startDateStr, endDateStr, planConfig, state);

        let otherEnergy = 0;
        Object.values(temp).forEach((c) => {
            otherEnergy += Amber.adjustForGst(c.totalOtherCost || 0, gstInclusive, c.type === 'feedIn');
        });
        const otherConnection = Amber.adjustForGst(((parseFloat(planConfig.daily) || 0) * numDays) / 100, gstInclusive, false);
        const otherDemandCost = Amber.adjustForGst(otherDemand.cost || 0, gstInclusive, false);
        const otherTotal = otherEnergy + otherConnection + otherDemandCost;

        return {
            otherTotal,
            otherEnergy,
            otherConnection,
            otherDemand,
            channels: temp
        };
    };

    Amber.precalculateDailySummaries = function (channelData, planConfig, amberRates, state) {
        const summaries = {};
        const monthlyDemandInfo = {};
        const allDatesWithData = new Set();

        Object.values(channelData).forEach((channel) => {
            channel.usageData.forEach((item) => {
                allDatesWithData.add(Amber.usageDateStr(item));
            });
        });

        const sortedDates = [...allDatesWithData].sort();
        if (sortedDates.length > 0) {
            const start = new Date(sortedDates[0] + 'T00:00:00');
            const end = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');
            let loopDate = new Date(start);
            while (loopDate <= end) {
                const dateStr = Amber.formatForInput(loopDate);
                summaries[dateStr] = {
                    totalInKwh: 0, totalOutKwh: 0,
                    amberCost: 0, otherCost: 0,
                    amberDemandCost: 0, otherDemandCost: 0,
                    estimatedCount: 0, billableCount: 0,
                    renewableWeighted: 0, renewableKwh: 0,
                    channels: {}
                };
                loopDate.setDate(loopDate.getDate() + 1);
            }
        }

        Object.values(channelData).forEach((channel) => {
            channel.usageData.forEach((item) => {
                const dateStr = Amber.usageDateStr(item);
                if (!summaries[dateStr]) return;

                const kwh = Amber.absKwh(item.kwh);
                const perKwh = parseFloat(item.perKwh) || 0;
                const amberItemCost = (kwh * perKwh) / 100;
                const otherRate = Amber.otherRateForItem(item, channel.type, planConfig, state);
                const otherItemCost = (kwh * otherRate) / 100;

                if (!summaries[dateStr].channels[channel.identifier]) {
                    summaries[dateStr].channels[channel.identifier] = {
                        type: channel.type, kwh: 0, amberCost: 0, otherCost: 0
                    };
                }

                summaries[dateStr].channels[channel.identifier].kwh += kwh;
                summaries[dateStr].channels[channel.identifier].amberCost += amberItemCost;
                summaries[dateStr].amberCost += amberItemCost;

                if (Amber.isEstimatedQuality(item.quality)) summaries[dateStr].estimatedCount += 1;
                else summaries[dateStr].billableCount += 1;

                if (item.renewables != null && kwh) {
                    summaries[dateStr].renewableWeighted += (parseFloat(item.renewables) || 0) * kwh;
                    summaries[dateStr].renewableKwh += kwh;
                }

                if (channel.type === 'feedIn') {
                    summaries[dateStr].totalOutKwh += kwh;
                    summaries[dateStr].otherCost -= otherItemCost;
                    summaries[dateStr].channels[channel.identifier].otherCost -= otherItemCost;
                } else {
                    summaries[dateStr].totalInKwh += kwh;
                    summaries[dateStr].otherCost += otherItemCost;
                    summaries[dateStr].channels[channel.identifier].otherCost += otherItemCost;
                }
            });
        });

        const monthlyData = {};
        Object.keys(channelData).forEach((channelId) => {
            channelData[channelId].usageData.forEach((item) => {
                const monthKey = Amber.usageDateStr(item).substring(0, 7);
                if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
                if (!monthlyData[monthKey][channelId]) {
                    monthlyData[monthKey][channelId] = {
                        identifier: channelData[channelId].identifier,
                        type: channelData[channelId].type,
                        usageData: []
                    };
                }
                monthlyData[monthKey][channelId].usageData.push(item);
            });
        });

        const demandDays = (planConfig.demand && planConfig.demand.days) || [];

        Object.keys(monthlyData).forEach((monthKey) => {
            const monthChannelData = monthlyData[monthKey];
            const year = parseInt(monthKey.substring(0, 4), 10);
            const month = parseInt(monthKey.substring(5, 7), 10) - 1;
            const monthStartDate = new Date(year, month, 1);
            const monthEndDate = new Date(year, month + 1, 0);
            const monthStartDateStr = Amber.formatForInput(monthStartDate);
            const monthEndDateStr = Amber.formatForInput(monthEndDate);

            const amberDemandInfoMonth = Amber.calculateDemandTariff(monthChannelData, amberRates.demandCents);
            const otherDemandInfoMonth = Amber.calculateOtherDemandTariff(
                monthChannelData, monthStartDateStr, monthEndDateStr, planConfig, state
            );

            monthlyDemandInfo[monthKey] = { amber: amberDemandInfoMonth, other: otherDemandInfoMonth };

            const amberDailyDemandCost = (amberDemandInfoMonth && amberDemandInfoMonth.demandDays > 0)
                ? (amberDemandInfoMonth.cost / amberDemandInfoMonth.demandDays) : 0;
            const otherDailyDemandCharge = otherDemandInfoMonth ? otherDemandInfoMonth.dailyCharge : 0;

            const amberDemandDaysInMonth = new Set();
            const generalChannelForMonth = Object.values(monthChannelData).find((c) => c.type === 'general');
            if (generalChannelForMonth) {
                generalChannelForMonth.usageData.forEach((item) => {
                    if (item.tariffInformation && item.tariffInformation.demandWindow) {
                        amberDemandDaysInMonth.add(Amber.usageDateStr(item));
                    }
                });
            }

            let loopDate = new Date(monthStartDate);
            while (loopDate <= monthEndDate) {
                const dateStr = Amber.formatForInput(loopDate);
                if (summaries[dateStr]) {
                    if (amberDemandDaysInMonth.has(dateStr)) {
                        summaries[dateStr].amberDemandCost = amberDailyDemandCost;
                    }
                    if (demandDays.includes(loopDate.getDay())) {
                        summaries[dateStr].otherDemandCost = otherDailyDemandCharge;
                    }
                }
                loopDate.setDate(loopDate.getDate() + 1);
            }
        });

        return { summaries, monthlyDemandInfo };
    };

    Amber.EXPORT_TARIFFS = {
        EA029: {
            clock: 'local',
            timeZone: 'Australia/Sydney',
            middayStart: '10:00',
            middayEnd: '15:00',
            chargeIncGst: 1.3552,
            belKwhPerDay: 6.83
        }
    };

    Amber.intervalEndInWindow = function (parts, startHHMM, endHHMM) {
        if (!parts || !startHHMM || !endHHMM) return false;
        const t = parts.timeValue;
        const start = parseInt(String(startHHMM).replace(':', ''), 10);
        const end = parseInt(String(endHHMM).replace(':', ''), 10);
        if (start < end) return t > start && t <= end;
        return t > start || t <= end;
    };

    Amber.resolveExportTariff = function (site, channel) {
        const code = (channel && channel.tariff) || '';
        if (Amber.EXPORT_TARIFFS[code]) return Amber.EXPORT_TARIFFS[code];
        const channels = (site && site.channels) || [];
        for (let i = 0; i < channels.length; i++) {
            const t = channels[i] && channels[i].tariff;
            if (t && Amber.EXPORT_TARIFFS[t] && (channels[i].type === 'feedIn' || !channel)) {
                return Amber.EXPORT_TARIFFS[t];
            }
        }
        if (site && Amber.canonicalNetwork(site.network) === 'ausgrid' && channel && channel.type === 'feedIn') {
            return Amber.EXPORT_TARIFFS.EA029;
        }
        return null;
    };

    Amber.settleAmberFeedIn = function (channel, site, numDays) {
        if (!channel || channel.type !== 'feedIn') return null;
        const tariff = Amber.resolveExportTariff(site, channel);
        if (!tariff) return null;
        const days = Number(numDays) || 0;
        const opts = { clock: tariff.clock || 'local', timeZone: tariff.timeZone || 'Australia/Sydney' };
        let intervalCost = 0;
        let middayKwh = 0;
        (channel.usageData || []).forEach((item) => {
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            intervalCost += (perKwh / 100) * kwh;
            const nem = item.processedTime ? item.nemTime : Amber.adjustNemTime(item.nemTime);
            const parts = Amber.getClockParts(nem, opts);
            if (Amber.intervalEndInWindow(parts, tariff.middayStart, tariff.middayEnd)) {
                middayKwh += kwh;
            }
        });
        const bel = (tariff.belKwhPerDay || 0) * days;
        const freeKwh = Math.min(middayKwh, bel);
        const chargedKwh = Math.max(0, middayKwh - bel);
        const rate = tariff.chargeIncGst || 0;
        const addBack = freeKwh * rate / 100;
        const charge = chargedKwh * rate / 100;
        return {
            cost: intervalCost - addBack,
            intervalCost,
            middayKwh,
            freeKwh,
            chargedKwh,
            charge,
            addBack,
            chargeRate: rate
        };
    };

    Amber.applyAmberFeedInSettlement = function (channelTotals, site, numDays) {
        Object.keys(channelTotals || {}).forEach((id) => {
            const channel = channelTotals[id];
            if (channel.amberExportCharge) {
                channel.totalAmberCost -= channel.amberExportCharge;
                channel.amberExportCharge = 0;
                channel.amberExportChargeKwh = 0;
                channel.amberExportChargeRate = 0;
            }
        });
        Object.keys(channelTotals || {}).forEach((id) => {
            const channel = channelTotals[id];
            const settled = Amber.settleAmberFeedIn(channel, site, numDays);
            if (!settled) return;
            channel.totalAmberCost = settled.cost;
            channel.amberFeedInSettlement = settled;
            if (settled.charge > 0) {
                const general = Object.keys(channelTotals).map((key) => channelTotals[key])
                    .find((c) => c.type === 'general');
                if (general) {
                    general.totalAmberCost += settled.charge;
                    general.amberExportCharge = settled.charge;
                    general.amberExportChargeKwh = settled.chargedKwh;
                    general.amberExportChargeRate = settled.chargeRate;
                }
            }
        });
    };

    Amber.processUsageData = function (usageArray, channelTotalsObject, shouldCalculateTotals) {
        usageArray.forEach((item) => {
            if (!item.processedTime) {
                item.nemTime = Amber.adjustNemTime(item.nemTime);
                item.processedTime = true;
            }
            const channelId = item.channelIdentifier;
            if (!channelTotalsObject[channelId]) return;
            const channelData = channelTotalsObject[channelId];
            const kwh = Amber.absKwh(item.kwh);
            const perKwh = parseFloat(item.perKwh) || 0;
            if (shouldCalculateTotals) {
                channelData.totalKWh += kwh;
                channelData.totalAmberCost += (perKwh / 100) * kwh;
            }
            channelData.usageData.push(item);
        });
    };

    Amber.emptyChannel = function (channel) {
        return {
            identifier: channel.identifier,
            type: channel.type,
            tariff: channel.tariff,
            totalKWh: 0,
            totalAmberCost: 0,
            totalOtherCost: 0,
            usageData: []
        };
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
