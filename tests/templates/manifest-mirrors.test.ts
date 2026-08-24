/**
 * Manifest mirrors — hand-maintained pairs that must agree, checked derived.
 *
 * Four mirrors, all from the 2026-08-21 unenforced-seams inventory
 * (.rptc/research/unenforced-seams/research.md, seams #3/#4/#6):
 *
 * 1. Settings keys: code reads ↔ package.json `contributes.configuration`.
 *    The proven bug class: `demoBuilder.daLive.aemAuthorUrl` was renamed and
 *    user overrides were silently orphaned for six months; a listener for the
 *    RETIRED `demoBuilder.ai.surface` survived its setting by months (both
 *    directions of the same seam).
 * 2. Commands: every declared `contributes.commands` entry must be
 *    registered — a declared-but-unregistered command is a palette error.
 *    (Registered-but-undeclared is legitimate: internal commands.)
 * 3. Webview bundle names: every `featureBundleName`/`*-bundle.js` literal
 *    must name an esbuild WEBVIEW_ENTRIES key — a typo loads a blank panel.
 * 4. Cross-config ids: block-libraries' package references and
 *    demo-packages' addon references must resolve — a renamed package id
 *    silently detaches every block-library default pointing at it.
 *
 * Extraction is heuristic where it must be (settings reads flow through
 * section handles); the heuristics are documented inline and the suite
 * carries positive pins so an extraction that silently breaks fails loudly
 * instead of passing vacuously.
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '../..');

function walkSrc(): Array<{ file: string; source: string }> {
    const out: Array<{ file: string; source: string }> = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'node_modules' || entry.name === 'dist') continue;
                walk(full);
            } else if (/\.tsx?$/.test(entry.name)) {
                out.push({
                    file: path.relative(ROOT, full),
                    source: fs.readFileSync(full, 'utf-8'),
                });
            }
        }
    };
    walk(path.join(ROOT, 'src'));
    return out;
}

/** Drop comment-only lines so prose mentioning a key is not a "reference". */
function codeLines(source: string): string {
    return source
        .split('\n')
        .filter((l) => {
            const t = l.trim();
            return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
        })
        .join('\n');
}

const srcFiles = walkSrc();
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

// ---------------------------------------------------------------------------
// 1. Settings keys
// ---------------------------------------------------------------------------

