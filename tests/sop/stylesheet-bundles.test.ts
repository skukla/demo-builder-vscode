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
 * NAMED `stylesheet-` rather than `webview-`, deliberately. The split-family
 * check (`test-family-setup.test.ts`) groups suites by their first hyphenated
 * token, so a second `webview-*` file here would read as a two-suite FAMILY
 * expected to share a `.testUtils`. It is not one: this and
 * `webview-architecture-rules.test.ts` enforce different rules and already
 * share what they should (`architectureScan.ts`). Adding a ledger row to record
 * debt that does not exist would be worse than choosing a name that tells the
 * truth.
 *
 * WHAT THIS DOES NOT CHECK. Classes defined in no stylesheet anywhere — dead
 * markup, or elements nobody styled — are a separate and much larger finding
 * (38 as of 2026-08-29). Mixing them in would bury this rule's three real hits
 * under a set that needs its own judgement pass. Filed rather than folded in.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { reportBundleClassUsage, type UsageReport } from './webviewBundleClasses';
import { loadLedger, expectClean, expectCeiling } from './architectureScan';

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

    it('every class defined NOWHERE is a reasoned ledger entry', () => {
        // The sibling defect. `bundleStylesheets` is "the sheet exists but this
        // bundle does not load it"; this is "no sheet defines it at all", which
        // is either dead markup or a rule nobody wrote. Same ledger contract,
        // separate key, because the fixes are different and only a human can say
        // which applies.
        const violations = [...report.definedNowhere.keys()].sort();
        expectClean(LEDGER, 'classesDefinedNowhere', violations);
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
        // A pin left above an improved count lets the blind spot grow back to it.
        expectCeiling(LEDGER, 'dynamicClassSiteCeiling', report.dynamicSites);
    });
});

describe('ADR-018 §2: !important is a symptom, not a mechanism', () => {
    /**
     * ADR-018 is **accepted for new code**; migrating the existing CSS is NOT
     * authorised, and the ADR measured 1,866 removable uses at the time it was
     * written. So the honest enforcement is a ratchet, not a ban: the count may
     * not grow, and any fall must be pinned so it cannot grow back.
     *
     * The number has already drifted up since the ADR measured it, which is the
     * argument for pinning it rather than leaving the rule as advice.
     *
     * What this cannot do: it counts occurrences, not badness. A file could remove
     * ten and add one that matters more. That judgement belongs to the migration
     * work (PL-21), which this only stops from being quietly undone.
     */
    const CSS = execSync("git ls-files 'src/**/*.css'", { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);

    it('CONTROL: the stylesheets are found and read', () => {
        expect(CSS.length).toBeGreaterThan(3);
        const total = CSS.reduce((n, f) => n + readFileSync(f, 'utf8').length, 0);
        expect(total).toBeGreaterThan(10_000);
    });

    it('the count never grows, and a fall is pinned', () => {
        const count = CSS.reduce(
            (n, f) => n + (readFileSync(f, 'utf8').match(/!important/g) ?? []).length,
            0
        );
        expectCeiling(LEDGER, 'importantCeiling', count);
    });
});

describe('ADR-018 §3: a component style block styles that component only', () => {
    /**
     * A `<style>` block inside a component may define classes that component uses.
     * The moment another file uses one, the styling depends on where the definer
     * happens to be mounted — and the two go out of sync silently, because nothing
     * connects them.
     *
     * Measured 2026-08-30: thirteen classes are defined in three components'
     * style blocks AND used elsewhere. **None is broken today**, because every one
     * is also defined in `custom-spectrum.css`, which all eight bundle entries
     * import. So these are redundant copies shadowing a global sheet, not missing
     * styles — a real duplication to remove, but not a live defect.
     *
     * Deleting them is NOT free and is deliberately not done here: the global copies
     * carry `!important` in places and the inline ones do not, so removing a block
     * can move which declaration wins. That needs the computed-style comparison in
     * `.claude/skills/webview-visual-baseline`, which is what PL-21 is gated on.
     * This ledger stops the set growing while that is decided.
     */
    const TSX = execSync("git ls-files 'src/**/*.tsx'", { encoding: 'utf8' })
        .trim()
        .split('\n')
        .filter(Boolean);
    const STYLE_BLOCK = /<style[^>]*>([\s\S]*?)<\/style>/g;
    const CLASS_DEF = /\.([a-zA-Z_][\w-]*)/g;

    const owner = new Map<string, string>();
    for (const f of TSX) {
        for (const b of readFileSync(f, 'utf8').matchAll(STYLE_BLOCK)) {
            const body = b[1].replace(/\{[^{}]*\}/g, '{}');
            for (const m of body.matchAll(CLASS_DEF)) if (!owner.has(m[1])) owner.set(m[1], f);
        }
    }
    const escaped = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const violations = [...owner]
        .filter(([cls, own]) =>
            TSX.some(
                (f) =>
                    f !== own &&
                    new RegExp(`['"\`\\s]${escaped(cls)}['"\`\\s]`).test(readFileSync(f, 'utf8'))
            )
        )
        .map(([cls, own]) => `${own}::${cls}`)
        .sort();

    it('CONTROL: style blocks are found and their classes read', () => {
        // A zero here would make the check below pass while looking at nothing.
        expect(TSX.length).toBeGreaterThan(50);
        expect(owner.size).toBeGreaterThan(5);
    });

    it('every class shared out of a style block is a reasoned ledger entry', () => {
        expectClean(LEDGER, 'styleBlockLeaks', violations);
    });
});
