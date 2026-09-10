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
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { reportBundleClassUsage, type UsageReport } from './webviewBundleClasses';
import { loadLedger, expectBanned, expectClean, expectCeiling, expectFloor } from './architectureScan';

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
        expect(defined.has('page-header-section')).toBe(true); // utilities.css (global)
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
        expectBanned(LEDGER, 'bundleStylesheets', violations);
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

describe('ADR-018 step 3: Spectrum in @layer vendor, one entry at a time', () => {
    /**
     * The build wraps `node_modules` CSS in `@layer vendor` for the entries named
     * in `LAYERED_VENDOR_ENTRIES`, and prepends the cascade order to every sheet
     * it injects for them.
     *
     * WHY IT IS PER-ENTRY. Our rules sit in `@layer theme`; Spectrum's arrive
     * unlayered, and an unlayered NORMAL declaration beats a layered one at any
     * specificity. That is why this repo carries ~1,300 `!important`. Doing the
     * whole repo at once was measured on 2026-09-08: 762 of 2,700 elements moved,
     * including inputs losing 11px of line-height and buttons losing their bold.
     * That is a redesign. One entry at a time is reviewable; eight is not.
     *
     * These two checks are cheap and they guard the thing a rebuild could silently
     * undo: the order string drifting from the sheets, and the list growing without
     * anyone measuring the surface it was added for.
     */
    const { LAYER_ORDER, LAYERED_VENDOR_ENTRIES } = require(join(ROOT, 'esbuild.config.js'));

    it('the order the BUILD prepends is byte-identical to the one the sheets declare', () => {
        const declared = [...new Set(
            readdirSync(join(ROOT, 'src/core/ui/styles'))
                .filter((f) => f.endsWith('.css'))
                .flatMap((f) =>
                    (readFileSync(join(ROOT, 'src/core/ui/styles', f), 'utf8')
                        .match(/^@layer [^;{]+;$/m) ?? [])
                )
        )];
        // Control: the sheets must actually declare an order, or this compares
        // the build's string against an empty set and passes on nothing.
        expect(declared).toHaveLength(1);
        expect(LAYER_ORDER).toBe(declared[0]);
    });

    it('only entries that have been MEASURED are layered', () => {
        // Growing this list is a visual change. It needs a before/after from
        // `.claude/skills/webview-visual-baseline` and a person looking at what
        // moved — so the list is pinned here and moves only with that evidence.
        //
        // sidebar,      2026-09-09: 46 elements x 2 themes x 3 widths, 0 moved.
        // projectsList, 2026-09-09: 77 elements x 2 themes x 3 widths, 0 moved —
        //   but only AFTER the cascade order was corrected. Under the original
        //   `vendor, reset` it moved 45 of 77. See ADR-018 §1.
        // the last six, 2026-09-10: 327 elements, 0 moved. Every surface carried
        //   its own tamper control, and the wizard document was confirmed to have
        //   32 live @layer vendor blocks with the order statement parsed.
        //
        // ALL EIGHT ARE NOW LAYERED, so this list is complete and the assertion
        // is no longer a ratchet — it is the finished state. What it still guards
        // is an entry being ADDED to WEBVIEW_ENTRIES and quietly left out.
        expect([...LAYERED_VENDOR_ENTRIES].sort()).toStrictEqual([
            'aiOverview', 'configure', 'dashboard', 'dataInstaller',
            'integrations', 'projectsList', 'sidebar', 'wizard',
        ]);
    });

    /**
     * `vendorLayerBundles` is the number the handbook cites as the thing that
     * makes "vendor CSS sits in the lowest cascade layer" enforceable. Until
     * 2026-09-10 NO TEST READ IT: it sat at 0 in the ledger while all eight
     * entries were layered, and the handbook pointed at it as evidence.
     *
     * A metric nothing reads is worse than no metric — it is a citation that
     * looks checked. This is the reader.
     */
    it('the vendorLayerBundles floor matches reality, and covers every entry', () => {
        const ledger = JSON.parse(
            readFileSync(join(__dirname, 'webview-architecture-rules.exemptions.json'), 'utf8')
        ) as Record<string, unknown>;
        const { WEBVIEW_ENTRIES } = require(join(ROOT, 'esbuild.config.js'));
        const entries = Object.keys(WEBVIEW_ENTRIES);

        // Control: the key must exist, or `undefined === undefined` passes on nothing.
        expect(typeof ledger.vendorLayerBundles).toBe('number');

        expect(ledger.vendorLayerBundles).toBe(LAYERED_VENDOR_ENTRIES.length);
        // A FLOOR: it counts up, and 8 of 8 is the finished state. A new entry
        // that skips the vendor layer drops this below the entry count and fails.
        expect(ledger.vendorLayerBundles).toBe(entries.length);
    });
});

describe('ADR-018 §1: one cascade order, declared, and every bundle carries it', () => {
    /**
     * THE ORDER, lowest priority first for NORMAL declarations:
     *
     *     reset  <  vendor  <  theme  <  overrides
     *
     * This comment said `vendor < reset` until 2026-09-10 — the pre-correction
     * order, left behind and contradicting the CANONICAL string six lines below
     * it. Not cosmetic: under `vendor, reset` a plain `font: inherit` in the reset
     * beat Spectrum, and projectsList moved 45 of 77 elements. ADR-018 §1 has the
     * correction; this block had the version it replaced.
     *
     * `vendor` is no longer empty either. All EIGHT entries wrap Spectrum's CSS in
     * it as of 2026-09-10, which is what makes "vendor CSS sits in the lowest
     * cascade layer" a rule the code follows rather than a rule with a start date.
     *
     * WHY EVERY BUNDLE AND NOT JUST ONE SHEET. Layer precedence is fixed by the
     * FIRST declaration a bundle sees, and sheets arrive in whatever order the
     * bundle graph produces. The declaration lived only in index.css, which seven
     * of the eight entries import — the SIDEBAR imported none of it and took
     * whatever order its own graph happened to emit. It worked by luck, which is
     * the failure ADR-018 named in advance and nothing was checking for.
     */
    const CANONICAL = '@layer reset, vendor, theme, overrides;';
    const LAYERS = ['vendor', 'reset', 'theme', 'overrides'];

    const sheets = (): string[] =>
        execSync("git ls-files 'src/**/*.css'", { cwd: ROOT, encoding: 'utf8' })
            .split('\n')
            .filter(Boolean);

    const noComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

    it('POSITIVE CONTROL: the canonical declaration is actually present somewhere', () => {
        // Without this every assertion below passes vacuously the moment the
        // reader breaks — zero declarations found reads the same as zero wrong.
        const found = sheets().filter((f) => noComments(readFileSync(join(ROOT, f), 'utf8')).includes(CANONICAL));
        expect(found.length).toBeGreaterThan(0);
    });

    it('every layer-order declaration in src/ is the canonical one, byte for byte', () => {
        const wrong: string[] = [];
        for (const f of sheets()) {
            for (const m of noComments(readFileSync(join(ROOT, f), 'utf8')).matchAll(/@layer\s+[^{;]+;/g)) {
                if (m[0].replace(/\s+/g, ' ').trim() !== CANONICAL) wrong.push(`${f}: ${m[0].trim()}`);
            }
        }
        // Two identical declarations are safe — whichever a bundle sees first says
        // the same thing. Two DIFFERENT ones are a coin toss decided by the graph.
        expect(wrong.sort()).toStrictEqual([]);
    });

    it('every @layer block names a layer the order declares', () => {
        const unknown: string[] = [];
        for (const f of sheets()) {
            for (const m of noComments(readFileSync(join(ROOT, f), 'utf8')).matchAll(/@layer\s+([\w-]+)\s*\{/g)) {
                if (!LAYERS.includes(m[1])) unknown.push(`${f}: @layer ${m[1]}`);
            }
        }
        expect(unknown.sort()).toStrictEqual([]);
    });

    it('EVERY built bundle declares the order — not just the ones importing index.css', () => {
        // The one that catches the sidebar. It reads the BUILT output rather than
        // the sources, because the question is what a bundle contains, and that is
        // decided by the import graph rather than by any sheet's own text.
        const dist = join(ROOT, 'dist/webview');
        if (!existsSync(dist)) return; // `npm run compile` has not run; the gate's jest step does not build
        const missing = readdirSync(dist)
            .filter((f) => f.endsWith('-bundle.js'))
            .filter((f) => !readFileSync(join(dist, f), 'utf8').includes(CANONICAL));
        expect(missing.sort()).toStrictEqual([]);
    });

    it('a webview component defines NO CSS in a <style> block', () => {
        // THE STRONGER RULE, and it is only enforceable because it is now true.
        // The old one banned LEAKING — a block could define classes as long as no
        // other component used them — and left the hazard that made leaking bad:
        // a class defined in a block exists only while its component is MOUNTED.
        // `.text-red-500` was exactly that, and an error icon rendered colourless
        // on every surface VerifiedField did not happen to be on.
        //
        // Six rules remained on 2026-09-09, in two components, and FIVE were
        // byte-identical to copies already in a sheet. The sixth,
        // `.text-green-500`, had no sheet home and got one. Both blocks deleted.
        //
        // Standalone `<!DOCTYPE html>` pages are out of scope: they load none of
        // our sheets, so a block is the only way they can be styled at all.
        const files = execSync("git ls-files 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: 'utf8' })
            .split('\n')
            .filter(Boolean);
        const offenders: string[] = [];
        let pagesSkipped = 0;
        for (const f of files) {
            const text = readFileSync(join(ROOT, f), 'utf8');
            if (/<!doctype html>/i.test(text)) { pagesSkipped++; continue; }
            for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
                const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
                // NOT anchored to a line start. The first version of this was, and a
                // planted one-line block — `<style>{`@layer theme { .x { color: red } }`}
                // </style>` — passed it clean. A rule reads the same to a browser on one
                // line or twenty, so the check has to as well.
                const rules = (css.match(/[.#[][^{};@]*\{/g) ?? []).length;
                if (rules) offenders.push(`${f}: ${rules} rule(s) in a <style> block`);
            }
        }
        // Control: the reader must have found the standalone pages, or it is not
        // looking at anything and would report clean forever.
        expect(pagesSkipped).toBeGreaterThan(0);
        expect(offenders.sort()).toStrictEqual([]);
    });

    it('rules outside every layer may not grow', () => {
        // Unlayered beats layered for normal declarations, so a loose rule silently
        // outranks everything in `theme`. 135 of them today across nine sheets;
        // this is a ratchet rather than a ban because emptying it moves pixels and
        // belongs to the cascade flip, not to a convention.
        let loose = 0;
        for (const f of sheets()) {
            const lines = noComments(readFileSync(join(ROOT, f), 'utf8')).split('\n');
            let depth = 0;
            let layerDepth: number | null = null;
            for (const l of lines) {
                if (/^\s*@layer\s+[\w-]+\s*\{/.test(l)) layerDepth = depth;
                else if (/^\s*[.#[]/.test(l) && l.includes('{') && layerDepth === null) loose++;
                depth += (l.match(/\{/g) ?? []).length - (l.match(/\}/g) ?? []).length;
                if (layerDepth !== null && depth <= layerDepth) layerDepth = null;
            }
        }
        expectCeiling(LEDGER, 'unlayeredRuleCeiling', loose);
    });
});

describe('ADR-017 §7: a stylesheet lives where its owner lives', () => {
    /**
     * THREE kinds of stylesheet, and the middle one had no name until 2026-09-09:
     * a feature's, a SHARED COMPONENT's, and the base layer's. §6 says which
     * bundles must load a sheet; §7 says where the sheet should sit.
     *
     * The checkable half: a non-base sheet under `src/core/ui/styles/` may only
     * define classes a component under `src/core/ui/components/` actually uses. A
     * class only feature code uses belongs in that feature's directory, whatever
     * the sheet is called.
     *
     * Found one on its first run — `.integrations-*`, the integrations SURFACE's
     * shell and grid, batched into shared-ui.css with nineteen families that do
     * belong there. Moved to the dashboard feature the same day.
     *
     * WHAT IT CANNOT SAY: whether a correctly-placed sheet is a GOOD sheet.
     * shared-ui.css passes and is still nineteen families in one file. That
     * judgement is not mechanisable and is not attempted here.
     */
    const BASE_SHEETS = new Set([
        'src/core/ui/styles/utilities.css',
        'src/core/ui/styles/index.css',
        'src/core/ui/styles/reset.css',
        'src/core/ui/styles/tokens.css',
        'src/core/ui/styles/vscode-theme.css',
        'src/core/ui/styles/wizard.css',
    ]);

    /**
     * Whole class tokens inside string literals — a bare prefix grep matches paths
     * and prose.
     *
     * The DIRECTORY form of `git ls-files`, not a `**` glob: `components/**\/*.tsx`
     * matches only NESTED files and missed the 50 sitting directly in that
     * directory, which made ten correctly-placed families look misplaced. The
     * positive control below still passed, because the nested files alone carry
     * more than 500 tokens — a control can prove the reader works and say nothing
     * about whether it read everything.
     */
    const tokensUsedUnder = (dir: string): Set<string> => {
        const files = execSync(`git ls-files '${dir}'`, { encoding: 'utf8' })
            .split('\n')
            .filter((f) => /\.tsx?$/.test(f));
        const out = new Set<string>();
        for (const f of files) {
            const code = readFileSync(join(ROOT, f), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            for (const lit of code.match(/['"`][^'"`\n]*['"`]/g) ?? []) {
                for (const w of lit.match(/[A-Za-z_][\w-]*/g) ?? []) out.add(w);
            }
        }
        return out;
    };

    /**
     * The classes a sheet OWNS — the first class of each rule's selector, not every
     * class the selector mentions.
     *
     * `.modal-body:has(.manage-apis-body)` is a modal rule; it does not make
     * `.manage-*` modal.css's to own. Collecting every mention reported
     * `.transitioning-*`, `.forward-*`, `.backward-*`, `.manage-*` and `.db-*` as
     * misplaced families when they are state modifiers and descendants named by a
     * rule that belongs exactly where it is.
     */
    const familiesOwnedBy = (file: string): Map<string, string[]> => {
        const css = readFileSync(join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        const out = new Map<string, string[]>();
        for (const block of css.split('}')) {
            const open = block.indexOf('{');
            if (open === -1) continue;
            const selector = block.slice(0, open);
            const first = /\.([A-Za-z_][\w-]*)/.exec(selector);
            if (!first) continue;
            const fam = first[1].split('-')[0];
            out.set(fam, [...(out.get(fam) ?? []), ...[...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1])]);
        }
        return out;
    };

    it('POSITIVE CONTROL: the scan can see shared-component classes at all', () => {
        // Without this every assertion below passes the moment the token reader
        // breaks, and a zero from a probe that cannot look is indistinguishable
        // from a clean result.
        const used = tokensUsedUnder('src/core/ui/components');
        expect(used.size).toBeGreaterThan(500);
        expect(used.has('modal-body')).toBe(true);
        expect(used.has('copyable-text')).toBe(true);
        // From a file sitting DIRECTLY in the directory, not a subdirectory — the
        // `**` glob that missed those passed every assertion above.
        expect(used.has('app-container')).toBe(true);
    });

    /** Which features use any of these classes, by exact class token. */
    const featuresUsing = (classes: string[]): Set<string> => {
        const out = new Set<string>();
        for (const f of execSync("git ls-files 'src/features'", { encoding: 'utf8' }).split('\n')) {
            if (!/\.tsx?$/.test(f)) continue;
            const code = readFileSync(join(ROOT, f), 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            const tokens = new Set((code.match(/['"`][^'"`\n]*['"`]/g) ?? []).flatMap((l) => l.match(/[A-Za-z_][\w-]*/g) ?? []));
            if (classes.some((c) => tokens.has(c))) out.add(f.split('/')[2]);
        }
        return out;
    };

    it('a core/ui sheet holds shared-component or cross-feature classes, never one feature\'s', () => {
        const sheets = execSync("git ls-files 'src/core/ui/styles/*.css'", { encoding: 'utf8' })
            .split('\n')
            .filter((f) => f && !BASE_SHEETS.has(f));
        expect(sheets.length).toBeGreaterThan(0); // the rule must have something to check

        const coreTokens = tokensUsedUnder('src/core/ui/components');
        const misplaced: string[] = [];
        for (const sheet of sheets) {
            for (const [fam, classes] of familiesOwnedBy(sheet)) {
                if (classes.some((c) => coreTokens.has(c))) continue; // a shared component owns it
                const features = featuresUsing(classes);
                // NO user at all is a different defect — dead CSS, tracked by PL-53
                // — and reporting it here would bury the placement question under
                // it. `.section-label` is that case today.
                if (features.size === 0) continue;
                if (features.size === 1) {
                    misplaced.push(`${sheet}: .${fam}-* is used only by src/features/${[...features][0]}`);
                }
            }
        }
        expectClean(LEDGER, 'stylesheetOwner', misplaced.sort());
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

    /**
     * COMMENTS ARE STRIPPED FIRST, and that is not a nicety.
     *
     * This counted raw matches until 2026-09-08, so a comment EXPLAINING the
     * !important problem incremented the !important count. PL-21 phase 2 wrote
     * three sentences about it into eds-steps.css and pushed the ceiling from
     * 1,969 to 1,972 — a red build caused entirely by documentation, and an
     * instrument that quietly taxes anyone writing down what it is measuring.
     * Seven of the counted occurrences were already comment text before that.
     * The real declaration count is what the ratchet is for.
     */
    const stripComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '');

    it('CONTROL: stripping comments does not empty the corpus', () => {
        const stripped = CSS.map((f) => stripComments(readFileSync(f, 'utf8'))).join('');
        // The corpus no longer contains ANY `!important` (1,294 -> 0 on 2026-09-10),
        // so this can no longer prove the counter works by finding one. It proves
        // it the other way instead: the comment-stripper must leave the sheets
        // intact, or a count of zero would be an empty corpus rather than a clean
        // one — the exact false all-clear this control exists to prevent.
        expect(stripped.length).toBeGreaterThan(50_000);
        expect(stripped).toContain('.text-sm');
        expect(stripped.length).toBeGreaterThan(10_000);
    });

    it('the count never grows, and a fall is pinned', () => {
        const count = CSS.reduce(
            (n, f) => n + (stripComments(readFileSync(f, 'utf8')).match(/!important/g) ?? []).length,
            0
        );
        expectCeiling(LEDGER, 'importantCeiling', count);
    });
});

/**
 * The CSS migration's ratchets (.rptc/plans/css-architecture-migration).
 *
 * Three pins that make the migration loopable: two count the work DOWN, one counts
 * the instrument UP. Each cycle of step 2 moves one feature family out of the god
 * file, and these are what make that progress irreversible — `expectCeiling` fails
 * when a count falls, so an improvement cannot be banked without editing the ledger,
 * and that edit is a reviewed diff carrying a note.
 */
describe('the CSS migration ratchets', () => {
    const GOD_FILE = 'src/core/ui/styles/utilities.css';

    /**
     * Utility prefixes. Lives HERE rather than in the plan's prose so the
     * measurement and its definition cannot drift apart — a rule is feature-family
     * when its first class token's prefix is not one of these.
     */
    const UTILITY_PREFIXES = new Set([
        'text', 'bg', 'border', 'w', 'h', 'min', 'max', 'flex', 'gap', 'p', 'm',
        'mt', 'mb', 'ml', 'mr', 'pt', 'pb', 'pl', 'pr', 'font', 'items', 'justify',
        'grid', 'rounded', 'shadow', 'opacity', 'overflow', 'cursor', 'hidden',
        'block', 'inline', 'relative', 'absolute', 'space', 'leading', 'tracking',
        'letter', 'uppercase', 'truncate', 'whitespace', 'align', 'self', 'order', 'z',
        // Added 2026-09-09. `.fixed`, `.sticky` and `.grow` sit beside `.relative`
        // and `.absolute` in the same one-line utility block and are the same kind
        // of thing; their absence here counted three utilities as FEATURE rules and
        // left step 2's metric reading 4 when the real remainder is 1.
        'fixed', 'sticky', 'grow',
    ]);

    /** Top-level rules, split into utility and feature families. */
    function countGodFileRules(): { total: number; feature: number } {
        const lines = readFileSync(GOD_FILE, 'utf8').split('\n');
        let total = 0;
        let feature = 0;
        for (const line of lines) {
            const m = /^\s*([.#[][^{]*)\{/.exec(line);
            if (!m) continue;
            const classes = [...m[1].matchAll(/\.([A-Za-z_][\w-]*)/g)].map((x) => x[1]);
            if (!classes.length) continue;
            total++;
            if (!UTILITY_PREFIXES.has(classes[0].split('-')[0])) feature++;
        }
        return { total, feature };
    }

    it('CONTROL: the god file is found and parses to a plausible rule count', () => {
        const { total, feature } = countGodFileRules();
        // Without this, a moved/renamed file would read as "every rule migrated".
        //
        // A FLOOR OF 100 RULES WAS THE FIRST SHAPE AND THE MIGRATION IS DESIGNED
        // TO CROSS IT. The file reached 95 on 2026-09-09 and the control failed for
        // being right. What the control actually needs to prove is that the parser
        // is reading THIS file and getting rules out of it — so it asserts a class
        // the file still defines, which a moved or emptied file cannot satisfy and
        // a shrinking one can.
        expect(total).toBeGreaterThan(0);
        expect(feature).toBeLessThanOrEqual(total);
        const css = readFileSync(join(ROOT, 'src/core/ui/styles/utilities.css'), 'utf8');
        expect(css).toContain('.text-sm');
        expect(css.length).toBeGreaterThan(5_000);
    });

    it('feature rules leave the global sheet and never come back', () => {
        expectCeiling(LEDGER, 'featureRulesInGlobalSheet', countGodFileRules().feature);
    });

    it('the god file only shrinks — the control on the metric above', () => {
        // If featureRulesInGlobalSheet falls while this holds, rules were relabelled
        // rather than moved out, and the migration would report progress it has not made.
        expectCeiling(LEDGER, 'godFileTopLevelRules', countGodFileRules().total);
    });

    it('the visual fingerprint only gets sharper', () => {
        const capture = readFileSync(
            '.claude/skills/webview-visual-baseline/capture.js',
            'utf8'
        );
        const block = /const PROPS = \[([\s\S]*?)\];/.exec(capture);
        expect(block).not.toBeNull();
        const props = [...block![1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
        expect(props).toContain('letter-spacing'); // the 2026-09-08 blind spot
        expectFloor(LEDGER, 'capturedProperties', props.length);
    });
});
