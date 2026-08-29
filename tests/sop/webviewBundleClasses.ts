/**
 * Which CSS classes each webview bundle can actually style (ADR-017 §6).
 *
 * A feature stylesheet reaches a bundle only through a side-effect `import`
 * somewhere in THAT entry's graph. So a component reused across surfaces can be
 * styled on one and unstyled on the next — and the failure is completely silent:
 * no compile error, no console warning, no failing test. The element just
 * renders raw. It shipped that way once already (2026-07-31, `DestinationStage`
 * using EDS's `.service-action-link` on the integrations surface).
 *
 * The graph comes from ESBUILD ITSELF, not from a hand-rolled import walker, and
 * it reuses the real `aliasPlugin` and the real `WEBVIEW_ENTRIES` out of
 * `esbuild.config.js`. A second copy of the resolver would eventually disagree
 * with the build, and then this check would be confidently wrong about which
 * files are in a bundle — which is worse than not checking. Cost: ~1.2s for all
 * eight entries.
 */

import * as esbuild from 'esbuild';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

 
const { WEBVIEW_ENTRIES, aliasPlugin } = require('../../esbuild.config.js') as {
    WEBVIEW_ENTRIES: Record<string, string>;
    aliasPlugin: esbuild.Plugin;
};

/**
 * Class selectors in a stylesheet.
 *
 * NO leading-delimiter requirement, deliberately. The first version of this
 * required a delimiter before the dot and therefore read `.db-drawer.open` as
 * defining only `db-drawer` — the second half of every COMPOUND selector was
 * invisible, and classes applied conditionally (`cn('db-drawer', isOpen &&
 * 'open')`) looked undefined. That is a false positive, which is the one failure
 * mode that makes a check worse than nothing.
 *
 * Requiring a letter/underscore/hyphen after the dot is what keeps `0.5` out.
 */
const CLASS_DEF = /\.(-?[_a-zA-Z][\w-]*)/g;

/** `className="a b"`, `UNSAFE_className='a'`, `className={...}` */
const CLASS_ATTR = /(?:UNSAFE_)?className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{([^}]*)\})/g;
const CN_CALL = /\bcn\(([^)]*)\)/g;
const STRING_LITERAL = /['"`]([^'"`]*)['"`]/g;

/** Spectrum's own classes come from the library, not from our sheets. */
const VENDOR_PREFIX = /^spectrum-/;

export interface UsageReport {
    /** class -> "<bundle>:<file>" sites that use it without the bundle styling it */
    crossBundle: Map<string, Set<string>>;
    /** Sites whose class list could not be read statically. Reported, never hidden. */
    dynamicSites: number;
}

function classesDefinedIn(cssPath: string): Set<string> {
    const css = readFileSync(cssPath, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Drop declaration bodies so `content: ".x"` and lengths cannot be read
        // as selectors.
        .replace(/\{[^{}]*\}/g, '{}');
    const found = new Set<string>();
    for (const m of css.matchAll(CLASS_DEF)) found.add(m[1]);
    return found;
}

/**
 * Classes a component asks for, plus how many sites could not be read.
 *
 * A template literal makes the whole expression unreadable — `` `card${sel ? '
 * is-selected' : ''}` `` yields fragments like `card${sel`, not classes. Those
 * expressions contribute NOTHING and are counted instead. A check that silently
 * drops what it cannot parse reports clean for the wrong reason.
 */
function classesUsedIn(filePath: string): { used: Set<string>; dynamic: number } {
    const source = readFileSync(filePath, 'utf8');
    const used = new Set<string>();
    let dynamic = 0;

    const addAll = (text: string): void => {
        for (const token of text.split(/\s+/)) if (token) used.add(token);
    };

    for (const m of source.matchAll(CLASS_ATTR)) {
        if (m[1] !== undefined) {
            addAll(m[1]);
            continue;
        }
        if (m[2] !== undefined) {
            addAll(m[2]);
            continue;
        }
        const expression = m[3];
        if (expression.includes('${')) {
            dynamic++;
            continue;
        }
        let sawLiteral = false;
        for (const lit of expression.matchAll(STRING_LITERAL)) {
            addAll(lit[1]);
            sawLiteral = true;
        }
        if (!sawLiteral) dynamic++;
    }

    for (const m of source.matchAll(CN_CALL)) {
        if (m[1].includes('${')) continue;
        for (const lit of m[1].matchAll(STRING_LITERAL)) addAll(lit[1]);
    }

    return { used, dynamic };
}

/** Every class any stylesheet under `src/` defines — the "exists at all" set. */
export function classesDefinedAnywhere(root: string): Set<string> {
    const all = new Set<string>();
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (full.endsWith('.css')) for (const c of classesDefinedIn(full)) all.add(c);
        }
    };
    walk(join(root, 'src'));
    return all;
}

/**
 * Build every entry and report classes used but unstyled IN THAT BUNDLE.
 *
 * Only classes defined SOMEWHERE under `src/` are reported. A class defined in
 * no stylesheet at all is a different defect — dead markup, or an element nobody
 * ever styled — and mixing the two would bury this rule's findings under a much
 * larger, noisier set. That set is real and worth its own pass; it is not what
 * ADR-017 §6 rules on.
 */
export async function reportBundleClassUsage(root: string): Promise<UsageReport> {
    const definedAnywhere = classesDefinedAnywhere(root);
    const crossBundle = new Map<string, Set<string>>();
    let dynamicSites = 0;

    for (const [bundle, entry] of Object.entries(WEBVIEW_ENTRIES)) {
        const result = await esbuild.build({
            entryPoints: [entry],
            bundle: true,
            write: false,
            metafile: true,
            format: 'iife',
            platform: 'browser',
            target: ['chrome91'],
            absWorkingDir: root,
            loader: {
                '.css': 'text',
                '.png': 'empty',
                '.jpg': 'empty',
                '.svg': 'empty',
                '.gif': 'empty',
            },
            define: { 'process.env.NODE_ENV': '"development"' },
            plugins: [aliasPlugin],
            logLevel: 'silent',
        });

        const inputs = Object.keys(result.metafile.inputs);
        const styledHere = new Set<string>();
        for (const css of inputs.filter((f) => f.endsWith('.css'))) {
            for (const c of classesDefinedIn(join(root, css))) styledHere.add(c);
        }

        for (const file of inputs.filter((f) => /\.tsx?$/.test(f) && f.startsWith('src/'))) {
            const { used, dynamic } = classesUsedIn(join(root, file));
            dynamicSites += dynamic;
            for (const cls of used) {
                if (styledHere.has(cls) || VENDOR_PREFIX.test(cls)) continue;
                if (!definedAnywhere.has(cls)) continue;
                if (!crossBundle.has(cls)) crossBundle.set(cls, new Set());
                crossBundle.get(cls)?.add(`${bundle}:${file}`);
            }
        }
    }

    return { crossBundle, dynamicSites };
}
