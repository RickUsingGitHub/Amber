'use strict';

/*
 * Every js/*.js must parse as a classic script, and index.html must load every one of them.
 * No other unit script loads the DOM files (help.js, app.js, …), so without this a syntax error
 * in one of them is first seen by the browser tests.
 *
 * The page controller is split over js/app-*.js and js/app.js, which call each other through
 * Amber.app. The last part checks that every app.<name> one of them uses is put there by
 * another, so a misspelt or moved function is caught here and not on the first click.
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

// ---------- Amber.app: what the page controller's files share ----------

const appFiles = files.filter((name) => name === 'app.js' || name.startsWith('app-'));
const provided = {};    // name -> the files that put it on Amber.app
const used = {};        // name -> the files that read app.<name>
appFiles.forEach((name) => {
    // Comments may mention app.js and the like; only code counts.
    const code = fs.readFileSync(path.join(dir, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const block of code.matchAll(/(?:Amber\.app = |Object\.assign\(app, )\{([^}]*)\}/g)) {
        block[1].split(',').map((part) => part.split(':')[0].trim()).filter(Boolean).forEach((key) => {
            (provided[key] || (provided[key] = [])).push(name);
        });
    }
    for (const use of code.matchAll(/(?<![\w.$])app\.([A-Za-z_$][\w$]*)/g)) {
        (used[use[1]] || (used[use[1]] = new Set())).add(name);
    }
});
const unknown = Object.keys(used).filter((key) => !provided[key]).map((key) => `app.${key} in ${[...used[key]].join(', ')}`);
const twiceProvided = Object.keys(provided).filter((key) => provided[key].length > 1);
const unusedElsewhere = Object.keys(provided).filter((key) => !used[key] || [...used[key]].every((name) => name === provided[key][0]));
const outsiders = files.filter((name) => !appFiles.includes(name)
    && /\bAmber\.app\b(?!Api)/.test(fs.readFileSync(path.join(dir, name), 'utf8')));
const firstApp = loaded.findIndex((name) => name === 'app.js' || name.startsWith('app-'));
assert(Object.keys(provided).length > 0 && !unknown.length, `every app.<name> the app files use is on Amber.app${unknown.length ? ` (missing: ${unknown.join('; ')})` : ''}`);
assert(!twiceProvided.length, `each name is put on Amber.app by one file${twiceProvided.length ? ` (twice: ${twiceProvided.join(', ')})` : ''}`);
assert(!unusedElsewhere.length, `everything on Amber.app is used by another app file${unusedElsewhere.length ? ` (not used elsewhere: ${unusedElsewhere.join(', ')})` : ''}`);
assert(!outsiders.length, `only the app files use Amber.app; other modules use Amber.appApi${outsiders.length ? ` (also in: ${outsiders.join(', ')})` : ''}`);
assert(loaded[firstApp] === 'app-core.js', 'app-core.js is the first of the app files (it creates Amber.app)');

if (failed) {
    console.error(`${failed} syntax test(s) failed`);
    process.exit(1);
}
console.log('syntax tests passed');
