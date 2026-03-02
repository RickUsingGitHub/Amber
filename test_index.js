const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /const adjustedOtherDailyConnection = adjustForGst\(otherDailyConnection\);/g;
const match = regex.exec(html);
if (match) {
    console.log("Found at", match.index);
}

const regex2 = /const savings = adjustedOtherTotal - adjustedAmberTotal;/g;
const match2 = regex2.exec(html);
if (match2) {
    console.log("savings found at", match2.index);
}
