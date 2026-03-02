const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Extract all script tags
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let match;
let scriptIndex = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  const scriptContent = match[1];
  console.log(`Checking script ${scriptIndex}...`);
  try {
    new Function(scriptContent);
  } catch (e) {
    console.error(`Error in script ${scriptIndex}:`, e.message);

    // Find approximate line number
    const lines = scriptContent.split('\n');
    let errorLine = -1;
    for(let i=0; i<lines.length; i++) {
        try {
            new Function(lines.slice(0, i+1).join('\n'));
        } catch (err) {
            console.log(`Error likely at line ${i+1}: ${lines[i]}`);
            break;
        }
    }
  }
  scriptIndex++;
}
