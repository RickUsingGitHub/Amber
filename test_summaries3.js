const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
console.log("Lines 3570-3590:");
for(let i=3570; i<3590; i++) {
    console.log(i + ": " + lines[i]);
}
