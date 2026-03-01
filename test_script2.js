const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const resultsTableContainerIndex = html.indexOf('id="results-table-container"');
console.log(html.substring(resultsTableContainerIndex - 50, resultsTableContainerIndex + 500));
