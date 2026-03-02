with open('index.html', 'r') as f:
    html = f.read()

# The discount row in the second image is unstyled and renders completely incorrectly.
# Looking at the code:
#                         discountsHTML += `
#                             <tr class="font-semibold text-green-600 bg-green-50">
#                                 <td class="px-6 py-2 whitespace-nowrap text-sm" colspan="3">Discount: ${escapeHTML(discount.description)} (${discount.percent}%)</td>
#                                 <td class="px-6 py-2 whitespace-nowrap text-sm text-right"></td>
#                                 <td class="px-6 py-2 whitespace-nowrap text-sm text-right">-$${discountAmount.toFixed(2)}</td>
#                             </tr>
#                         `;
# Wait, let's look at where it's inserted.
#             if (discountsHTML) {
#                 tableHTML += discountsHTML;
#             }
#
# But `tableHTML` has:
#             tableHTML += `
#                     <tr class="bg-gray-50 font-bold">
#                         <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">Total</td>
#                         <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedAmberTotal.toFixed(2)}</td>
#                         <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedOtherTotal.toFixed(2)}</td>
#                     </tr>
#                 </tbody>
#                 </table>
#             `;
# So discountsHTML is getting appended AFTER the </table> tag!

html = html.replace('if (discountsHTML) {\n                tableHTML += discountsHTML;\n            }\n\n            const savings = adjustedOtherTotal - adjustedAmberTotal;', 'const savings = adjustedOtherTotal - adjustedAmberTotal;')

html = html.replace("""
             tableHTML += `
                    <tr class="bg-gray-50 font-bold">
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900" colspan="3">Total</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedAmberTotal.toFixed(2)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">$${adjustedOtherTotal.toFixed(2)}</td>
                    </tr>
                </tbody>
                </table>
            `;
""", """
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
            `;
""")

with open('index.html', 'w') as f:
    f.write(html)
