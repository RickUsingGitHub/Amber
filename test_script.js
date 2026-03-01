const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const usagePriceChartIndex = html.indexOf('id="usagePriceChart"');
console.log(usagePriceChartIndex);
const dailyChartIndex = html.indexOf('id="dailyChart"');
console.log(dailyChartIndex);
