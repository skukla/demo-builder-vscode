/**
 * PROTOTYPE — derive the runtime-surface inventory from a boilerplate checkout.
 *
 * Feasibility prototype for ADR-008. Statically scans a cloned EDS storefront
 * boilerplate for the content paths its CODE fetches at runtime — the documents
 * that a working demo needs but that nothing in the published CONTENT links to,
 * so reference-following discovery can never reach them. Today those paths are
 * hand-maintained in `src/features/eds/services/runtimeSurfaceInventory.ts`; this
 * tool measures how much of that list can be regenerated mechanically from
 * Adobe's boilerplate instead of remembered by a developer.
 *
 * This is NOT extension runtime code. The production home (per ADR-006) is the
 * daily last-known-good gate in `skukla/eds-demo-patches`, which already clones
 * canonical every day — see the ADR for the productionization path.
 *
 * Usage:
 *   node scripts/runtime-surfaces/deriveRuntimeSurfaces.mjs <boilerplate-dir> [--json]
 *
 * Exit code is always 0 — this reports, it does not gate. Drift between the
 * derived set and the hand list is printed for a human to act on.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

/**
 * The current hand-maintained inventory (mirror of runtimeSurfaceInventory.ts as
 * of ADR-008). Baseline for the drift diff. Kept inline so the prototype is
 * self-contained; productionizing would read the real module.
 */
export const HAND_LIST = {
    spreadsheets: ['/placeholders', '/redirects', '/metadata', '/sitemap'],
    fragments: ['/nav', '/footer'],
    authPages: ['/customer/login', '/customer/account', '/customer/create-account'],
    placeholderSheets: [
        'placeholders/global', 'placeholders/auth', 'placeholders/cart',
        'placeholders/checkout', 'placeholders/order', 'placeholders/account',
        'placeholders/payment-services', 'placeholders/recommendations', 'placeholders/wishlist',
    ],
};

/** Flatten the hand list to a single set of declared paths. */
export function handListPaths(handList = HAND_LIST) {
    return new Set([
        ...handList.spreadsheets,
        ...handList.fragments,
        ...handList.authPages,
        ...handList.placeholderSheets,
    ]);
}

const lineOf = (content, index) => content.slice(0, index).split('\n').length;

/**
 * Pure extractor. Given a list of `{ path, content }` source files, derive the
 * runtime surfaces the code references, with provenance (first file:line) and a
 * note flagging derivation-confidence caveats. No filesystem access — unit-testable.
 *
 * @param {{path: string, content: string}[]} files
 */
