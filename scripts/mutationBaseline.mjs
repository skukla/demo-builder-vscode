/**
 * The mutation ratchet — shared classification, baseline writer, and comparator.
 *
 * WHY A CATEGORY SPLIT AND NOT JUST A SCORE. A mutation score is trivially gamed:
 * asserting a few more log strings raises it while making nothing safer. So the
 * baseline records survivors BY WHAT THE MUTATED LINE DOES, and the check refuses
 * a run where the score went up while the branch-and-block count did not go down.
 * That is the only shape in which "we improved coverage" is a checkable claim.
 *
 * WHY IT IS NOT A JEST SUITE. A mutation run takes minutes to hours — 16m15s for
 * eight modules — so it cannot run per build. The ratchet applies when the
 * instrument is RUN, and `tests/sop/mutation-config-pairing.test.ts` covers the
 * per-build half: that every mutated module has a baseline row and a test selected.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';

/** A line that only feeds a logger is presentation. Mutating it proves nothing. */
const LOGGY = /[Ll]ogger|\.log\(|\.debug\(|\.warn\(|\.info\(|\.error\(|\.trace\(/;

/**
 * Categories, ordered by how much a survivor there should worry you.
 *
 * `branch` and `block` are the ones worth paying for: a decision nothing
 * constrains, or a body that can be deleted whole. Those two are the ratchet's
 * real subject; the rest are recorded so the split stays visible.
 */
export const HIGH_VALUE = ['branch', 'block'];

export function classify(mutatorName, sourceLine) {
    if (LOGGY.test(sourceLine)) return 'logPresentation';
    switch (mutatorName) {
        case 'ConditionalExpression':
        case 'EqualityOperator':
        case 'LogicalOperator':
        case 'BooleanLiteral':
            return 'branch';
        case 'BlockStatement':
            return 'block';
        case 'OptionalChaining':
            return 'optionalChain';
        case 'StringLiteral':
            return 'string';
        default:
            return 'other';
    }
}

/** Read a Stryker JSON report into per-module rows. */
export function summarise(reportPath) {
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const rows = {};

    for (const [path, file] of Object.entries(report.files)) {
        const lines = file.source.split('\n');
        const counts = { killed: 0, survived: 0, noCoverage: 0, timeout: 0 };
        const categories = {};

        for (const m of file.mutants) {
            if (m.status === 'Killed') counts.killed++;
            else if (m.status === 'Timeout') counts.timeout++;
            else if (m.status === 'NoCoverage') counts.noCoverage++;
            else if (m.status === 'Survived') {
                counts.survived++;
                const line = lines[m.location.start.line - 1] ?? '';
                const c = classify(m.mutatorName, line);
                categories[c] = (categories[c] ?? 0) + 1;
            }
        }

        const total = counts.killed + counts.survived + counts.noCoverage + counts.timeout;
        // Stryker's mutation score: killed + timeout count as detected.
        const score = total ? ((counts.killed + counts.timeout) / total) * 100 : 0;
        rows[path] = {
            score: Number(score.toFixed(2)),
            ...counts,
            survivorCategories: categories,
            highValueSurvivors: HIGH_VALUE.reduce((n, c) => n + (categories[c] ?? 0), 0),
        };
    }
    return rows;
}

/**
 * Pin a report's numbers as the new floor.
 *
 * @param merge  true when the report covers only SOME modules — a focused run. The
 *   report's modules replace their baseline rows and every other row is kept as it
 *   was. Without this the loop could CHECK against the floor after each focused
 *   measurement but never RAISE it, so the floor sat two shipped improvements stale
 *   and would have accepted a regression back to it as "held". Overwriting outright
 *   instead would delete the rows the focused run never measured, which is worse.
 */
export function writeBaseline(reportPath, baselinePath, note, merge = false) {
    const measured = summarise(reportPath);
    const kept =
        merge && existsSync(baselinePath)
            ? JSON.parse(readFileSync(baselinePath, 'utf8')).modules
            : {};
    const modules = { ...kept, ...measured };
    writeFileSync(
        baselinePath,
        JSON.stringify(
            {
                _what:
                    'Per-module mutation baseline. A run may not score LOWER than these, and ' +
                    'may not raise its score while leaving highValueSurvivors unchanged or ' +
                    'higher — that combination is the signature of a score raised by ' +
                    'asserting log strings. Regenerate with `npm run test:mutation:baseline` ' +
                    'ONLY when the new numbers are genuinely better.',
                _note: note,
                modules,
            },
            null,
            4
        ) + '\n'
    );
    return modules;
}


/**
 * Survivors that represent BEHAVIOUR rather than wording.
 *
 * The ratchet's second rule exists to catch a score raised by asserting log strings.
 * It originally read `highValueSurvivors`, which counts only branch and block — so
 * killing any other kind of behavioural mutant raised the score while that number
 * stood still, and the rule fired on genuine work. It did, on 2026-09-02: six mutants
 * on two `.sort()` comparators died (as text, Node 8 sorts after Node 20 — a real
 * defect reaching the user), and the run was reported as padding.
 *
 * The two instruments also disagreed. `mutationWorklist.mjs` ranked those same
 * comparators as decisions worth working, so the loop was steered at work the ratchet
 * then refused to credit.
 *
 * Wording is what `string` and `logPresentation` capture; everything else changes what
 * the code DOES. Subtracting only those two states the rule precisely and leaves
 * `highValueSurvivors` — which the baseline rows pin and the report prints — untouched.
 */
function behaviouralSurvivors(row) {
    const c = row.survivorCategories;
    if (!c) return undefined; // an older row: fall back to the coarse check
    return row.survived - (c.string ?? 0) - (c.logPresentation ?? 0);
}

/**
 * Compare a fresh report against the baseline.
 *
 * Returns a list of human-readable problems; empty means the ratchet held.
 */
/**
 * @param reportPath  a Stryker JSON report
 * @param baselinePath  the pinned per-module baseline
 * @param partial  true when the report deliberately covers only SOME baseline
 *   modules — a focused single-module run. Without it, every module the run did not
 *   measure reports as "dropped from the config", which is 11 false alarms on a focus
 *   report and makes the ratchet unusable exactly where the loop needs it.
 *
 *   The check it turns off is still worth having for a FULL run: a module silently
 *   vanishing from `mutate` is how a measurement quietly stops measuring.
 */
export function compare(reportPath, baselinePath, partial = false) {
    const now = summarise(reportPath);
    const base = JSON.parse(readFileSync(baselinePath, 'utf8')).modules;
    const problems = [];

    for (const [path, b] of Object.entries(base)) {
        const n = now[path];
        if (!n) {
            if (!partial) {
                problems.push(
                    `${path}: in the baseline but NOT in this run — was it dropped from the config?`
                );
            }
            continue;
        }
        if (n.score < b.score) {
            problems.push(
                `${path}: score FELL ${b.score}% -> ${n.score}%. ` +
                    `A change went in that the tests do not constrain.`
            );
        }
        const bBehaviour = behaviouralSurvivors(b);
        const nBehaviour = behaviouralSurvivors(n);
        const stalled =
            bBehaviour === undefined || nBehaviour === undefined
                ? n.highValueSurvivors >= b.highValueSurvivors
                : nBehaviour >= bBehaviour;
        // Bringing UNREACHABLE code under test raises the score and raises the survivor
        // count at the same time: a NoCoverage mutant becomes either killed or survived,
        // and the ones that survive are newly visible work rather than new debt. Padding
        // never moves this number, so exempting a run whose uncovered count fell keeps
        // the check aimed at what it was built for. Measured 2026-09-02: nineteen
        // uncovered mutants became covered, thirteen of them killed, and the rule called
        // the run padding because six of the rest now showed up as survivors.
        const reachedNewCode = n.noCoverage < b.noCoverage;
        if (n.score > b.score && stalled && !reachedNewCode) {
            const shown =
                bBehaviour === undefined || nBehaviour === undefined
                    ? `branch/block survivors did not fall (${b.highValueSurvivors} -> ${n.highValueSurvivors})`
                    : `behavioural survivors did not fall (${bBehaviour} -> ${nBehaviour})`;
            problems.push(
                `${path}: score ROSE ${b.score}% -> ${n.score}% but ${shown}. ` +
                    `That is a score raised without constraining a decision — ` +
                    `check what the new assertions actually assert.`
            );
        }
        if (n.noCoverage > b.noCoverage) {
            problems.push(
                `${path}: uncovered mutants ROSE ${b.noCoverage} -> ${n.noCoverage}. ` +
                    `New code arrived with no test entering it.`
            );
        }
    }

    for (const path of Object.keys(now)) {
        if (!(path in base)) {
            problems.push(`${path}: mutated but has NO baseline row — add one before trusting its score.`);
        }
    }
    return { problems, now, base };
}
