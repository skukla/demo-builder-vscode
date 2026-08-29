/**
 * ADR-017 §6 — a component may not use a class its bundle cannot style.
 *
 * This closes the gap ADR-017 named as its own weakest link: the rule was
 * stated and unenforced, and its failure mode is silent. A component reused
 * across surfaces renders raw on the surface whose bundle never loaded the
 * stylesheet defining its classes. No compile error, no console warning, no
 * failing test — just a grey box, reported by whoever is looking at the screen.
 *
 * The machinery lives in `webviewBundleClasses.ts`; it builds each entry with
 * the REAL esbuild config and reads the graph esbuild produces.
 *
 * WHAT THIS DOES NOT CHECK. Classes defined in no stylesheet anywhere — dead
 * markup, or elements nobody styled — are a separate and much larger finding
 * (38 as of 2026-08-29). Mixing them in would bury this rule's three real hits
 * under a set that needs its own judgement pass. Filed rather than folded in.
 */

import { execSync } from 'child_process';
import { reportBundleClassUsage, type UsageReport } from './webviewBundleClasses';
import { loadLedger, expectClean } from './architectureScan';

const ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const LEDGER = loadLedger('webview-architecture-rules.exemptions.json');

let report: UsageReport;

beforeAll(async () => {
    report = await reportBundleClassUsage(ROOT);
    // Building eight bundles takes ~1.2s; the default 5s timeout is tight on a
    // cold cache and a timeout here would read as a broken check.
}, 60_000);

describe('ADR-017 §6: a class used in a bundle is styled by that bundle', () => {
    it('POSITIVE CONTROL: the scan can see classes at all', () => {
        // Without this, every assertion below passes vacuously the moment the
        // parser, the alias plugin or the entry list breaks — a zero from a
        // probe that cannot look is indistinguishable from a clean result.
        const { classesDefinedAnywhere } = require('./webviewBundleClasses');
        const defined = classesDefinedAnywhere(ROOT) as Set<string>;
        expect(defined.size).toBeGreaterThan(500);

        // Two specific known classes, one global and one feature-scoped, so a
        // parser that silently stopped matching compound or plain selectors
        // fails here rather than reporting a clean repo.
        expect(defined.has('page-header-section')).toBe(true); // custom-spectrum.css (global)
        expect(defined.has('text-orange-600')).toBe(true); // eds-steps.css (feature)
    });

    it('POSITIVE CONTROL: the scan reads compound selectors', () => {
        // `.db-drawer.open` must yield BOTH classes. The first version of the
        // parser required a delimiter before the dot and read only the first
        // half, so every conditionally-applied class looked undefined. That is
        // a false positive, the one failure that makes a check worse than none.
        const { classesDefinedAnywhere } = require('./webviewBundleClasses');
        const defined = classesDefinedAnywhere(ROOT) as Set<string>;
        expect(defined.has('open')).toBe(true);
    });

    it('every cross-bundle class use is a reasoned ledger entry', () => {
        // ONE ROW PER SITE, not per class. Keying on "the first site
        // alphabetically" was the first shape and it is fragile: a class used in
        // three bundles would silently RENAME its row when one of the three was
        // fixed, which reads as "new violation + stale exemption" rather than as
        // progress. Per-site rows mean fixing one bundle deletes exactly one row.
        const violations = [...report.crossBundle.entries()]
            .flatMap(([cls, sites]) => [...sites].map((site) => `${cls} @ ${site}`))
            .sort();
        expectClean(LEDGER, 'bundleStylesheets', violations);
    });

    it('reports how many class lists it could NOT read', () => {
        // Not a failure — a disclosure. These are template-literal expressions
        // whose class list is assembled at runtime, so this check cannot see
        // them and a violation could hide there. Stating the number keeps that
        // blind spot visible instead of letting a clean result imply full
        // coverage.
        //
        // The ceiling only ratchets DOWN, like every other ledger here: more
        // unreadable sites means less of the surface is actually checked.
        expect(report.dynamicSites).toBeLessThanOrEqual(LEDGER.dynamicClassSiteCeiling as number);
    });
});
