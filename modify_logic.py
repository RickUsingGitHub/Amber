import re

with open('index.html', 'r') as f:
    html = f.read()

# Modify `displayResults` to handle discounts calculation and row injection.
# Looking for `const savings = adjustedOtherTotal - adjustedAmberTotal;`
# Before we calculate `savings`, we should apply discounts.

discount_calc_logic = """
            const planConfig = createPlanObjectFromForm();
            const discounts = planConfig.discounts || [];
            let totalDiscountsAmount = 0;
            let discountsHTML = '';

            if (discounts.length > 0) {
                // Calculate eligible amounts
                let usageTotalOther = 0;
                Object.values(channelTotals).forEach(c => {
                    if (c.type !== 'feedIn') {
                        const isFeedIn = c.type === 'feedIn';
                        usageTotalOther += adjustForGst(c.totalOtherCost || 0, isFeedIn);
                    }
                });

                // Subtract the otherDemandCost from usageTotalOther because calculateOtherSupplierCosts
                // adds the demand cost to the 'general' channel total.
                // We will add it back specifically for 'all' discount cover.
                let demandCost = 0;
                if (otherDemandTariffInfo && otherDemandTariffInfo.cost > 0) {
                    demandCost = adjustForGst(otherDemandTariffInfo.cost);
                    usageTotalOther -= demandCost;
                }

                const dailyTotalOther = adjustedOtherDailyConnection + demandCost;

                discounts.forEach(discount => {
                    let discountableAmount = 0;
                    if (discount.cover === 'usage') {
                        discountableAmount = usageTotalOther;
                    } else if (discount.cover === 'all') {
                        discountableAmount = usageTotalOther + dailyTotalOther;
                    }

                    if (discountableAmount > 0) {
                        const discountAmount = discountableAmount * (discount.percent / 100);
                        totalDiscountsAmount += discountAmount;

                        discountsHTML += `
                            <tr class="font-semibold text-green-600 bg-green-50">
                                <td class="px-6 py-2 whitespace-nowrap text-sm" colspan="3">Discount: ${escapeHTML(discount.description)} (${discount.percent}%)</td>
                                <td class="px-6 py-2 whitespace-nowrap text-sm text-right"></td>
                                <td class="px-6 py-2 whitespace-nowrap text-sm text-right">-$${discountAmount.toFixed(2)}</td>
                            </tr>
                        `;
                    }
                });
            }

            adjustedOtherTotal -= totalDiscountsAmount;

            if (discountsHTML) {
                tableHTML += discountsHTML;
            }

            const savings = adjustedOtherTotal - adjustedAmberTotal;
"""

html = html.replace('const savings = adjustedOtherTotal - adjustedAmberTotal;', discount_calc_logic)

# In `updatePlanSavings`, we also need to apply the discount.
# Locate `const otherDailyConnection = (parseFloat(document.getElementById('dailyConnectionRate').value) || 0) * lastResultDataPayload.numDays / 100;`

savings_discount_calc = """
                    const otherDailyConnection = (parseFloat(document.getElementById('dailyConnectionRate').value) || 0) * lastResultDataPayload.numDays / 100;
                    currentPlanTotalCost += adjustForGst(otherDailyConnection);

                    const discounts = planConfig.discounts || [];
                    if (discounts.length > 0) {
                        let usageTotalOther = 0;
                        Object.values(tempChannelTotals).forEach(c => {
                            if (c.type !== 'feedIn') {
                                usageTotalOther += adjustForGst(c.totalOtherCost || 0, false);
                            }
                        });

                        let demandCost = 0;
                        if (otherDemandInfo && otherDemandInfo.cost > 0) {
                            demandCost = adjustForGst(otherDemandInfo.cost);
                            usageTotalOther -= demandCost;
                        }

                        const dailyTotalOther = adjustForGst(otherDailyConnection) + demandCost;

                        let totalDiscountsAmount = 0;
                        discounts.forEach(discount => {
                            let discountableAmount = 0;
                            if (discount.cover === 'usage') {
                                discountableAmount = usageTotalOther;
                            } else if (discount.cover === 'all') {
                                discountableAmount = usageTotalOther + dailyTotalOther;
                            }
                            if (discountableAmount > 0) {
                                totalDiscountsAmount += discountableAmount * (discount.percent / 100);
                            }
                        });
                        currentPlanTotalCost -= totalDiscountsAmount;
                    }
"""

html = html.replace("""
                    const otherDailyConnection = (parseFloat(document.getElementById('dailyConnectionRate').value) || 0) * lastResultDataPayload.numDays / 100;
                    currentPlanTotalCost += adjustForGst(otherDailyConnection);
""", savings_discount_calc)


with open('index.html', 'w') as f:
    f.write(html)
print("Logic script executed.")
