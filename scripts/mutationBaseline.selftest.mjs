#!/usr/bin/env node
/**
 * Self-test for the mutation ratchet: plants each regression shape into a COPY of
 * the baseline and asserts the comparator catches it.
 *
 * Works on copies in a temp dir — the first dogfooding pass of the backlog CLI
 * destroyed uncommitted work by reverting the real files with `git checkout`, and
 * that lesson applies to every instrument that writes.
 *
 * A scan's first real run usually finds a bug in the scan. This is where that
 * happens for this one.
 */
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { compare } from './mutationBaseline.mjs';

const REPORT = 'reports/mutation/pl22.json';
const BASELINE = 'reports/mutation/baseline.json';
const TARGET = 'src/features/prerequisites/handlers/installHandler.ts';

const dir = mkdtempSync(join(tmpdir(), 'mutratchet-'));
const base = JSON.parse(readFileSync(BASELINE, 'utf8'));

let failures = 0;

function check(label, mutate, shouldCatch, expectText) {
    const copy = JSON.parse(JSON.stringify(base));
    mutate(copy);
    const path = join(dir, `b-${label.replace(/\W+/g, '-')}.json`);
    writeFileSync(path, JSON.stringify(copy));

    const { problems } = compare(REPORT, path);
    const caught = problems.length > 0;
    const textOk = !expectText || problems.some((p) => p.includes(expectText));
    const ok = caught === shouldCatch && textOk;
    if (!ok) failures++;
    console.log(
        `  ${ok ? 'OK  ' : '*** WRONG ***'}  ${label.padEnd(46)} ` +
            `caught=${caught} expected=${shouldCatch}`
    );
    if (!ok && problems.length) console.log(`        got: ${problems[0]}`);
}

console.log('Mutation ratchet self-test\n');

check(
    'unchanged baseline passes',
    () => {},
    false
);

check(
    'score fell',
    (b) => {
        b.modules[TARGET].score = 90;
    },
    true,
    'score FELL'
);

check(
    'score rose but branch/block did NOT fall (gaming)',
    (b) => {
        // Pretend we were at 30% with the SAME branch/block survivor count.
        // The real report scores higher with the same 89 — that is a score bought
        // without constraining a single decision.
        b.modules[TARGET].score = 30;
        b.modules[TARGET].highValueSurvivors = 89;
    },
    true,
    'did not fall'
);

check(
    'score rose AND branch/block fell (a real improvement)',
    (b) => {
        b.modules[TARGET].score = 30;
        b.modules[TARGET].highValueSurvivors = 200;
    },
    false
);

check(
    'uncovered mutants rose',
    (b) => {
        b.modules[TARGET].noCoverage = 0;
    },
    true,
    'uncovered mutants ROSE'
);

check(
    'a baseline module vanished from the run',
    (b) => {
        b.modules['src/features/ghost/notMutated.ts'] = {
            score: 100, killed: 1, survived: 0, noCoverage: 0, timeout: 0,
            survivorCategories: {}, highValueSurvivors: 0,
        };
    },
    true,
    'NOT in this run'
);

check(
    'a mutated module has no baseline row',
    (b) => {
        delete b.modules[TARGET];
    },
    true,
    'NO baseline row'
);

// NEGATIVE CONTROL: prove `check` can report WRONG. Without this a broken
// comparison helper would print a column of confident OKs.
console.log('\n  negative control (this line MUST say WRONG):');
check('deliberately mis-declared expectation', () => {}, true);
failures--; // that one was supposed to fail

console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} case(s) wrong`}`);
process.exit(failures === 0 ? 0 : 1);
