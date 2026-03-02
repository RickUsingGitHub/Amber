import re

with open('index.html', 'r') as f:
    html = f.read()

# Make sure `adjustedOtherDailyConnection` exists.
# `adjustedOtherDailyConnection` is defined as `const adjustedOtherDailyConnection = adjustForGst(otherDailyConnection);`
# Let's check where it's defined:
idx = html.find('const adjustedOtherDailyConnection')
print("Found adjustedOtherDailyConnection at", idx)
