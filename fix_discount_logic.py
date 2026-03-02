import re

with open('index.html', 'r') as f:
    html = f.read()

# I need to review calculateOtherSupplierCosts. Does it add demand cost to general channel?
# calculateOtherSupplierCosts:
# if (c.type === 'general') {
#   c.totalOtherCost = (totalKwhForPeriod * otherSupplierRate) / 100 + otherDemandCost;
# }
# So yes, otherDemandCost is added to the general channel.

# In my logic for `displayResults`:
# Object.values(channelTotals).forEach(c => {
#    if (c.type !== 'feedIn') {
#        const isFeedIn = c.type === 'feedIn';
#        usageTotalOther += adjustForGst(c.totalOtherCost || 0, isFeedIn);
#    }
# });
# This means `usageTotalOther` includes `demandCost` (adjusted for GST).
# Then I did:
# let demandCost = 0;
# if (otherDemandTariffInfo && otherDemandTariffInfo.cost > 0) {
#    demandCost = adjustForGst(otherDemandTariffInfo.cost);
#    usageTotalOther -= demandCost;
# }
# This correctly removes it from `usageTotalOther`.
# Wait, `demandCost` is added to `c.totalOtherCost` BEFORE GST.
# So `c.totalOtherCost` = BaseUsage + BaseDemand.
# `adjustForGst(BaseUsage + BaseDemand)` = `adjustForGst(BaseUsage) + adjustForGst(BaseDemand)`.
# This is true because `adjustForGst` is linear (divides by 1.1 if no GST toggle).
# Therefore `usageTotalOther -= demandCost` is perfectly accurate!
