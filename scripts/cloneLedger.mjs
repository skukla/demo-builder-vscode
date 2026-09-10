#!/usr/bin/env node
/**
 * The duplication burn-down, keyed to the MEASUREMENT rather than to a proxy.
 *
 * WHY THIS EXISTS. The split-family ledger asked "does this family have a shared
 * setup file?" and stood in for "is there duplication?". On 2026-09-02 that
 * proxy reached ZERO while the duplicate-block count sat at 67 — 50 of them
 * inside families the proxy had just marked done, and the single largest pair
 * (two picker suites, ~529 lines) belonging to no family at all, so nothing had
 * ever looked at it. A worklist that is not the measurement will always end
 * this way: it finishes, and the thing it was standing in for does not move.
 *
 * So the worklist here IS the scanner's output. Every duplicate block jscpd
 * finds is an item, and an item ends in exactly one of two states:
 *
 *   FIXED        the block is gone; it stops appearing, and its ledger row must
 *                leave with it (a stale row fails `check`)
 *   ADJUDICATED  somebody read it and wrote down why it should stay
 *
 * The burn-down number is the count of blocks in neither state. It cannot be
 * gamed by editing a list, because the list is regenerated from the code.
 *
 * KEYED ON THE FILE PAIR, NOT LINE NUMBERS. Line numbers move on every edit, so
 * an item keyed on them loses its identity the moment anyone touches the file
 * and comes back as new work forever. Two files either duplicate something or
 * they do not; that is the durable fact. Several blocks between the same pair
 * collapse to one item, which is right — you fix them in one sitting.
 *
 * BEFORE YOU FIX A PAIR, BREAK THE CODE IT TESTS.
 *
 * The first item worked through this ledger was two picker suites duplicating
 * ~529 lines. They looked like the same tests written twice, and the obvious fix
 * was to share them. Four deliberate miswirings of the component said otherwise:
 * an emptied search-field list, a wrong cache key, and a `messageType` asking the
 * backend for the WRONG ENTITY all left seventeen tests green.
 *
 * The suites mocked the collaborator, so every assertion about the screen was an
 * assertion about what the mock had been told to return. They were duplicated
 * BECAUSE they were shallow — two files saying nothing in the same shape — and
 * sharing them would have made that permanent in one tidy helper.
 *
 * So the first step on any pair is a probe, not a plan:
 *
 *   1. Break something the duplicated tests claim to cover — one line in the
 *      source, something a person could plausibly get wrong.
 *   2. Run the suites. Caught?
 *   3. Restore, and repeat two or three times.
 *
 * Caught every time  -> the duplication is real; share it.
 * Survives           -> the tests are shallow. Fix what they assert FIRST; the
 *                       duplication usually dissolves, because tests that assert
 *                       what each caller actually does stop being copies.
 *
 * Two minutes per pair, and on item one it inverted the answer.
 *
 * AND CHECK THE BODIES, NOT THE NAMES. On 2026-09-02 an extraction was built on
 * "all three suites mock the same five modules" — true, and useless. Hashing the
 * mock BODIES showed only one of the five agreed across even two of the three:
 * one suite's hook double captures callbacks off the props because that is what
 * that suite is about, and the three component stubs each render what their own
 * suite queries. The extraction broke six tests before it was reverted and the
 * pair adjudicated as variants.
 *
 * Comparing module names is the cheap check that feels like the real one.
 *
 * Usage:
 *   node scripts/cloneLedger.mjs list        every unadjudicated pair, biggest first
 *   node scripts/cloneLedger.mjs next        just the next one to work
 *   node scripts/cloneLedger.mjs adjudicate <key> "<reason>"
 *   node scripts/cloneLedger.mjs check       CI/sweep gate; non-zero on a problem
 *
 * `--json` on `list`/`next` for the agent-facing form.
 */

import { execFileSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER_PATH = join(ROOT, 'tests/sop/clone-pairs.ledger.json');

/** The scan parameters. Changing these changes what counts as a duplicate. */
const SCAN = { minLines: '20', minTokens: '140', target: 'tests' };

/** A reason has to say something. Eight words is the same bar the family ledger uses. */
const MIN_REASON_WORDS = 8;

function loadLedger() {
    const raw = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
    return { ...raw, adjudicated: raw.adjudicated ?? {} };
}

function saveLedger(ledger) {
    writeFileSync(LEDGER_PATH, `${JSON.stringify(ledger, null, 2)}\n`);
}

/** Sorted file pair — the durable identity of a duplication between two files. */
function keyFor(a, b) {
    return [a, b].sort().join('  ::  ');
}

/**
 * Run the scanner and collapse its blocks into one item per file pair.
 *
 * @returns {Array<{key: string, files: string[], blocks: number, lines: number}>}
 */
export function currentPairs() {
    const out = mkdtempSync(join(tmpdir(), 'clone-ledger-'));
    try {
        execFileSync(
            'npx',
            [
                'jscpd',
                SCAN.target,
                '--min-lines',
                SCAN.minLines,
                '--min-tokens',
                SCAN.minTokens,
                '--reporters',
                'json',
                '--output',
                out,
            ],
            { cwd: ROOT, stdio: 'ignore' }
        );
        const report = join(out, 'jscpd-report.json');
        if (!existsSync(report)) {
            throw new Error('jscpd produced no report — the scan did not run');
        }
        const { duplicates } = JSON.parse(readFileSync(report, 'utf8'));
        const byKey = new Map();
        for (const d of duplicates) {
            const a = d.firstFile.name;
            const b = d.secondFile.name;
            const key = keyFor(a, b);
            const row = byKey.get(key) ?? { key, files: [a, b].sort(), blocks: 0, lines: 0 };
            row.blocks += 1;
            row.lines += d.lines;
            byKey.set(key, row);
        }
        return [...byKey.values()].sort((x, y) => y.lines - x.lines);
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
}

function outstanding(pairs, ledger) {
    return pairs.filter((p) => !(p.key in ledger.adjudicated));
}

function render(rows, asJson) {
    if (asJson) {
        console.log(JSON.stringify(rows, null, 2));
        return;
    }
    if (rows.length === 0) {
        console.log('nothing outstanding — every duplicate block is fixed or adjudicated');
        return;
    }
    for (const r of rows) {
        console.log(`${String(r.lines).padStart(5)} lines  ${r.blocks} block(s)`);
        console.log(`        ${r.files[0]}`);
        console.log(`        ${r.files[1]}`);
    }
    console.log(`\n${rows.length} pair(s) outstanding`);
}

function main() {
    const [command, ...rest] = process.argv.slice(2);
    const asJson = rest.includes('--json');
    const ledger = loadLedger();

    if (command === 'list' || command === 'next' || !command) {
        const rows = outstanding(currentPairs(), ledger);
        render(command === 'next' ? rows.slice(0, 1) : rows, asJson);
        return;
    }

    if (command === 'adjudicate') {
        const [key, reason] = rest.filter((a) => a !== '--json');
        if (!key || !reason) {
            console.error('usage: adjudicate <key> "<reason>"');
            process.exit(2);
        }
        if (reason.trim().split(/\s+/).length < MIN_REASON_WORDS) {
            console.error(`REFUSED: a reason needs at least ${MIN_REASON_WORDS} words.`);
            process.exit(2);
        }
        const pairs = currentPairs();
        if (!pairs.some((p) => p.key === key)) {
            console.error('REFUSED: that pair does not currently duplicate anything.');
            process.exit(2);
        }
        ledger.adjudicated[key] = reason;
        saveLedger(ledger);
        console.log(`adjudicated: ${key}`);
        return;
    }

    if (command === 'check') {
        const pairs = currentPairs();
        const keys = new Set(pairs.map((p) => p.key));
        const problems = [];

        // A row whose duplication is gone must leave — otherwise the ledger
        // slowly fills with excuses for code that no longer exists.
        const stale = Object.keys(ledger.adjudicated).filter((k) => !keys.has(k));
        if (stale.length) {
            problems.push(`${stale.length} adjudicated row(s) no longer duplicate:\n  ${stale.join('\n  ')}`);
        }
        const thin = Object.entries(ledger.adjudicated)
            .filter(([, reason]) => reason.trim().split(/\s+/).length < MIN_REASON_WORDS)
            .map(([k]) => k);
        if (thin.length) {
            problems.push(`${thin.length} reason(s) say nothing:\n  ${thin.join('\n  ')}`);
        }

        const left = outstanding(pairs, ledger);
        // LINES as well as pairs. A pair that shrinks stays on the list — two files
        // either duplicate or they do not — so the pair count alone reports no
        // movement for an item that removed 40 lines. Both numbers, or the loop
        // looks stalled while it is working (2026-09-02).
        const lines = left.reduce((sum, p) => sum + p.lines, 0);
        console.log(
            `${pairs.length} duplicate pair(s); ${pairs.length - left.length} adjudicated; ` +
                `${left.length} outstanding (${lines} duplicated lines)`
        );
        if (problems.length) {
            console.error(`\nclone ledger check FAILED:\n\n${problems.join('\n\n')}`);
            process.exit(1);
        }
        return;
    }

    console.error(`unknown command: ${command}`);
    process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}
