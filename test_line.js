const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
const lines = scriptMatch[1].split('\n');

for(let i=925; i<=945; i++) {
    console.log(`${i+1}: ${lines[i]}`);
}
