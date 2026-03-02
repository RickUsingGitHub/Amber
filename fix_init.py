with open('index.html', 'r') as f:
    html = f.read()

# Let's find where discountsHTML is defined.
# I had:
#             const planConfig = createPlanObjectFromForm();
#             const discounts = planConfig.discounts || [];
#             let totalDiscountsAmount = 0;
#             let discountsHTML = '';
#
# Let's check if it exists or if I deleted it.
