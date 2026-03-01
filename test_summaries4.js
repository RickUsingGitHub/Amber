const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
console.log("Lines 3520-3570:");
for(let i=3520; i<3570; i++) {
    console.log(i + ": " + lines[i]);
}
