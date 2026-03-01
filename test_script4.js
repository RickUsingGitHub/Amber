const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
console.log("Lines 2639-2650:");
for(let i=2635; i<2655; i++) {
    console.log(i + ": " + lines[i]);
}
