with open('index.html', 'r') as f:
    lines = f.readlines()

# The discount block needs to run BEFORE `tableHTML += \` Total row.
# In fact, the discount logic block needs to run, append `discountsHTML` to `tableHTML`, then append the `Total` block.

# Here is the block of code starting with `const planConfig = createPlanObjectFromForm();` (line 3268) up to `adjustedOtherTotal -= totalDiscountsAmount;` (line 3314)
# Let's extract that block, put it before `tableHTML += \` `Total` block, and fix the order.

# Let's rebuild that specific section using a targeted regex or just replacing the whole chunk.
import re

html_content = "".join(lines)

chunk_to_replace = re.compile(
r"""            if \(discountsHTML\) \{
                tableHTML \+\= discountsHTML;
            \}

             tableHTML \+\= `
                    <tr class="bg-gray-50 font-bold">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">Total</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">\$\$\{adjustedAmberTotal\.toFixed\(2\)\}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">\$\$\{adjustedOtherTotal\.toFixed\(2\)\}</td>
                    </tr>
                </tbody>
                </table>
            `;


            const planConfig = createPlanObjectFromForm\(\);
            const discounts = planConfig\.discounts \|\| \[\];
            let totalDiscountsAmount = 0;
            let discountsHTML = '';

            if \(discounts\.length > 0\) \{
                // Calculate eligible amounts
                let usageTotalOther = 0;
                Object\.values\(channelTotals\)\.forEach\(c => \{
                    if \(c\.type !== 'feedIn'\) \{
                        const isFeedIn = c\.type === 'feedIn';
                        usageTotalOther \+\= adjustForGst\(c\.totalOtherCost \|\| 0, isFeedIn\);
                    \}
                \}\);

                // Subtract the otherDemandCost from usageTotalOther because calculateOtherSupplierCosts
                // adds the demand cost to the 'general' channel total\.
                // We will add it back specifically for 'all' discount cover\.
                let demandCost = 0;
                if \(otherDemandTariffInfo && otherDemandTariffInfo\.cost > 0\) \{
                    demandCost = adjustForGst\(otherDemandTariffInfo\.cost\);
                    usageTotalOther -= demandCost;
                \}

                const dailyTotalOther = adjustedOtherDailyConnection \+ demandCost;

                discounts\.forEach\(discount => \{
                    let discountableAmount = 0;
                    if \(discount\.cover === 'usage'\) \{
                        discountableAmount = usageTotalOther;
                    \} else if \(discount\.cover === 'all'\) \{
                        discountableAmount = usageTotalOther \+ dailyTotalOther;
                    \}

                    if \(discountableAmount > 0\) \{
                        const discountAmount = discountableAmount \* \(discount\.percent / 100\);
                        totalDiscountsAmount \+\= discountAmount;

                        discountsHTML \+\= `
                            <tr class="font-semibold text-green-600 bg-green-50">
                                <td class="px-6 py-2 whitespace-nowrap text-sm" colspan="3">Discount: \$\{escapeHTML\(discount\.description\)\} \(\$\{discount\.percent\}%\)</td>
                                <td class="px-6 py-2 whitespace-nowrap text-sm text-right"></td>
                                <td class="px-6 py-2 whitespace-nowrap text-sm text-right">-\$\$\{discountAmount\.toFixed\(2\)\}</td>
                            </tr>
                        `;
                    \}
                \}\);
            \}

            adjustedOtherTotal -= totalDiscountsAmount;""", re.MULTILINE)

new_chunk = """            const planConfig = createPlanObjectFromForm();
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

             tableHTML += `
                    <tr class="bg-gray-50 font-bold">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">Total</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedAmberTotal.toFixed(2)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedOtherTotal.toFixed(2)}</td>
                    </tr>
                </tbody>
                </table>
            `;"""

if chunk_to_replace.search(html_content):
    html_content = chunk_to_replace.sub(new_chunk, html_content)
    with open('index.html', 'w') as f:
        f.write(html_content)
    print("Fixed order.")
else:
    print("Could not find chunk.")
