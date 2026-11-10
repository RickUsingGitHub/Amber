'use strict';

/*
 * A local ESLint rule: a call that passes more arguments than the function takes. JavaScript
 * drops the extras silently, so they are usually a leftover from an older signature (or a sign
 * that the caller expects something the function doesn't do).
 *
 * It only looks at calls it can be sure about, inside one file:
 *   - a function declared in that file (`function f(a) {}` or `const f = (a) => {}`), called as `f(…)`;
 *   - a function put on the namespace in that file (`Amber.f = function (a) {}`), called as `Amber.f(…)`.
 * Functions that take `...rest` or read `arguments` are left alone, and so are calls with `...spread`.
 */

function isFunction(node) {
    return !!node && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');
}

module.exports = {
    meta: {
        type: 'problem',
        docs: { description: 'disallow calling a function with more arguments than it takes' },
        schema: [{
            type: 'object',
            properties: { namespaces: { type: 'array', items: { type: 'string' } } },
            additionalProperties: false
        }],
        messages: {
            extra: '\'{{name}}\' takes {{takes}} argument{{s}} but is called with {{given}}.'
        }
    },
    create(context) {
        const sourceCode = context.sourceCode;
        const namespaces = new Set((context.options[0] && context.options[0].namespaces) || []);
        const members = new Map();      // 'Amber.name' -> function node, or null when assigned twice
        const memberCalls = [];

        /** How many arguments the function takes, or null when it takes any number. */
        function arity(fn) {
            if (fn.params.some((p) => p.type === 'RestElement')) return null;
            if (fn.type !== 'ArrowFunctionExpression') {
                const scope = sourceCode.scopeManager.acquire(fn);
                const args = scope && scope.set.get('arguments');
                if (args && args.references.length) return null;
            }
            return fn.params.length;
        }

        /** The one function a name always refers to, or null when that can't be known. */
        function localFunction(node) {
            let scope = sourceCode.getScope(node);
            let variable = null;
            while (scope && !variable) {
                variable = scope.set.get(node.name) || null;
                scope = scope.upper;
            }
            if (!variable || variable.defs.length !== 1) return null;
            const def = variable.defs[0];
            if (variable.references.some((ref) => ref.isWrite() && !ref.init)) return null;
            if (def.type === 'FunctionName' && def.node.type === 'FunctionDeclaration') return def.node;
            if (def.type === 'Variable' && def.node.id.type === 'Identifier' && isFunction(def.node.init)) return def.node.init;
            return null;
        }

        function memberName(node) {
            if (node.type !== 'MemberExpression' || node.computed) return null;
            if (node.object.type !== 'Identifier' || !namespaces.has(node.object.name)) return null;
            return `${node.object.name}.${node.property.name}`;
        }

        function check(call, fn, name) {
            if (call.arguments.some((a) => a.type === 'SpreadElement')) return;
            const takes = arity(fn);
            if (takes == null || call.arguments.length <= takes) return;
            context.report({
                node: call.arguments[takes],
                messageId: 'extra',
                data: { name, takes, s: takes === 1 ? '' : 's', given: call.arguments.length }
            });
        }

        return {
            AssignmentExpression(node) {
                const name = memberName(node.left);
                if (!name) return;
                members.set(name, members.has(name) || node.operator !== '=' || !isFunction(node.right) ? null : node.right);
            },
            CallExpression(node) {
                if (node.callee.type === 'Identifier') {
                    const fn = localFunction(node.callee);
                    if (fn) check(node, fn, node.callee.name);
                    return;
                }
                const name = memberName(node.callee);
                if (name) memberCalls.push({ node, name });
            },
            'Program:exit'() {
                memberCalls.forEach(({ node, name }) => {
                    const fn = members.get(name);
                    if (fn) check(node, fn, name);
                });
            }
        };
    }
};
