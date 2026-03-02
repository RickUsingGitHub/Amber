with open('index.html', 'r') as f:
    html = f.read()

# I also need to remove the trailing part from earlier:
#             if (discountsHTML) {
#                 tableHTML += discountsHTML;
#             }
#
#             const savings = adjustedOtherTotal - adjustedAmberTotal;

html = html.replace("""            if (discountsHTML) {
                tableHTML += discountsHTML;
            }

            const savings = adjustedOtherTotal - adjustedAmberTotal;""", "const savings = adjustedOtherTotal - adjustedAmberTotal;")

with open('index.html', 'w') as f:
    f.write(html)
print("Removed trailing discounts block.")