export function extractSurfacesFromFiles(files) {
    /** category -> Map<surfacePath, { provenance, note }> (first occurrence wins) */
    const buckets = {
        fragments: new Map(),
        navFooter: new Map(),
        placeholderSheets: new Map(),
        customerPages: new Map(),
    };
    const diagnostics = { bareFetchPlaceholders: 0, metadataOverridable: [] };

    const record = (bucket, surfacePath, file, content, index, note) => {
        if (!buckets[bucket].has(surfacePath)) {
            buckets[bucket].set(surfacePath, { provenance: `${file}:${lineOf(content, index)}`, note });
        }
    };

    for (const { path: file, content } of files) {
        let m;

        // 1. Code-loaded fragments: loadFragment('/customer/sidebar-fragment'), etc.
        //    These are the orphan fragments NOTHING in content links to.
        const fragRe = /loadFragment\(\s*['"`]([^'"`]+)['"`]/g;
        while ((m = fragRe.exec(content)) !== null) {
            record('fragments', m[1], file, content, m.index, 'code-loaded fragment (unreachable by content crawl)');
        }

        // 2. nav / footer: getMetadata('nav') with a '/nav' fallback. The REAL path
        //    is metadata-overridable, so the literal is the default, not a guarantee.
        const metaRe = /getMetadata\(\s*['"](nav|footer)['"]\s*\)/g;
        while ((m = metaRe.exec(content)) !== null) {
            const surface = `/${m[1]}`;
            record('navFooter', surface, file, content, m.index, 'metadata-overridable: real path is <meta name="' + m[1] + '"> if the page sets it');
            if (!diagnostics.metadataOverridable.includes(surface)) diagnostics.metadataOverridable.push(surface);
        }

        // 3. Placeholder sheets: explicit 'placeholders/<name>' string literals,
        //    written with a '.json' suffix in real code (fetchPlaceholders(
        //    'placeholders/checkout.json')). Normalize to the extension-free form
        //    the inventory uses. Backticks included for non-interpolated literals.
        const sheetRe = /['"`](placeholders\/[a-z0-9.-]+)['"`]/g;
        while ((m = sheetRe.exec(content)) !== null) {
            const sheet = m[1].replace(/\.json$/, '');
            record('placeholderSheets', sheet, file, content, m.index, 'explicit placeholder sheet');
        }
        // 3b. Bare fetchPlaceholders() with no sheet arg => the default '/placeholders'.
        const bareRe = /fetchPlaceholders\(\s*\)/g;
        while ((m = bareRe.exec(content)) !== null) {
            diagnostics.bareFetchPlaceholders += 1;
            record('placeholderSheets', '/placeholders', file, content, m.index, 'default sheet (bare fetchPlaceholders())');
        }

        // 4. Customer/auth pages referenced as string literals in executable code.
        //    Skip type decls and docs (.d.ts / README handled by the file filter).
        const custRe = /['"`](\/customer\/[a-z0-9-]+)['"`]/g;
        while ((m = custRe.exec(content)) !== null) {
            record('customerPages', m[1], file, content, m.index, 'referenced by storefront code');
        }
    }

    const toArr = (map) => [...map.entries()]
        .map(([surfacePath, meta]) => ({ path: surfacePath, ...meta }))
        .sort((a, b) => a.path.localeCompare(b.path));

    return {
        surfaces: {
            fragments: toArr(buckets.fragments),
            navFooter: toArr(buckets.navFooter),
            placeholderSheets: toArr(buckets.placeholderSheets),
            customerPages: toArr(buckets.customerPages),
        },
        diagnostics,
    };
}

/** All derived surface paths as a flat set. */
export function derivedPaths(result) {
    const out = new Set();
    for (const list of Object.values(result.surfaces)) {
        for (const { path } of list) out.add(path);
    }
    return out;
}

/**
 * Diff derived surfaces against the hand list.
 * - derivedOnly: code references it, the hand list doesn't  → candidate gap / drift
 * - handOnly:    hand list has it, the scan didn't           → content-only, or stale
 * - both:        agreement
 */
export function compareToHandList(result, handList = HAND_LIST) {
    const derived = derivedPaths(result);
    const declared = handListPaths(handList);
    const derivedOnly = [...derived].filter((p) => !declared.has(p)).sort();
    const handOnly = [...declared].filter((p) => !derived.has(p)).sort();
    const both = [...derived].filter((p) => declared.has(p)).sort();
    return { derivedOnly, handOnly, both };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const SCAN_EXT = new Set(['.js', '.html']);
const SKIP_DIR = new Set(['node_modules', '.git', 'cypress', 'fonts', 'icons']);

function collectFiles(root) {
    const files = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            if (SKIP_DIR.has(name)) continue;
            const full = join(dir, name);
            const st = statSync(full);
            if (st.isDirectory()) { walk(full); continue; }
            if (!SCAN_EXT.has(extname(name))) continue;
            if (name.endsWith('.d.ts')) continue; // type decls aren't runtime fetches
            files.push({ path: relative(root, full), content: readFileSync(full, 'utf8') });
        }
    };
    walk(root);
    return files;
}

function main(argv) {
    const args = argv.slice(2);
    const json = args.includes('--json');
    const root = args.find((a) => !a.startsWith('--'));
    if (!root) {
        console.error('usage: node deriveRuntimeSurfaces.mjs <boilerplate-dir> [--json]');
        process.exit(2);
    }

    const files = collectFiles(root);
    const result = extractSurfacesFromFiles(files);
    const diff = compareToHandList(result);

    if (json) {
        console.log(JSON.stringify({ scannedFiles: files.length, ...result, diff }, null, 2));
        return;
    }

    const count = (k) => result.surfaces[k].length;
    console.log(`\nDerived runtime surfaces from ${files.length} scanned files\n${'='.repeat(58)}`);
    for (const [cat, list] of Object.entries(result.surfaces)) {
        console.log(`\n${cat} (${list.length}):`);
        for (const { path, provenance, note } of list) {
            console.log(`  ${path.padEnd(34)} ${provenance.padEnd(46)} ${note}`);
        }
    }
    console.log(`\nDiagnostics: ${result.diagnostics.bareFetchPlaceholders} bare fetchPlaceholders() (default sheet);`
        + ` metadata-overridable: ${result.diagnostics.metadataOverridable.join(', ') || 'none'}`);

    console.log(`\nDrift vs hand-maintained inventory\n${'-'.repeat(58)}`);
    console.log(`  agree (in both):           ${diff.both.length}  ${diff.both.join(', ')}`);
    console.log(`  DERIVED-ONLY (hand list misses): ${diff.derivedOnly.length}`);
    for (const p of diff.derivedOnly) console.log(`      + ${p}`);
    console.log(`  HAND-ONLY (scan missed; content-only or stale): ${diff.handOnly.length}`);
    for (const p of diff.handOnly) console.log(`      - ${p}`);
    console.log(`\nTotals: ${derivedPaths(result).size} derived, ${handListPaths().size} declared by hand,`
        + ` ${count('fragments')} code-loaded fragments\n`);
}

// Run only when invoked directly, not when imported by the test.
if (import.meta.url === `file://${process.argv[1]}`) {
    main(process.argv);
}
