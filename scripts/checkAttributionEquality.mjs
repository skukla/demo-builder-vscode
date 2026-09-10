#!/usr/bin/env node
/**
 * Prove the import-graph FALLBACK in `suitesFor` cannot move an existing measurement.
 *
 *   node scripts/checkAttributionEquality.mjs
 *
 * WHY THIS AND NOT A RE-MEASURE. `scripts/focusModule.mjs` gained a second rule on
 * 2026-09-08: when no suite mirrors a module's filename, jest's own inverse dependency
 * graph supplies the suites instead. That rule was chosen over keying EVERYTHING on the
 * graph because the wide rule multiplies the sweep's work 24.5x — a measured 4.8-hour
 * sweep becomes about 76 — and bought no accuracy on the two modules run under both.
 *
 * The property that makes it safe is an ordering property, not a statistical one: the
 * fallback fires only where the mirror rule returns nothing, so for every module that
 * already HAS a baseline row the suite set is unchanged, byte for byte. That is
 * checkable in seconds. Re-measuring 629 modules to discover the same thing would take
 * the 76 hours the design rejected.
 *
 * A check that only asserted equality would pass perfectly for an implementation that
 * never called the fallback at all, so both controls below are load-bearing:
 *   POSITIVE — a module with no mirroring suite must now get a non-empty set.
 *   NEGATIVE — a module nothing imports must still get an empty one, or the fallback is
 *              handing back the whole test tree and every score after it is inflated.
 *
 * Full reasoning: `.rptc/plans/unmeasured-fifth/attribution-design.md`.
 */
import { readFileSync } from 'fs';

import { suitesFor, mirroringSuites, relatedSuites } from './focusModule.mjs';

const BASELINE = 'reports/mutation/baseline.json';

/** A module with no suite of its own name, reached only through its consumers. */
const POSITIVE = 'src/features/project-creation/services/aiBundle/agentsMdSections.ts';
/** A webview entry point: nothing mirrors it and nothing imports it. */
const NEGATIVE = 'src/features/project-creation/ui/wizard/index.tsx';

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

function main() {
    const modules = Object.keys(JSON.parse(readFileSync(BASELINE, 'utf8')).modules);
    const failures = [];

    // Guard against the vacuous pass: an empty or unreadable baseline agrees with
    // everything. This is the shape that reported 0% for seven modules in 19 seconds.
    if (modules.length < 100) {
        failures.push(`Only ${modules.length} baseline rows read from ${BASELINE} — expected 600+.`);
    }

    let barren = 0;
    let differing = 0;
    for (const m of modules) {
        const mirror = mirroringSuites(m);
        if (!mirror.length) {
            // The fallback WOULD fire here, so this row's meaning is no longer fixed.
            barren += 1;
            failures.push(`${m}: no mirroring suite — the fallback would change this pinned row.`);
            continue;
        }
        if (!same(suitesFor(m), mirror)) {
            differing += 1;
            failures.push(`${m}: suitesFor() no longer equals the mirror rule.`);
        }
    }

    const positive = suitesFor(POSITIVE);
    const positiveMirror = mirroringSuites(POSITIVE);
    if (positiveMirror.length) {
        failures.push(`POSITIVE CONTROL is stale: ${POSITIVE} now HAS a mirroring suite.`);
    } else if (!positive.length) {
        failures.push(`POSITIVE CONTROL failed: ${POSITIVE} still resolves to no suites.`);
    }

    const negative = relatedSuites(NEGATIVE);
    if (negative.length) {
        failures.push(
            `NEGATIVE CONTROL failed: ${NEGATIVE} resolved to ${negative.length} suite(s); ` +
                `nothing imports it, so the fallback is over-selecting.`
        );
    }

    console.log(`baseline rows checked                : ${modules.length}`);
    console.log(`  rows whose suite set is unchanged  : ${modules.length - barren - differing}`);
    console.log(`  rows with no mirroring suite       : ${barren}   (must be 0)`);
    console.log(`  rows whose suite set MOVED         : ${differing}   (must be 0)`);
    console.log(`POSITIVE control ${POSITIVE}`);
    console.log(`  mirror rule                        : ${positiveMirror.length} suite(s)  (must be 0)`);
    console.log(`  with fallback                      : ${positive.length} suite(s)  (must be > 0)`);
    console.log(`NEGATIVE control ${NEGATIVE}`);
    console.log(`  with fallback                      : ${negative.length} suite(s)  (must be 0)`);

    if (failures.length) {
        console.error(`\n${failures.length} failure(s):`);
        for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
        process.exit(1);
    }
    console.log('\nOK — the fallback cannot move any pinned row, and it does fire where it should.');
}

main();
