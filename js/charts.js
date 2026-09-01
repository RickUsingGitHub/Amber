(function (root) {
    const Amber = root.Amber = root.Amber || {};

    Amber.registerChartPlugins = function () {
        if (!root.Chart || Amber._chartPluginsRegistered) return;
        root.Chart.Tooltip.positioners.cursor = function (items, eventPosition) {
            return eventPosition;
        };
        root.Chart.register({
            id: 'verticalHighlight',
            beforeDatasetsDraw: (chart) => {
                const activeElements = chart.tooltip && chart.tooltip.getActiveElements();
                if (activeElements && activeElements.length > 0) {
                    const ctx = chart.ctx;
                    const index = activeElements[0].index;
                    const xAxis = chart.scales.x;
                    if (xAxis && index !== undefined) {
                        const x = xAxis.getPixelForValue(index);
                        const categoryWidth = xAxis.getPixelForValue(1) - xAxis.getPixelForValue(0);
                        ctx.save();
                        ctx.fillStyle = 'rgba(220, 220, 220, 0.4)';
                        ctx.fillRect(x - categoryWidth / 2, chart.chartArea.top, categoryWidth, chart.chartArea.bottom - chart.chartArea.top);
                        ctx.restore();
                    }
                }
            }
        });
        Amber._chartPluginsRegistered = true;
    };

    function intervalIndexFromNem(nemTimeStr, minutesPerSlot, slotsPerDay) {
        const hours = parseInt(nemTimeStr.substring(11, 13), 10);
        const minutes = parseInt(nemTimeStr.substring(14, 16), 10);
        const index = hours * (60 / minutesPerSlot) + Math.floor(minutes / minutesPerSlot);
        if (index >= 0 && index < slotsPerDay) return index;
        return null;
    }

    function competitorTooltip(label, channelType, planConfig, state, dateStr) {
        if (!planConfig) return '';
        const [hh, mm] = String(label).split(':');
        const day = dateStr || '2026-01-05';
        const dummy = { nemTime: `${day}T${hh}:${mm}:00+10:00`, processedTime: true };
        const rate = Amber.otherRateForItem(dummy, channelType, planConfig, state);
        return `Competitor: ${rate.toFixed(2)} c/kWh`;
    }

    function makeTooltipCallbacks(planConfig, state, dateStr) {
        return {
            label: function (context) {
                if (context.parsed.y === null) return '';
                if (context.dataset.yAxisID === 'yPrice') {
                    return `Price: ${parseFloat(context.parsed.y).toFixed(2)} c/kWh`;
                }
                return `Usage: ${parseFloat(context.parsed.y).toFixed(2)} kW`;
            },
            afterBody: function (items) {
                if (!items.length || !planConfig) return [];
                const label = items[0].label;
                const extra = [competitorTooltip(label, 'general', planConfig, state, dateStr)];
                extra.push(competitorTooltip(label, 'feedIn', planConfig, state, dateStr).replace('Competitor', 'Feed-in'));
                return extra;
            }
        };
    }

    Amber.displayAverageGraph = function (ctx, channelData, options) {
        const generalChannel = Object.values(channelData).find((c) => c.type === 'general');
        const feedInChannel = Object.values(channelData).find((c) => c.type === 'feedIn');
        const controlledLoadChannel = Object.values(channelData).find((c) => c.type === 'controlledLoad');
        const numDays = options.numDays || 1;

        const intervals = Array.from({ length: 48 }, () => ({ totalKwh: 0, totalCents: 0, count: 0 }));
        (generalChannel && generalChannel.usageData || []).forEach((item) => {
            const index = intervalIndexFromNem(item.nemTime, 30, 48);
            if (index == null) return;
            intervals[index].totalKwh += Amber.absKwh(item.kwh);
            intervals[index].totalCents += parseFloat(item.perKwh) || 0;
            intervals[index].count += 1;
        });

        const feedInIntervals = Array.from({ length: 48 }, () => ({ totalKwh: 0, totalCents: 0, count: 0 }));
        if (feedInChannel && feedInChannel.usageData) {
            feedInChannel.usageData.forEach((item) => {
                const index = intervalIndexFromNem(item.nemTime, 30, 48);
                if (index == null) return;
                feedInIntervals[index].totalKwh += Amber.absKwh(item.kwh);
                feedInIntervals[index].totalCents += parseFloat(item.perKwh) || 0;
                feedInIntervals[index].count += 1;
            });
        }

        const controlledLoadIntervals = Array.from({ length: 48 }, () => ({ totalKwh: 0 }));
        if (controlledLoadChannel && controlledLoadChannel.usageData) {
            controlledLoadChannel.usageData.forEach((item) => {
                const index = intervalIndexFromNem(item.nemTime, 30, 48);
                if (index == null) return;
                controlledLoadIntervals[index].totalKwh += Amber.absKwh(item.kwh);
            });
        }

        const labels = [];
        for (let i = 0; i < 48; i++) {
            const hour = Math.floor(i / 2);
            const minute = (i % 2 === 0) ? '00' : '30';
            labels.push(`${hour.toString().padStart(2, '0')}:${minute}`);
        }

        const avgUsageData = intervals.map((i) => numDays > 0 ? (i.totalKwh / numDays) * 2 : 0);
        const avgFeedInData = feedInIntervals.map((i) => numDays > 0 ? (-i.totalKwh / numDays) * 2 : 0);
        const avgControlledLoadData = controlledLoadIntervals.map((i) => numDays > 0 ? (i.totalKwh / numDays) * 2 : 0);
        const avgPriceData = intervals.map((i) => i.count > 0 ? (i.totalCents / i.count) : 0);
        const avgFeedInPriceData = feedInIntervals.map((i) => i.count > 0 ? (-i.totalCents / i.count) : 0);

        const avgDailyGeneralKwh = (generalChannel && generalChannel.totalKWh || 0) / numDays;
        const avgDailyFeedInKwh = (feedInChannel && feedInChannel.totalKWh || 0) / numDays;
        const avgDailyControlledLoadKwh = (controlledLoadChannel && controlledLoadChannel.totalKWh || 0) / numDays;
        const generalAvgPrice = (generalChannel && generalChannel.totalKWh > 0 ? ((generalChannel.totalAmberCost * 100) / generalChannel.totalKWh) : 0).toFixed(2);
        const feedInAvgPrice = (feedInChannel && feedInChannel.totalKWh > 0 ? ((-feedInChannel.totalAmberCost * 100) / feedInChannel.totalKWh) : 0).toFixed(2);
        const controlledLoadAvgPrice = (controlledLoadChannel && controlledLoadChannel.totalKWh > 0 ? ((controlledLoadChannel.totalAmberCost * 100) / controlledLoadChannel.totalKWh) : 0).toFixed(2);

        const chartDatasets = [];
        if (controlledLoadChannel && (controlledLoadChannel.totalKWh || 0) > 0) {
            chartDatasets.push({
                label: `Average Controlled Load (kW) - Total: ${avgDailyControlledLoadKwh.toFixed(1)} kWh @ ${controlledLoadAvgPrice} c/kWh`,
                data: avgControlledLoadData,
                backgroundColor: 'rgba(13, 110, 253, 0.6)',
                borderColor: 'rgba(13, 110, 253, 1)',
                yAxisID: 'yUsage',
                order: 2,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            });
        }
        chartDatasets.push({
            label: `Usage (kW) - Total: ${avgDailyGeneralKwh.toFixed(1)} kWh @ ${generalAvgPrice} c/kWh`,
            data: avgUsageData,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            yAxisID: 'yUsage',
            order: 2,
            barPercentage: 1.0,
            categoryPercentage: 1.0
        });
        if (feedInChannel && (feedInChannel.totalKWh || 0) > 0) {
            chartDatasets.push({
                label: `Feed-in (kW) - Total: ${avgDailyFeedInKwh.toFixed(1)} kWh @ ${feedInAvgPrice} c/kWh`,
                data: avgFeedInData,
                backgroundColor: 'rgba(40, 167, 69, 0.6)',
                borderColor: 'rgba(40, 167, 69, 1)',
                yAxisID: 'yUsage',
                order: 2,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            });
        }
        chartDatasets.push({
            label: 'Usage (c/kWh)',
            data: avgPriceData,
            type: 'line',
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            fill: false,
            yAxisID: 'yPrice',
            order: 1
        });
        if (feedInChannel && (feedInChannel.totalKWh || 0) > 0) {
            chartDatasets.push({
                label: 'Feed-in (c/kWh)',
                data: avgFeedInPriceData,
                type: 'line',
                borderColor: 'rgba(40, 167, 69, 1)',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                fill: false,
                yAxisID: 'yPrice',
                order: 1
            });
        }

        return new root.Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: chartDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            callback: function (value, index, ticks) {
                                const label = this.getLabelForValue(value);
                                if (index % 4 === 0) return label;
                                const isZoomed = this.chart.getZoomLevel && this.chart.getZoomLevel() > 1;
                                if (index === ticks.length - 1 && !isZoomed) return '24:00';
                                return '';
                            },
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: function (context) {
                                return context.index % 2 === 0 ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.05)';
                            }
                        }
                    },
                    yUsage: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Average Power (kW)' },
                        stacked: true
                    },
                    yPrice: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Average Spot Price (c/kWh)' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: `Average 24-Hour Usage & Spot Price (${options.startDate} to ${options.endDate})`
                    },
                    tooltip: {
                        position: 'cursor',
                        callbacks: makeTooltipCallbacks(options.planConfig, options.state)
                    },
                    zoom: {
                        zoom: {
                            drag: { enabled: true },
                            mode: 'x',
                            onZoomComplete: ({ chart }) => {
                                if (options.onZoom && chart.getZoomLevel && chart.getZoomLevel() > 1) options.onZoom();
                            }
                        }
                    }
                }
            }
        });
    };

    Amber.displayDailyGraph = function (ctx, channelData, selectedDateStr, options) {
        const generalChannel = Object.values(channelData).find((c) => c.type === 'general');
        const feedInChannel = Object.values(channelData).find((c) => c.type === 'feedIn');
        const controlledLoadChannel = Object.values(channelData).find((c) => c.type === 'controlledLoad');

        const dayData = (generalChannel && generalChannel.usageData || []).filter((item) => Amber.usageDateStr(item) === selectedDateStr);
        const intervals = Array.from({ length: 288 }, () => ({ kwh: 0, price: null, count: 0 }));
        dayData.forEach((item) => {
            const index = intervalIndexFromNem(item.nemTime, 5, 288);
            if (index == null) return;
            intervals[index].kwh += Amber.absKwh(item.kwh);
            intervals[index].price = (intervals[index].price || 0) + (parseFloat(item.perKwh) || 0);
            intervals[index].count += 1;
        });

        const feedInIntervals = Array.from({ length: 288 }, () => ({ kwh: 0, price: 0, count: 0 }));
        const dayDataFeedIn = (feedInChannel && feedInChannel.usageData || []).filter((item) => Amber.usageDateStr(item) === selectedDateStr);
        dayDataFeedIn.forEach((item) => {
            const index = intervalIndexFromNem(item.nemTime, 5, 288);
            if (index == null) return;
            feedInIntervals[index].kwh += Amber.absKwh(item.kwh);
            feedInIntervals[index].price += parseFloat(item.perKwh) || 0;
            feedInIntervals[index].count += 1;
        });

        const controlledLoadIntervals = Array.from({ length: 288 }, () => ({ kwh: 0 }));
        const dayDataControlled = (controlledLoadChannel && controlledLoadChannel.usageData || []).filter((item) => Amber.usageDateStr(item) === selectedDateStr);
        dayDataControlled.forEach((item) => {
            const index = intervalIndexFromNem(item.nemTime, 5, 288);
            if (index == null) return;
            controlledLoadIntervals[index].kwh += Amber.absKwh(item.kwh);
        });

        const labels = intervals.map((_, i) => {
            const hour = Math.floor(i / 12).toString().padStart(2, '0');
            const minute = ((i % 12) * 5).toString().padStart(2, '0');
            return `${hour}:${minute}`;
        });

        const usageData = intervals.map((i) => i.kwh * 12);
        const feedInData = feedInIntervals.map((i) => -i.kwh * 12);
        const controlledLoadData = controlledLoadIntervals.map((i) => i.kwh * 12);
        const priceData = intervals.map((i) => i.count > 0 ? i.price / i.count : null);
        const feedInPriceData = feedInIntervals.map((i) => i.count > 0 ? -i.price / i.count : null);

        const dailyGeneralKwh = dayData.reduce((total, item) => total + Amber.absKwh(item.kwh), 0);
        const dailyGeneralCost = dayData.reduce((total, item) => total + ((parseFloat(item.perKwh) || 0) / 100) * Amber.absKwh(item.kwh), 0);
        const dailyGeneralAvgPrice = (dailyGeneralKwh > 0 ? (dailyGeneralCost / dailyGeneralKwh) * 100 : 0).toFixed(2);
        const dailyFeedInKwh = dayDataFeedIn.reduce((total, item) => total + Amber.absKwh(item.kwh), 0);
        const dailyFeedInCost = dayDataFeedIn.reduce((total, item) => total + ((parseFloat(item.perKwh) || 0) / 100) * Amber.absKwh(item.kwh), 0);
        const dailyFeedInAvgPrice = (dailyFeedInKwh > 0 ? ((-dailyFeedInCost) / dailyFeedInKwh) * 100 : 0).toFixed(2);
        const dailyControlledLoadKwh = dayDataControlled.reduce((total, item) => total + Amber.absKwh(item.kwh), 0);
        const dailyControlledLoadCost = dayDataControlled.reduce((total, item) => total + ((parseFloat(item.perKwh) || 0) / 100) * Amber.absKwh(item.kwh), 0);
        const dailyControlledLoadAvgPrice = (dailyControlledLoadKwh > 0 ? (dailyControlledLoadCost / dailyControlledLoadKwh) * 100 : 0).toFixed(2);

        const estimated = [...dayData, ...dayDataFeedIn, ...dayDataControlled].filter((i) => Amber.isEstimatedQuality(i.quality)).length;
        const renewableItems = [...dayData, ...dayDataFeedIn, ...dayDataControlled];
        let renewableWeighted = 0;
        let renewableKwh = 0;
        renewableItems.forEach((item) => {
            const kwh = Amber.absKwh(item.kwh);
            if (item.renewables != null && kwh) {
                renewableWeighted += (parseFloat(item.renewables) || 0) * kwh;
                renewableKwh += kwh;
            }
        });
        const avgRenew = renewableKwh > 0 ? (renewableWeighted / renewableKwh).toFixed(0) : null;
        const qualityNote = estimated > 0 ? ' · some estimated intervals' : '';
        const renewNote = avgRenew != null ? ` · ${avgRenew}% renewables` : '';

        const chartDatasets = [];
        if (controlledLoadChannel && dailyControlledLoadKwh > 0) {
            chartDatasets.push({
                label: `Controlled Load (kW) - Total: ${dailyControlledLoadKwh.toFixed(1)} kWh @ ${dailyControlledLoadAvgPrice} c/kWh`,
                data: controlledLoadData,
                backgroundColor: 'rgba(13, 110, 253, 0.6)',
                borderColor: 'rgba(13, 110, 253, 1)',
                yAxisID: 'yUsage',
                order: 2,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            });
        }
        chartDatasets.push({
            label: `Usage (kW) - Total: ${dailyGeneralKwh.toFixed(1)} kWh @ ${dailyGeneralAvgPrice} c/kWh`,
            data: usageData,
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            yAxisID: 'yUsage',
            order: 2,
            barPercentage: 1.0,
            categoryPercentage: 1.0
        });
        if (feedInChannel) {
            chartDatasets.push({
                label: `Feed-in (kW) - Total: ${dailyFeedInKwh.toFixed(1)} kWh @ ${dailyFeedInAvgPrice} c/kWh`,
                data: feedInData,
                backgroundColor: 'rgba(40, 167, 69, 0.6)',
                borderColor: 'rgba(40, 167, 69, 1)',
                yAxisID: 'yUsage',
                order: 2,
                barPercentage: 1.0,
                categoryPercentage: 1.0
            });
        }
        chartDatasets.push({
            label: 'Usage (c/kWh)',
            data: priceData,
            type: 'line',
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            pointRadius: 0,
            borderWidth: 2,
            fill: false,
            yAxisID: 'yPrice',
            order: 1,
            spanGaps: true
        });
        if (feedInChannel && dailyFeedInKwh > 0) {
            chartDatasets.push({
                label: 'Feed-in (c/kWh)',
                data: feedInPriceData,
                type: 'line',
                borderColor: 'rgba(40, 167, 69, 1)',
                backgroundColor: 'rgba(40, 167, 69, 0.2)',
                pointRadius: 0,
                borderWidth: 2,
                fill: false,
                yAxisID: 'yPrice',
                order: 1,
                spanGaps: true
            });
        }

        return new root.Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: chartDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        stacked: true,
                        ticks: {
                            callback: function (value, index, ticks) {
                                const label = this.getLabelForValue(value);
                                if (index % 24 === 0) return label;
                                const isZoomed = this.chart.getZoomLevel && this.chart.getZoomLevel() > 1;
                                if (index === ticks.length - 1 && !isZoomed) return '24:00';
                                return '';
                            },
                            autoSkip: false,
                            maxRotation: 45,
                            minRotation: 45
                        },
                        grid: {
                            color: function (context) {
                                if (context.index % 12 === 0) return 'rgba(0, 0, 0, 0.2)';
                                if (context.index % 6 === 0) return 'rgba(0, 0, 0, 0.05)';
                                return 'transparent';
                            }
                        }
                    },
                    yUsage: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Power (kW)' },
                        stacked: true
                    },
                    yPrice: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Spot Price (c/kWh)' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    title: { display: true, text: `Usage & Spot Price for ${selectedDateStr}${qualityNote}${renewNote}` },
                    tooltip: {
                        position: 'cursor',
                        callbacks: makeTooltipCallbacks(options.planConfig, options.state, selectedDateStr)
                    },
                    zoom: {
                        zoom: {
                            drag: { enabled: true },
                            mode: 'x',
                            onZoomComplete: ({ chart }) => {
                                if (options.onZoom && chart.getZoomLevel && chart.getZoomLevel() > 1) options.onZoom();
                            }
                        }
                    }
                }
            }
        });
    };

    if (typeof module === 'object' && module.exports) module.exports = Amber;
})(typeof window !== 'undefined' ? window : globalThis);
