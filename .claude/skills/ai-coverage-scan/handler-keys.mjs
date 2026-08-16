#!/usr/bin/env node
/**
 * Extract the TOP-LEVEL keys of every `defineHandlers({ ... })` map.
 *
 * The regex the shell scan uses matches handler keys across a whole FILE, so it
 * also catches object properties inside handler bodies — `auth:
 * context.authManager`, and `success`/`data`/`context`/`error` in returned
 * objects. Measured 2026-08-16: it reported 31 unexposed data-installer
 * handlers where reading the maps gives 9. The same inflation applies to every
 * map it reports, which made the whole coverage gap unusable for sizing work.
 *
 * A line-based depth counter was tried first and ALSO failed its control:
 * handler bodies span lines, so depth at the newline says nothing about depth
 * where the key sits. This walks characters, tracks brace depth, and skips
 * strings, template literals, regexes and comments — the constructs that
 * otherwise contain stray braces and colons.
 *
 * Usage:  node handler-keys.mjs <file...>        # one "file<TAB>key" per line
 *         node handler-keys.mjs --self-test      # controls, exits non-zero on failure
 */

import fs from 'fs';

/**
 * Top-level keys of each `defineHandlers({...})` object in `src`.
 *
 * @param {string} src file contents
 * @returns {string[]} keys in source order (duplicates preserved — two maps in
 *   one file legitimately share a key name)
 */
export function handlerKeys(src) {
    const keys = [];
    const START = /export const \w+ = defineHandlers\(\{/g;
    let m;

    while ((m = START.exec(src)) !== null) {
        let i = m.index + m[0].length; // just past the opening brace
        let depth = 1;
        let atKeyPosition = true; // start of an element, so a key may follow

        while (i < src.length && depth > 0) {
            const c = src[i];
            const two = src.slice(i, i + 2);

            // ── skip constructs that carry braces/colons we must not count ──
            if (two === '//') {
                const nl = src.indexOf('\n', i);
                i = nl === -1 ? src.length : nl;
                continue;
            }
            if (two === '/*') {
                const end = src.indexOf('*/', i + 2);
                i = end === -1 ? src.length : end + 2;
                continue;
            }
            if (c === '"' || c === "'" || c === '`') {
                // A quoted KEY is what we are looking for, but only at depth 1
                // and only when an element is expected.
                if (depth === 1 && atKeyPosition) {
                    const q = c;
                    let j = i + 1;
                    let value = '';
                    while (j < src.length && src[j] !== q) {
                        if (src[j] === '\\') j++;
                        else value += src[j];
                        j++;
                    }
                    // Followed by a colon? Then it is a key, not a value.
                    let k = j + 1;
                    while (k < src.length && /\s/.test(src[k])) k++;
                    if (src[k] === ':') {
                        keys.push(value);
                        atKeyPosition = false;
                    }
                    i = j + 1;
                    continue;
                }
                // Otherwise consume the literal wholesale.
                const q = c;
                let j = i + 1;
                while (j < src.length && src[j] !== q) {
                    if (src[j] === '\\') j++;
                    j++;
                }
                i = j + 1;
                continue;
            }

            if (c === '{' || c === '(' || c === '[') depth++;
            else if (c === '}' || c === ')' || c === ']') depth--;
            else if (c === ',' && depth === 1) atKeyPosition = true;
            else if (depth === 1 && atKeyPosition && /[A-Za-z_$]/.test(c)) {
                // Bare identifier key: read it, then require a colon.
                let j = i;
                let name = '';
                while (j < src.length && /[\w$]/.test(src[j])) name += src[j++];
                let k = j;
                while (k < src.length && /\s/.test(src[k])) k++;
                if (src[k] === ':') {
                    keys.push(name);
                    atKeyPosition = false;
                }
                i = j;
                continue;
            }
            i++;
        }
    }
    return keys;
}

// ── self-test ────────────────────────────────────────────────────────────────
if (process.argv.includes('--self-test')) {
    const cases = [
        {
            name: 'nested object properties are NOT keys',
            src: `export const x = defineHandlers({
                'start-import': async (ctx) => {
                    const deps = { auth: ctx.authManager, logger: ctx.logger };
                    return { success: true, data: { context: 1, error: null } };
                },
                'reset': async () => ({ success: true }),
            });`,
            expect: ['start-import', 'reset'],
        },
        {
            name: 'braces inside strings and comments do not shift depth',
            src: `export const y = defineHandlers({
                a: async () => { /* } not a close */ return \`{ "x": 1 }\`; },
                b: async () => "}" ,
            });`,
            expect: ['a', 'b'],
        },
        {
            name: 'quoted and bare keys both count',
            src: `export const z = defineHandlers({ 'kebab-one': f, bareTwo: g });`,
            expect: ['kebab-one', 'bareTwo'],
        },
    ];
    let failed = 0;
    for (const c of cases) {
        const got = handlerKeys(c.src);
        const ok = JSON.stringify(got) === JSON.stringify(c.expect);
        if (!ok) failed++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
        if (!ok) console.log(`        expected ${JSON.stringify(c.expect)}\n        got      ${JSON.stringify(got)}`);
    }
    process.exit(failed ? 1 : 0);
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const f of files) {
    for (const k of handlerKeys(fs.readFileSync(f, 'utf8'))) {
        console.log(`${f}\t${k}`);
    }
}
