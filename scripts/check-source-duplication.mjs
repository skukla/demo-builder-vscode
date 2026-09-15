#!/usr/bin/env node
/**
 * The duplicated-source ratchet: copy-paste in `src/` may not grow.
 *
 * WHY THIS EXISTS, AND WHY IT IS A RATCHET RATHER THAN A BAN.
 *
 * The handbook's rule is "markup repeated in three or more places becomes a
 * component". Deciding whether two similar blocks SHOULD be one is a judgement —
 * `component-extraction-scan` is where that judgement is scheduled, and
 * `codebase-sweep` records the number at release cuts. None of that stops a third
 * copy being pasted on a Tuesday.
 *
 * Measured 2026-09-11, which is what turned this from an opinion into a check:
 *
 *   - `tests/sop/clone-pairs.ledger.json` scans `tests`, not `src`. Source
 *     duplication had NO automatic check of any kind.
 *   - `.claude/hooks/rules/30-reuse-first.rule` fires on WRITE of a path that does
 *     not exist yet and returns early when it does — "editing an existing component
 *     is not the reflex being guarded" — and fires once per session. Pasting the
 *     same block a third time into files that already exist is an Edit, so it sits
 *     outside that hook by design.
 *
 * So the only thing standing behind the rule was a guided review at release cuts.
 * This closes the half that is mechanical.
 *
 * WHAT IT DOES AND DOES NOT CLAIM. It counts clone pairs. It does NOT enforce
 * "three sites becomes a component" — a clone pair is two fragments, not a
 * three-site pattern, and nothing here can tell a pattern that should be shared
 * from two things that merely rhyme. Overstating that is the exact defect that
 * produced this check: the handbook cited `component-extraction.test.ts` for the
 * three-copies rule for as long as the entry existed, and that suite checks
 * abstract classes, HOC naming and generic wrappers — nothing about repeated
 * markup. The convention this enforces is worded as what it measures.
 *
 * THE NUMBER IS PARAMETER-BOUND. A run with different flags is a different metric,
 * not movement. The flags below are fixed here rather than passed in for that
 * reason, and they match `.claude/skills/code-duplication-scan/scan.sh` so the
 * scan and the ratchet cannot drift apart.
 *
 * JSON IS IGNORED, deliberately. Registry and schema files duplicate their own
 * STRUCTURE — seven such pairs at the time of writing — which is an inert floor
 * that moves when config is edited and says nothing about copy-paste in code.
 * Counting it would fire the ratchet on catalog work.
 *
 * Verified deterministic before pinning: two consecutive runs returned the same
 * count AND the same set of fragment pairs (symmetric difference 0). A ratchet on
 * a flapping number is worse than no ratchet.
 *
 * Usage:
 *   node scripts/check-source-duplication.mjs
 *   npm run validate:source-duplication
 *
 * Exit codes: 0 = at the pin; 1 = grew, or fell without the pin being lowered.
 */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = join(ROOT, 'scripts', 'source-duplication.ledger.json');

/** Fixed, and matching code-duplication-scan/scan.sh. Changing one changes the metric. */
const SCAN = {
    root: 'src',
    minLines: '8',
    minTokens: '60',
    ignore: '**/*.test.*,**/*.spec.*,**/*.json',
};

/**
 * Run jscpd and return its report.
 *
 * The JSON reporter writes to a directory, so this uses a throwaway one rather
 * than leaving a report in the repo for another instrument to trip over.
 */
function measure() {
    const out = mkdtempSync(join(tmpdir(), 'clonescan-'));
    try {
        execFileSync(
            'npx',
            [
                'jscpd',
                SCAN.root,
                '--min-lines',
                SCAN.minLines,
                '--min-tokens',
                SCAN.minTokens,
                '--reporters',
                'json',
                '--output',
                out,
                '--ignore',
                SCAN.ignore,
            ],
            { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' }
        );
        return JSON.parse(readFileSync(join(out, 'jscpd-report.json'), 'utf8'));
    } finally {
        rmSync(out, { recursive: true, force: true });
    }
}

/**
 * The FILE pairs a report covers, as stable sorted strings.
 *
 * File pairs rather than fragments with line numbers, because line numbers drift
 * on every edit and a list that goes stale on unrelated work teaches people to
 * regenerate it without reading it — the anchor-drift problem the mutation ledger
 * already pays for. A file pair survives edits inside the files.
 *
 * This list is DIAGNOSTIC. The count is what gates; the pairs are what let a
 * failure say which duplication is new instead of printing a number.
 */
function filePairsOf(report) {
    const pairs = new Set();
    for (const d of report.duplicates) {
        const [a, b] = [d.firstFile.name, d.secondFile.name].sort();
        pairs.add(`${a} <-> ${b}`);
    }
    return [...pairs].sort();
}

function main() {
    const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
    const report = measure();
    const count = report.duplicates.length;
    const pairs = filePairsOf(report);
    const ceiling = ledger.cloneCeiling;

    if (count === ceiling) {
        console.log(`source duplication: ${count} clone pairs, at the pin.`);
        return 0;
    }

    const known = new Set(ledger.filePairs);
    const added = pairs.filter((p) => !known.has(p));
    const gone = ledger.filePairs.filter((p) => !pairs.includes(p));

    if (count > ceiling) {
        console.error(
            `GREW_ABOVE_CEILING: source duplication is ${count}, pinned at ${ceiling}.\n\n` +
                'A new copy-paste block landed in src/. Share it, or say here why the two\n' +
                'must stay separate — variants that change independently are a real answer,\n' +
                'and welding those together is worse than the duplication.\n'
        );
        if (added.length) console.error(`New file pairs:\n  ${added.join('\n  ')}`);
        return 1;
    }

    console.error(
        `LOWER_THE_PIN: source duplication fell to ${count} from ${ceiling}.\n\n` +
            'Good — bank it, or it grows back. Set cloneCeiling to the new count and\n' +
            'replace filePairs with the list below.\n'
    );
    if (gone.length) console.error(`Cleared file pairs:\n  ${gone.join('\n  ')}`);
    console.error(`\nfilePairs:\n${JSON.stringify(pairs, null, 4)}`);
    return 1;
}

process.exit(main());
