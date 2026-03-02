with open('index.html', 'r') as f:
    html = f.read()

# I see what I did:
# I replaced something, and accidentally moved `if (discountsHTML) { tableHTML += discountsHTML; }`
# above where it's declared `let discountsHTML = '';`!
# Let's fix this block:
#
#             if (discountsHTML) {
#                 tableHTML += discountsHTML;
#             }
#
#              tableHTML += `
#                     <tr class="bg-gray-50 font-bold">
#
# I need to remove that first `if (discountsHTML)` which is at Line 3253.
# Let's find exactly what to replace.
