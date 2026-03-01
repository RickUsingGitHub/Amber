const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
console.log("Lines 3630-3650:");
for(let i=3630; i<3650; i++) {
    console.log(i + ": " + lines[i]);
}
