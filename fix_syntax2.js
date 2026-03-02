const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// Line 934 is: `                    };`
// It should be `                    });`

html = html.replace("cb.checked = (settings.days || []).includes(parseInt(cb.value));\n                    };\n                }", "cb.checked = (settings.days || []).includes(parseInt(cb.value));\n                    });\n                }");

fs.writeFileSync('index.html', html);
