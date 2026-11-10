'use strict';

/*
 * Every js/*.js must parse as a classic script, and index.html must load every one of them.
 * No other unit script loads the DOM files (help.js, app.js, …), so without this a syntax error
 * in one of them is first seen by the browser tests.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'js');
const files = fs.readdirSync(dir).filter((name) => name.endsWith('.js')).sort();

let failed = 0;
function assert(cond, message) {
    if (!cond) { failed += 1; console.error('FAIL:', message); } else { console.log('ok:', message); }
}

const broken = [];
files.forEach((name) => {
    try {
        // Compiles without running, as the browser would parse a <script src>.
        new vm.Script(fs.readFileSync(path.join(dir, name), 'utf8'), { filename: `js/${name}` });
    } catch (err) {
        broken.push(name);
        console.error(`FAIL: js/${name} does not parse: ${err.message}`);
        console.error(String(err.stack).split('\n').slice(0, 4).join('\n'));
    }
});
assert(files.length > 0 && !broken.length, `${files.length} files in js/ parse as classic scripts`);

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loaded = (html.match(/<script src="js\/[^"?]+/g) || []).map((tag) => tag.replace('<script src="js/', ''));
const notLoaded = files.filter((name) => !loaded.includes(name));
const missing = loaded.filter((name) => !files.includes(name));
const twice = loaded.filter((name, i) => loaded.indexOf(name) !== i);
assert(!notLoaded.length, `index.html loads every file in js/${notLoaded.length ? ` (not loaded: ${notLoaded.join(', ')})` : ''}`);
assert(!missing.length && !twice.length, `every js/ script tag in index.html names one file, once${missing.concat(twice).length ? ` (check: ${missing.concat(twice).join(', ')})` : ''}`);
assert(loaded[loaded.length - 1] === 'app.js', 'app.js is the last script (it starts the page)');

if (failed) {
    console.error(`${failed} syntax test(s) failed`);
    process.exit(1);
}
console.log('syntax tests passed');
