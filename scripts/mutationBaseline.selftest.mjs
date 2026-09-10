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
import { classifyAt, compare, summarise, writeBaseline } from './mutationBaseline.mjs';

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

/**
 * E: openGaps must count code NO TEST ENTERS, not only code a test ran past.
 *
 * The first version counted survivors alone. An uncovered mutant is not a survivor, so
 * a module nothing tests came out at openGaps 0 — reading as FINISHED. Measured against
 * the live baseline on 2026-09-03: four of the ten modules then reading finished had
 * uncovered mutants, worst of them `diagnostics.ts` with seventy, and it had already
 * been reported as "genuinely finished at 18%".
 *
 * A survivor means a test ran and did not notice. An uncovered mutant means no test went
 * there at all — the worse case of the two, and it must not be the one that reads clean.
 */
function checkOpenGaps(label, rep, expected) {
    const row = summarise(write(`${label}.json`, rep))['src/x.ts'];
    const ok = row.openGaps === expected;
    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${label}: openGaps=${row.openGaps} expected=${expected}` +
            `  (survived=${row.survived} noCoverage=${row.noCoverage})`
    );
    return ok;
}

// Two uncovered BEHAVIOURAL mutants and one uncovered string. The string is wording;
// the other two are decisions nothing reaches. Finished would be a lie here.
const uncovered = report([
    [1, 'StringLiteral', 'NoCoverage'],
    [2, 'ConditionalExpression', 'NoCoverage'],
    [2, 'EqualityOperator', 'NoCoverage'],
]);
// The genuinely-clean case, so the check is not just "always non-zero".
const clean = report([
    [1, 'StringLiteral', 'Survived'],
    [2, 'ConditionalExpression', 'Killed'],
    [2, 'EqualityOperator', 'Killed'],
]);

/**
 * G/H: the classifier reads the whole STATEMENT, not the mutated line.
 *
 * A `x || 'unnamed'` on the second line of a wrapped `logger.debug(...)` is log
 * wording. Seen line-by-line it is a LogicalOperator on a line with no `logger` in
 * it, so it read as a branch, and the only route to zero was a ledger row saying
 * "the classifier cannot see this". Twenty-two such rows in one evening
 * (2026-09-03). H is the control in the other direction: the same operator in a
 * statement that is NOT a log call must still count as behaviour.
 */
function checkCategory(label, source, line, mutator, expected) {
    const lines = source.split('\n');
    const got = classifyAt(mutator, lines, line - 1);
    const ok = got === expected;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: classified=${got} expected=${expected}`);
    return ok;
}
const wrappedLog = [
    'const a = 1;',
    'this.logger.debug(',
    "    `[X] org=${org || 'unnamed'} ` +",
    "    `project=${project || 'unknown'}`",
    ');',
    'const b = 2;',
].join('\n');
const plainBranch = ['const a = 1;', "const name = org || 'unnamed';", 'const b = 2;'].join('\n');

const results = [
    check('A-padding-must-flag', before, padding, true),
    check('B-real-branch-must-pass', before, real, false),
    check('C-comparator-must-pass', beforeC, realC, false),
    check('D-newly-covered-must-pass', beforeD, realD, false),
    checkOpenGaps('E-uncovered-counts-as-a-gap', uncovered, 2),
    checkOpenGaps('F-wording-only-reads-finished', clean, 0),
    checkCategory('G-wrapped-log-is-wording', wrappedLog, 3, 'LogicalOperator', 'logPresentation'),
    checkCategory('H-plain-branch-stays-behaviour', plainBranch, 2, 'LogicalOperator', 'branch'),
];
console.log(results.every(Boolean) ? '\nALL CONTROLS PASSED' : '\nSELF-TEST FAILED');
const ok = results.every(Boolean);
rmSync(DIR, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
