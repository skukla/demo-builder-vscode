#!/usr/bin/env node
/**
 * Controls for the mutation ratchet's "score rose without constraining anything" rule.
 *
 * That rule exists to catch a score raised by asserting log strings rather than by
 * testing behaviour. It is a heuristic, so it needs controls in BOTH directions: it
 * must still fire on real padding, and must not fire on real work.
 *
 * Control C is the case that made this file exist. On 2026-09-02 six mutants died on
 * two `.sort()` comparators — as text, Node 8 sorts after Node 20, which is a defect
 * the user sees — and the rule reported the run as padding, because it counted only
 * branch and block survivors and a comparator is neither.
 *
 * Run directly (`node scripts/mutationBaseline.selftest.mjs`) or via its jest wrapper.
 */
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compare, summarise, writeBaseline } from './mutationBaseline.mjs';

const DIR = mkdtempSync(join(tmpdir(), 'mutation-ratchet-selftest-')) + '/';
const SRC = ['const msg = `hello ${name}`;', 'if (a && b) { run(); }', 'xs.sort((a,b)=>a-b);'].join('\n');

/** A Stryker-shaped report. `spec` is [line, mutatorName, status] triples. */
function report(spec) {
    return {
        files: {
            'src/x.ts': {
                source: SRC,
                mutants: spec.map(([line, mutatorName, status], id) => ({
                    id: String(id), mutatorName, status,
                    location: { start: { line, column: 1 }, end: { line, column: 2 } },
                })),
            },
        },
    };
}
function write(name, obj) { const p = DIR + name; writeFileSync(p, JSON.stringify(obj)); return p; }

// BEFORE: one string survivor (line 1, a log-ish template) + one branch survivor + one killed.
const before = report([[1,'StringLiteral','Survived'], [2,'ConditionalExpression','Survived'], [2,'EqualityOperator','Killed']]);
// A: the string survivor now dies. Score rises; behaviour unchanged. MUST FLAG.
const padding = report([[1,'StringLiteral','Killed'], [2,'ConditionalExpression','Survived'], [2,'EqualityOperator','Killed']]);
// B: the BRANCH survivor dies instead. MUST PASS.
const real    = report([[1,'StringLiteral','Survived'], [2,'ConditionalExpression','Killed'], [2,'EqualityOperator','Killed']]);
// C: a comparator mutant dies — the 2026-09-02 case the old rule wrongly flagged. MUST PASS.
const beforeC = report([[3,'ArrowFunction','Survived'], [2,'ConditionalExpression','Survived'], [2,'EqualityOperator','Killed']]);
const realC   = report([[3,'ArrowFunction','Killed'],   [2,'ConditionalExpression','Survived'], [2,'EqualityOperator','Killed']]);

function check(label, beforeRep, afterRep, mustFlag, stripCategories = false) {
    const bp = write(`before-${label}.json`, beforeRep);
    const blp = DIR + `baseline-${label}.json`;
    writeBaseline(bp, blp, 'selftest');
    if (stripCategories) {
        const b = JSON.parse(readFileSync(blp, 'utf8'));
        for (const r of Object.values(b.modules)) delete r.survivorCategories;
        writeFileSync(blp, JSON.stringify(b));
    }
    const ap = write(`after-${label}.json`, afterRep);
    const { problems } = compare(ap, blp);
    const flagged = problems.some((p) => p.includes('score ROSE'));
    const ok = flagged === mustFlag;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: flagged=${flagged} expected=${mustFlag}`);
    if (!ok) console.log('   problems:', problems);
    return ok;
}

// D: previously-unreachable code becomes covered. Score rises, a survivor appears where
// there was no coverage at all — real progress that the rule must not call padding.
const beforeD = report([[1,'StringLiteral','Survived'], [2,'ConditionalExpression','NoCoverage'], [2,'EqualityOperator','NoCoverage']]);
const realD   = report([[1,'StringLiteral','Survived'], [2,'ConditionalExpression','Survived'], [2,'EqualityOperator','Killed']]);

const results = [
    check('A-padding-must-flag', before, padding, true),
    check('B-real-branch-must-pass', before, real, false),
    check('C-comparator-must-pass', beforeC, realC, false),
    check('D-newly-covered-must-pass', beforeD, realD, false),
];
console.log(results.every(Boolean) ? '\nALL CONTROLS PASSED' : '\nSELF-TEST FAILED');
const ok = results.every(Boolean);
rmSync(DIR, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
