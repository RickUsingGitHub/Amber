const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

const lines = html.split('\n');
console.log("Lines 3570-3580:");
for(let i=3570; i<3580; i++) {
    console.log(i + ": " + lines[i]);
}
console.log("\nLines 3650-3660:");
for(let i=3650; i<3660; i++) {
    console.log(i + ": " + lines[i]);
}
