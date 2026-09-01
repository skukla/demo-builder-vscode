/**
 * A bare `jest.mock` of a module `moduleNameMapper` already redirects does nothing.
 *
 *   jest.mock('vscode');                  <- dead: the mapping wins either way
 *   jest.mock('vscode', () => ({ ... }))  <- alive: a factory OVERRIDES the mapping
 *
 * That distinction is the whole rule, and it is exact — no suite run needed. It is
 * the static half of the `dead-mock-scan` skill, whose handbook entry said "Not
 * enforced — it is a question to ask, not a state to hold." True of the skill's
 * other half (delete the mock, re-run the suite, see if anything notices), and
 * false of this one: a bare automock of a mapped module IS a state in the tree.
 *
 * This ships as a FLAT BAN rather than a shrink-only ledger because the corpus was
 * already zero when it was written (measured 2026-09-01: 1,301 test files, 6 mapped
 * keys, 0 hits). Same precedent as the feature-barrel ledger, which became a ban the
 * day it emptied — a ceiling of zero and a ban are the same rule, and the ban is the
 * one that explains itself in the failure message.
 *
 * Why it matters at all: a mock nothing needs still READS as a claim — "this suite
 * would reach the network without me" — and that claim is what grows a preamble to
 * sixteen lines nobody dares touch. Four suite families carried copies of exactly
 * this line before the 2026-08 sweep.
 */

import * as fs from 'fs';
import * as path from 'path';

const testsDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(testsDir, '..');

/** The exact `^name$` keys in jest.config.js's moduleNameMapper. */
function mappedModules(): Set<string> {
    const cfg = fs.readFileSync(path.join(repoRoot, 'jest.config.js'), 'utf-8');
    return new Set(Array.from(cfg.matchAll(/'\^([\w./@-]+)\$':/g), (m) => m[1]));
}

/**
 * Blank out comments, preserving offsets.
 *
 * The scan's own first run reported a `jest.mock('vscode')` written inside a
 * DOCBLOCK — a sentence about the rule, not a call. A detector that reads prose as
 * code keeps finding whatever the documentation mentions, which is the worst kind
 * of false positive: the text usually describes a real instance somewhere else.
 */
function stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
}

/** Every `jest.mock('x')` with no factory argument. */
export function bareAutomocks(src: string): string[] {
    const clean = stripComments(src);
    const found: string[] = [];
    for (const m of clean.matchAll(/jest\.mock\(\s*'([^']+)'/g)) {
        // Walk to the call's closing paren, counting depth, so a factory
        // containing parens does not end the call early.
        let depth = 0;
        let k = clean.indexOf('(', m.index);
        for (; k < clean.length; k++) {
            if (clean[k] === '(') depth++;
            else if (clean[k] === ')') {
                depth--;
                if (depth === 0) break;
            }
        }
        const args = clean.slice(clean.indexOf('(', m.index) + 1, k);
        // One argument means an automock; a comma at depth zero means a factory.
        if (!/,/.test(args.replace(/'[^']*'/g, ''))) found.push(m[1]);
    }
    return found;
}

function testFiles(dir: string): string[] {
    const out: string[] = [];
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...testFiles(full));
        else if (/\.(test|testUtils)\.tsx?$/.test(e.name)) out.push(full);
    }
    return out;
}

describe('a mock that does nothing is not written', () => {
    const mapped = mappedModules();
    const files = testFiles(testsDir);

    it('no test bare-automocks a module moduleNameMapper already redirects', () => {
        const offenders: string[] = [];
        for (const f of files) {
            // This file's own controls hold the banned line as STRING LITERALS, and
            // the detector strips comments but not strings — so on its first run it
            // reported itself, three times. Same trap the skill's detector documents
            // for docblocks, one layer over, and the same fix the cast ledger uses.
            // Nothing else in the tree writes jest.mock inside a string.
            if (path.resolve(f) === path.resolve(__filename)) continue;
            const src = fs.readFileSync(f, 'utf-8');
            for (const mod of bareAutomocks(src)) {
                if (mapped.has(mod)) {
                    offenders.push(`${path.relative(repoRoot, f)}  jest.mock('${mod}')`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    /**
     * A ban whose corpus is empty passes whether or not it can see anything, so the
     * controls are the only evidence it works. All four, in both directions.
     */
    it('CONTROL: the detector fires on a bare automock and stays quiet on the rest', () => {
        // Positive: this is the exact line the rule bans.
        expect(bareAutomocks("jest.mock('vscode');")).toEqual(['vscode']);

        // Negative 1: a factory OVERRIDES the mapping, so it is not dead.
        expect(bareAutomocks("jest.mock('vscode', () => ({ window: {} }));")).toEqual([]);

        // Negative 2: a factory whose body contains parens must not end the call early.
        expect(bareAutomocks("jest.mock('uuid', () => ({ v4: jest.fn(() => 'x') }));")).toEqual(
            [],
        );

        // Negative 3: prose about the rule is not the rule being broken.
        expect(bareAutomocks("/** like jest.mock('vscode'); */")).toEqual([]);
        expect(bareAutomocks("// jest.mock('vscode');")).toEqual([]);
    });

    it('CONTROL: it actually read the tree and the mapper', () => {
        // Either number silently reaching zero would make the ban above vacuous:
        // no files to scan, or no module names to match against.
        expect(files.length).toBeGreaterThan(1000);
        expect(mapped.size).toBeGreaterThanOrEqual(6);
        expect(mapped.has('vscode')).toBe(true);
    });
});
