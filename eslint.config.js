'use strict';

/*
 * ESLint for the code as it is: classic browser scripts (each js/*.js is an IIFE adding to
 * window.Amber, no modules, no build step), Node unit checks and scripts, and Playwright specs.
 * It looks for real problems (unused or shadowed variables, unreachable code, undefined names)
 * and holds the house style: 4-space indent, single quotes, semicolons. Run: npm run lint
 */
const js = require('@eslint/js');
const globals = require('globals');
const stylistic = require('@stylistic/eslint-plugin');
const noExtraArguments = require('./eslint-rules/no-extra-arguments.js');

// The project's own rules (eslint-rules/).
const local = { rules: { 'no-extra-arguments': noExtraArguments } };

const rules = {
    ...js.configs.recommended.rules,
    'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none' }],
    'no-shadow': ['error', { builtinGlobals: false, hoist: 'functions' }],
    'no-unreachable': 'error',
    'local/no-extra-arguments': ['error', { namespaces: ['Amber'] }],
    // An error caught from the network is replaced on purpose by a plain message for the householder.
    'preserve-caught-error': 'off',
    'no-var': 'error',
    'prefer-const': ['error', { destructuring: 'all' }],
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    '@stylistic/indent': ['error', 4, { SwitchCase: 1 }],
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: 'always' }],
    '@stylistic/semi': ['error', 'always']
};

module.exports = [
    {
        // Vendored libraries, built CSS and data are not ours to lint.
        ignores: ['node_modules/**', '*.min.js', 'css/**', 'data/**', 'test-results/**', 'playwright-report/**']
    },
    {
        files: ['**/*.js'],
        plugins: { '@stylistic': stylistic, local },
        linterOptions: { reportUnusedDisableDirectives: 'error' },
        rules
    },
    {
        // The app: classic scripts sharing window.Amber. The same files are `require`d by the Node
        // unit checks, hence `module` and `globalThis`. Chart and pdfjsLib are the vendored libraries.
        files: ['js/**/*.js', 'sw.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: {
                ...globals.browser,
                Chart: 'readonly',
                pdfjsLib: 'readonly',
                module: 'readonly'
            }
        }
    },
    {
        files: ['tests/unit-*.js', 'scripts/**/*.js', 'eslint-rules/**/*.js', '*.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node }
        }
    },
    {
        // Playwright specs run in Node, with page.evaluate callbacks that run in the page.
        files: ['tests/**/*.spec.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.browser, Amber: 'readonly', Chart: 'readonly' }
        }
    },
    {
        // The tests line up long assert conditions and tables of cases their own way.
        files: ['tests/**/*.js'],
        rules: {
            '@stylistic/indent': ['error', 4, { SwitchCase: 1, ArrayExpression: 'off', CallExpression: { arguments: 'off' } }]
        }
    }
];