describe('settings keys mirror package.json', () => {
    const declared = new Set<string>();
    for (const section of pkg.contributes.configuration) {
        for (const key of Object.keys(section.properties)) declared.add(key);
    }

    /**
     * Full setting keys the CODE references, from the contexts that name one:
     * - affectsConfiguration('demoBuilder.x.y')
     * - a section handle's get/update/inspect leaf, joined to its section.
     *   Heuristic: leaves are attributed to the nearest preceding
     *   getConfiguration('demoBuilder[.section]') within the same file.
     *   (globalState keys also look like 'demoBuilder.x.y' but are NOT
     *   settings — they are excluded by only joining through
     *   workspace.getConfiguration flows.)
     */
    function referencedKeys(): Set<string> {
        const refs = new Set<string>();
        for (const { source } of srcFiles) {
            const code = codeLines(source);
            for (const m of code.matchAll(/affectsConfiguration\(\s*'(demoBuilder[A-Za-z.]*)'/g)) {
                refs.add(m[1]);
            }
            // Section joins: walk getConfiguration sites in order; attribute
            // following leaves to the most recent section. EVERY handle
            // participates (not just demoBuilder ones) so a leaf after a
            // third-party handle (e.g. getConfiguration('claudeCode')) resets
            // attribution instead of being joined to the previous demoBuilder
            // section — the misattribution the first run of this suite made.
            const events: Array<{ idx: number; kind: 'section' | 'leaf'; value: string }> = [];
            for (const m of code.matchAll(/getConfiguration\(\s*'([A-Za-z][A-Za-z.]*)'\s*\)/g)) {
                events.push({ idx: m.index ?? 0, kind: 'section', value: m[1] });
            }
            for (const m of code.matchAll(
                /\.(?:get|update|inspect)(?:<[^>\n]{0,160}>)?\(\s*'([A-Za-z][A-Za-z.]*)'/g
            )) {
                events.push({ idx: m.index ?? 0, kind: 'leaf', value: m[1] });
            }
            events.sort((a, b) => a.idx - b.idx);
            let section: string | null = null;
            for (const e of events) {
                if (e.kind === 'section') {
                    section = e.value.startsWith('demoBuilder') ? e.value : null;
                } else if (section) {
                    refs.add(`${section}.${e.value}`);
                }
            }
        }
        return refs;
    }

    const referenced = referencedKeys();

    it('extraction is not vacuous (positive pins)', () => {
        // Two keys read through DIFFERENT patterns; if either pin fails, the
        // extraction broke — fix it before trusting any other assertion here.
        expect(referenced.has('demoBuilder.defaultPort')).toBe(true); // plain handle join
        expect(referenced.has('demoBuilder.daLive.aemAuthorUrl')).toBe(true); // sub-section handle join
    });

    it('every setting key the code references is declared (or a declared prefix)', () => {
        const declaredOrPrefix = (key: string): boolean =>
            declared.has(key) || [...declared].some((d) => d.startsWith(key + '.'));
        const orphans = [...referenced].filter((k) => !declaredOrPrefix(k));
        // The class this catches: a setting renamed/retired in package.json
        // while code still watches the old key (ai.surface, aemAuthorUrl).
        expect(orphans.sort()).toEqual([]);
    });

    it('every declared setting is referenced somewhere in code', () => {
        // Looser test: full-key literal anywhere in code, or its leaf appears
        // in a get/update/inspect in a file that also names its section.
        const allCode = srcFiles.map((f) => codeLines(f.source));
        const isReferenced = (key: string): boolean => {
            if (referenced.has(key)) return true;
            if (allCode.some((c) => c.includes(`'${key}'`))) return true;
            const lastDot = key.lastIndexOf('.');
            const section = key.slice(0, lastDot);
            const leaf = key.slice(lastDot + 1);
            return allCode.some(
                (c) => c.includes(`'${section}'`) && new RegExp(`'${leaf}(\\.[A-Za-z.]+)?'`).test(c)
            );
        };
        const dead = [...declared].filter((k) => !isReferenced(k));
        // A declared-but-unread setting is UI the user can set that does
        // nothing — the inverse orphan.
        expect(dead.sort()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2. Commands
// ---------------------------------------------------------------------------

describe('contributes.commands mirror registrations', () => {
    it('every declared command is registered (unregistered = palette error)', () => {
        const declaredCmds = new Set<string>(
            pkg.contributes.commands.map((c: { command: string }) => c.command)
        );
        const registered = new Set<string>();
        for (const { source } of srcFiles) {
            for (const m of codeLines(source).matchAll(
                /registerCommand\(\s*['"](demoBuilder\.[A-Za-z]+)/g
            )) {
                registered.add(m[1]);
            }
        }
        expect(registered.size).toBeGreaterThan(10); // vacuous-pass guard
        const unregistered = [...declaredCmds].filter((c) => !registered.has(c));
        expect(unregistered.sort()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 3. Webview bundle names
// ---------------------------------------------------------------------------

describe('webview bundle names mirror esbuild WEBVIEW_ENTRIES', () => {
    const esbuildSource = fs.readFileSync(path.join(ROOT, 'esbuild.config.js'), 'utf-8');
    const entriesBlock = /WEBVIEW_ENTRIES = \{([\s\S]*?)\}/.exec(esbuildSource);
    const entries = new Set(
        [...(entriesBlock?.[1] ?? '').matchAll(/^\s*([A-Za-z]+):/gm)].map((m) => m[1])
    );

    it('parses the entries (vacuous-pass guard)', () => {
        expect(entries.size).toBeGreaterThanOrEqual(8);
    });

    it('every bundle-name literal in src names a real entry', () => {
        const used = new Set<string>();
        for (const { source } of srcFiles) {
            const code = codeLines(source);
            for (const m of code.matchAll(/featureBundleName: '([A-Za-z]+)'/g)) used.add(m[1]);
            // The sidebar hand-rolls its filename ('sidebar-bundle.js').
            for (const m of code.matchAll(/'([A-Za-z]+)-bundle\.js'/g)) used.add(m[1]);
        }
        expect(used.size).toBeGreaterThanOrEqual(8);
        const phantom = [...used].filter((u) => !entries.has(u));
        expect(phantom.sort()).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 4. Cross-config id references
// ---------------------------------------------------------------------------

describe('cross-config id references resolve', () => {
    const demoPackages = JSON.parse(
        fs.readFileSync(
            path.join(ROOT, 'src/features/components/config/demo-packages.json'),
            'utf-8'
        )
    );
    const blockLibraries = JSON.parse(
        fs.readFileSync(
            path.join(ROOT, 'src/features/components/config/block-libraries.json'),
            'utf-8'
        )
    );
    const components = JSON.parse(
        fs.readFileSync(path.join(ROOT, 'src/features/components/config/components.json'), 'utf-8')
    );
    const packageIds = new Set<string>(demoPackages.packages.map((p: { id: string }) => p.id));

    it('block-library package references name real packages', () => {
        // A renamed package id silently detaches every default/native/only
        // reference pointing at it — the library just stops applying.
        const refs: string[] = [];
        for (const lib of blockLibraries.libraries) {
            for (const field of ['defaultForPackages', 'nativeForPackages', 'onlyForPackages']) {
                refs.push(...(lib[field] ?? []));
            }
        }
        expect(refs.length).toBeGreaterThan(0); // vacuous-pass guard
        expect(refs.filter((r) => !packageIds.has(r)).sort()).toEqual([]);
    });

    it('demo-package addon references name real components.json addons', () => {
        const addonIds = new Set(Object.keys(components.addons ?? {}));
        const refs = demoPackages.packages.flatMap((p: { addons?: Record<string, unknown> }) =>
            Object.keys(p.addons ?? {})
        );
        expect(refs.length).toBeGreaterThan(0); // vacuous-pass guard
        expect(refs.filter((r: string) => !addonIds.has(r)).sort()).toEqual([]);
    });
});
