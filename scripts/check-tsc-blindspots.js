#!/usr/bin/env node
/**
 * Compiler blind-spot check: every .ts/.tsx a tsconfig's include globs SHOULD
 * cover must actually be in tsc's file set.
 *
 * Why this exists: tsc's include globs keep only ONE file per basename per
 * directory (.ts beats .tsx beats .d.ts). A file pair like `index.ts` +
 * `index.tsx` therefore leaves the .tsx SILENTLY UNCHECKED — no error, no
 * warning, it just never typechecks. That is exactly how the dashboard webview
 * entry (`src/features/dashboard/ui/index.tsx`, beside an `index.ts` barrel)
 * went unchecked for months and hid a dead `data?.brandName` wire read
 * (fixed in 20f45f8f; entry renamed to main.tsx).
 *
 * Checks BOTH configs — tsconfig.json (src/, excludes *.test.*) and
 * tsconfig.test.json (src/ + tests/, no test exclusion) — because the
 * shadowing rule applies identically to each.
 *
 * Usage:
 *   node scripts/check-tsc-blindspots.js
 *   npm run validate:tsc-blindspots
 *
 * Exit codes: 0 = every expected file is checked; 1 = blind spots found.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/**
 * The configs to verify, each with the on-disk tree(s) its `include` covers
 * and the exclusion the config declares. Mirrors tsconfig.json /
 * tsconfig.test.json — if their include/exclude change, change this too.
 */
const CONFIGS = [
    {
        project: 'tsconfig.json',
        roots: ['src'],
        // tsconfig.json excludes **/*.test.ts(x); tests/ and webview-ui/ are
        // outside src/, so the roots already exclude them.
        excludeFile: (file) => /\.test\.tsx?$/.test(file),
    },
    {
        project: 'tsconfig.test.json',
        roots: ['src', 'tests'],
        excludeFile: () => false,
    },
];

/** Recursively collect .ts/.tsx/.d.ts files under a directory (repo-relative). */
function collectSourceFiles(dir, out) {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectSourceFiles(rel, out);
        } else if (/\.tsx?$/.test(entry.name)) {
            out.push(rel);
        }
    }
    return out;
}

/** The repo-relative files tsc actually resolves for a project. */
function listCheckedFiles(project) {
    const stdout = execFileSync(
        'npx',
        ['tsc', '--noEmit', '--listFilesOnly', '-p', project],
        { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return new Set(
        stdout
            .split('\n')
            .filter((line) => line.startsWith(ROOT + path.sep))
            .map((line) => path.relative(ROOT, line.trim())),
    );
}

let failed = false;

for (const { project, roots, excludeFile } of CONFIGS) {
    const expected = roots
        .flatMap((root) => collectSourceFiles(root, []))
        .filter((file) => !excludeFile(file));
    const checked = listCheckedFiles(project);
    const missing = expected.filter((file) => !checked.has(file));

    // A vacuous pass is not a pass: if tsc resolved nothing from the repo, the
    // invocation itself is broken and "no blind spots" would be a false all-clear.
    if (checked.size === 0) {
        console.error(`✖ ${project}: tsc resolved ZERO repo files — the check did not run.`);
        failed = true;
        continue;
    }

    if (missing.length > 0) {
        failed = true;
        console.error(`✖ ${project}: ${missing.length} file(s) on disk are NEVER typechecked:`);
        for (const file of missing) {
            console.error(`    ${file}`);
        }
        console.error(
            '  Likely cause: a same-basename sibling (index.ts beside index.tsx) — tsc\n' +
                '  include globs keep one file per basename. Rename one of the pair\n' +
                '  (see src/features/dashboard/ui/main.tsx for the precedent).',
        );
    } else {
        console.log(`✓ ${project}: all ${expected.length} expected files are typechecked.`);
    }
}

process.exit(failed ? 1 : 0);
