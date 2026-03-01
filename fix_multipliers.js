const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Replace standard discount blocks
const discountBlock = /^[ \t]*const discounts = JSON\.parse\(localStorage\.getItem\('discounts'\) \|\| '\[\]'\);\n[ \t]*let totalDiscountPercentage = 0;\n[ \t]*if \(discounts && discounts\.length > 0\) \{\n[ \t]*discounts\.forEach\(d => \{\n[ \t]*if \(d\.applied\) \{\n[ \t]*totalDiscountPercentage \+= parseFloat\(d\.percentage\) \|\| 0;\n[ \t]*\}\n[ \t]*\}\);\n[ \t]*\}\n[ \t]*totalDiscountPercentage = Math\.min\(totalDiscountPercentage, 100\);\n[ \t]*const discountMultiplier = 1 - \(totalDiscountPercentage \/ 100\);/gm;

html = html.replace(discountBlock, "                const discountMultiplier = getDiscountMultiplier();");

const planDiscountBlock = /^[ \t]*const discounts = planConfig \? planConfig\.discounts : JSON\.parse\(localStorage\.getItem\('discounts'\) \|\| '\[\]'\);\n[ \t]*let totalDiscountPercentage = 0;\n[ \t]*if \(discounts && discounts\.length > 0\) \{\n[ \t]*discounts\.forEach\(d => \{\n[ \t]*if \(d\.applied\) \{\n[ \t]*totalDiscountPercentage \+= parseFloat\(d\.percentage\) \|\| 0;\n[ \t]*\}\n[ \t]*\}\);\n[ \t]*\}\n[ \t]*\/\/ Limit discount to 100%\n[ \t]*totalDiscountPercentage = Math\.min\(totalDiscountPercentage, 100\);\n[ \t]*const discountMultiplier = 1 - \(totalDiscountPercentage \/ 100\);/gm;

html = html.replace(planDiscountBlock, "            const discountMultiplier = getDiscountMultiplier(planConfig);");


const planDiscountBlock2 = /^[ \t]*const discounts = planConfig\.discounts \|\| \[\];\n[ \t]*let totalDiscountPercentage = 0;\n[ \t]*if \(discounts && discounts\.length > 0\) \{\n[ \t]*discounts\.forEach\(d => \{\n[ \t]*if \(d\.applied\) \{\n[ \t]*totalDiscountPercentage \+= parseFloat\(d\.percentage\) \|\| 0;\n[ \t]*\}\n[ \t]*\}\);\n[ \t]*\}\n[ \t]*totalDiscountPercentage = Math\.min\(totalDiscountPercentage, 100\);\n[ \t]*const discountMultiplier = 1 - \(totalDiscountPercentage \/ 100\);/gm;

html = html.replace(planDiscountBlock2, "                    const discountMultiplier = getDiscountMultiplier(planConfig);");


fs.writeFileSync('index.html', html);
console.log('Done replacing blocks');
