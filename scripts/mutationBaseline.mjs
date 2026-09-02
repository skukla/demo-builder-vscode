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
import { readFileSync, writeFileSync } from 'fs';

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

export function writeBaseline(reportPath, baselinePath, note) {
    const modules = summarise(reportPath);
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
        if (n.score > b.score && n.highValueSurvivors >= b.highValueSurvivors) {
            problems.push(
                `${path}: score ROSE ${b.score}% -> ${n.score}% but branch/block survivors ` +
                    `did not fall (${b.highValueSurvivors} -> ${n.highValueSurvivors}). ` +
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
