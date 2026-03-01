const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const resultsSectionIndex = html.indexOf('id="resultsSection"');
console.log(html.substring(resultsSectionIndex - 50, resultsSectionIndex + 500));
