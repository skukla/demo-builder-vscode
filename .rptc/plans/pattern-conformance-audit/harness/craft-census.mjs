#!/usr/bin/env node
/**
 * Test-CRAFT census (PL-10/PL-11, owner-ordered 2026-08-28): every suite
 * classified against the accepted craft patterns and the test-double styles.
 * Same instrument discipline as the code audit: git-derived denominator, one
 * row per suite, built-in self-tests proving each detector fires on a known
 * bad example before its zeros count.
 *
 * Detectors (file-level, regex-based — coarser than an AST; each flag is a
 * LEAD for adjudication, not a verdict):
 *   theater        — a suite with it()/test() blocks but ZERO expect() calls
 *   onlySkip       — .only / .skip / xit / xdescribe leftovers
 *   nondeterminism — Math.random / un-mocked Date.now in test code
 *   realWaits      — hand-rolled setTimeout waits (excluding fake-timer use)
 *   doubleStyle    — module-mock WALL (>5 jest.mock) vs deps-object vs mixed
 *
 * RETIRED 2026-08-30 — `logicInTests` (owner-approved). It matched `for`/`while`
 * at the start of a line, which is a SHAPE, not a defect. The defect that phrase
 * names is a test re-implementing its subject and therefore agreeing with its
 * bugs; a loop is neither necessary nor sufficient for that, and detecting it
 * statically is not cheap.
 *
 * What settled it: extracting a duplicated block into a shared helper is
 * unambiguously an improvement, and it ADDS a function to a test file, which the
 * detector counted against you. The duplication lane and this column therefore
 * returned opposite verdicts on the same commit. A metric a good change can move
 * the wrong way is describing style.
 *
 * Do not re-add it without a detector that fires on the DEFECT. The test to apply
 * to any replacement: name a clean file it would flag, and a buggy one it would
 * miss. If both exist, it is the same column under a new name.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const HARNESS = new URL('.', import.meta.url).pathname;
const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const suites = execSync(
    `git ls-files 'tests/**/*.test.ts' 'tests/**/*.test.tsx' 'tests/*.test.ts' 'tests/*.test.tsx'`,
    { encoding: 'utf8', cwd: ROOT },
).trim().split('\n');

const detectors = {
    theater: (s) => /\b(it|test)\s*\(/.test(s) && !/\bexpect\s*\(/.test(s),
    onlySkip: (s) => /\.(only|skip)\s*\(|\bxit\s*\(|\bxdescribe\s*\(/.test(s),
    nondeterminism: (s) => /Math\.random\s*\(/.test(s) ||
        (/Date\.now\s*\(/.test(s) && !/useFakeTimers|jest\.mock\(['"].*date/i.test(s)),
    realWaits: (s) => /new Promise\s*\(\s*(\w+|\(\w*\))\s*=>\s*setTimeout/.test(s) &&
        !/useFakeTimers/.test(s),
};

function doubleStyle(s) {
    const walls = (s.match(/^jest\.mock\(/gm) ?? []).length;
    const actual = /jest\.requireActual/.test(s);
    if (walls > 5) return actual ? 'wall+partial' : 'module-wall';
    if (walls === 0) return 'deps-object-or-pure';
    return 'light-mocks';
}

// ── Self-tests: every detector must fire on a known-bad snippet ─────────────
const SELFTEST = {
    theater: `it('runs', () => { doThing(); });`,
    onlySkip: `it.only('x', () => { expect(1).toBe(1); });`,
    nondeterminism: `const n = Math.random();`,
    realWaits: `await new Promise((r) => setTimeout(r, 500));`,
};
for (const [name, snippet] of Object.entries(SELFTEST)) {
    if (!detectors[name](snippet)) {
        console.error(`SELFTEST FAILED: detector "${name}" missed its known-bad snippet`);
        process.exit(2);
    }
}

const rows = suites.map((f) => {
    const s = readFileSync(`${ROOT}/${f}`, 'utf8');
    const flags = Object.entries(detectors).filter(([, fn]) => fn(s)).map(([n]) => n);
    return { unit: f, flags, doubleStyle: doubleStyle(s) };
});
if (rows.length !== suites.length) {
    console.error(`NOT DONE: ${rows.length}/${suites.length}`);
    process.exit(1);
}
writeFileSync(`${HARNESS}/craft-census.json`, JSON.stringify({ rows }, null, 1));

const flagCounts = {};
const styleCounts = {};
for (const r of rows) {
    for (const fl of r.flags) flagCounts[fl] = (flagCounts[fl] ?? 0) + 1;
    styleCounts[r.doubleStyle] = (styleCounts[r.doubleStyle] ?? 0) + 1;
}
console.log(`census: ${rows.length}/${suites.length} suites | selftests: all detectors fired`);
console.log('flags:', JSON.stringify(flagCounts));
console.log('double styles:', JSON.stringify(styleCounts));
for (const fl of Object.keys(detectors)) {
    const hits = rows.filter((r) => r.flags.includes(fl));
    if (hits.length && hits.length <= 12) {
        console.log(`-- ${fl}:`);
        for (const h of hits) console.log('   ', h.unit);
    }
}
