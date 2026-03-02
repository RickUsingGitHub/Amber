const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
const scriptContent = scriptMatch[1];
const acorn = require('acorn');

try {
  acorn.parse(scriptContent, {ecmaVersion: 2020});
} catch(e) {
  console.log(e);
}
