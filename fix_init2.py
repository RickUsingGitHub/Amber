import re

with open('index.html', 'r') as f:
    html = f.read()

# Wait, the error is "Cannot access 'discountsHTML' before initialization"
# Let's find all instances of `discountsHTML`.
matches = [m.start() for m in re.finditer(r'discountsHTML', html)]
print("Indices of discountsHTML:", matches)

# Print lines around them
lines = html.split('\n')
for i, line in enumerate(lines):
    if 'discountsHTML' in line:
        print(f"Line {i+1}: {line}")
