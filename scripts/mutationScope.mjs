#!/usr/bin/env node
/**
 * WHICH FILES THE MUTATION EFFORT COVERS, decided by rules rather than by a list.
 *
 *   node scripts/mutationScope.mjs            # summary
 *   node scripts/mutationScope.mjs --json     # every file with its verdict and reason
 *   node scripts/mutationScope.mjs --list included
 *
 * WHY GENERATED. A hand-written list of 859 files is a list that rots — the backlog
 * index, the MCP tool catalog and the convention index all rotted here before they were
 * generated, in both directions. This reads the files and re-decides every time, so a
 * new module is classified the day it lands rather than the day someone remembers.
 *
 * The rules are deliberately CONSERVATIVE: a file is excluded only when there is nothing
 * there a mutation could meaningfully change. Everything else is included, because "we
 * have not got to it yet" is a plan, not a category — and quietly dropping files is how
 * a coverage number stops meaning anything.
 *
 * Judgement calls that the rules genuinely cannot make live in mutation-scope.ledger.json,
 * each with a reason. That file may only shrink for `include` overrides.
 */
import { fileURLToPath } from 'url';
import { readFileSync, existsSync, readdirSync, statSync, realpathSync } from 'fs';
import { join, dirname, basename } from 'path';

import micromatch from 'micromatch';

// jest's own project split, so `isReactSuite` answers exactly as jest would.
import jestConfig from '../jest.config.js';

const LEDGER = 'scripts/mutation-scope.ledger.json';

/** Every source file the extension ships, excluding ambient declarations. */
export function sourceFiles(root = 'src') {
    const out = [];
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
        }
    };
    walk(root);
    return out.sort();
}

/**
 * Every suite ANYWHERE in the test tree whose filename names this module.
 *
 * Deliberately NOT the path mirror. The tests do not mirror `src` reliably: dozens of
 * handlers are tested from a sibling feature's folder. A path-mirror census reported 232
 * files as untested, and the first control caught one that has a suite and a pinned
 * mutation score — `spectrumTokens.ts`, then tested from `tests/webview-ui/shared/utils`
 * (that whole tree moved to its subjects' mirror under `tests/core/ui` on 2026-09-02;
 * the handler scatter is what still makes the strict mirror the wrong question here).
 *
 * The looser question is the right one HERE ("is this module tested at all"), and the
 * strict path mirror stays the right one in `focusModule.mjs`, which must select the
 * suites for exactly one module and cannot afford a same-named neighbour.
 *
 * Same-named modules in different folders therefore share a match. `collisions()` reports
 * them rather than hiding them.
 */
let testIndex = null;
function buildTestIndex() {
    const index = new Map();
    const walk = (dir) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.test\.tsx?$/.test(name)) {
                const stem = name.replace(/\.test\.tsx?$/, '');
                // `foo.test.ts`, `foo-topic.test.ts` and `foo.topic.test.ts` all name `foo`.
                const subject = stem.split(/[-.]/)[0];
                for (const key of new Set([stem, subject])) {
                    if (!index.has(key)) index.set(key, []);
                    index.get(key).push(p);
                }
            }
        }
    };
    walk('tests');
    return index;
}

export function suitesFor(modulePath) {
    testIndex ??= buildTestIndex();
    const stem = basename(modulePath).replace(/\.tsx?$/, '');
    return testIndex.get(stem) ?? [];
}

/**
 * How many test files so much as MENTION this module.
 *
 * "No suite named for it" is a strong signal a module has no direct tests. It is NOT
 * proof it is untested: `meshStatusDisplay.ts` has no same-named suite and is referenced
 * by four, because it is exercised through the components that use it. Reporting those
 * two states as one number would overstate the gap and send someone writing tests for
 * code that already has them.
 *
 * An `index` file is searched by its FOLDER name — the word "index" appears in almost
 * every test file and would match everything.
 */
let referenceCorpus = null;
export function testMentions(modulePath) {
    if (!referenceCorpus) {
        referenceCorpus = [];
        const walk = (dir) => {
            for (const name of readdirSync(dir)) {
                const p = join(dir, name);
                if (statSync(p).isDirectory()) walk(p);
                else if (/\.tsx?$/.test(name)) referenceCorpus.push(readFileSync(p, 'utf8'));
            }
        };
        walk('tests');
    }
    let stem = basename(modulePath).replace(/\.tsx?$/, '');
    if (stem === 'index') stem = basename(dirname(modulePath));
    return referenceCorpus.filter((body) => body.includes(stem)).length;
}

/**
 * Does this suite run under the REACT (jsdom) jest project rather than the node one?
 *
 * Mirrors the `testMatch` split in `jest.config.js`: the whole `tests/core/ui` subtree
 * is react whatever the extension, and a `.test.tsx` under `tests/features` is too.
 *
 * WHY IT MATTERS HERE. The focused runner builds its config from the NODE project, so a
 * module whose every suite is react gets measured with no test that can run — which is
 * the confident-zero failure this instrument keeps producing. It bit on 2026-09-03: the
 * scope rule blocked `.tsx` SOURCE files but said nothing about a `.ts` source whose
 * TESTS are react, so twenty `src/core/ui/hooks/*.ts` modules entered the sweep and
 * every one of them failed.
 */
export function isReactSuite(suitePath) {
    // Decided by jest's OWN config, with jest's own matcher, so this cannot drift from
    // it. The first version mirrored the two testMatch rules by hand and was wrong the
    // same day: a third rule (feature hook suites, `use*.test.ts`) was added to
    // jest.config.js and this function did not know, so eighteen modules were handed
    // to the node project and failed.
    const react = jestConfig.projects.find((p) => p.displayName === 'react');
    return micromatch.isMatch(suitePath, react.testMatch);
}

/** Measurable properties, all of them checkable by reading the file. */
export function profile(path) {
    const src = readFileSync(path, 'utf8');
    const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const count = (re) => (stripped.match(re) ?? []).length;
    const codeLines = stripped.split('\n').filter((l) => l.trim()).length;
    return {
        path,
        codeLines,
        awaits: count(/\bawait\b/g),
        branches: count(/\b(if|switch|for|while)\s*\(/g) + count(/\?\s*[^:]{1,60}:/g),
        functions: count(/\bfunction\b/g) + count(/=>/g),
        reexports: count(/^export\s.*\bfrom\s/gm),
        exports: count(/^export\s/gm),
        declarations: count(/^(export\s+)?(interface|type|enum)\s/gm),
        isTsx: path.endsWith('.tsx'),
        suites: suitesFor(path).length,
        nodeSuites: suitesFor(path).filter((s) => !isReactSuite(s)).length,
        mentions: testMentions(path),
    };
}

/**
 * The verdict, and the reason in words.
 *
 * Order matters: the first rule that fires wins, and the excluding rules come first so
 * their reason is the one reported.
 */
export function classify(p, ledger) {
    const override = ledger.overrides?.[p.path];
    if (override) return { verdict: override.verdict, reason: override.reason, source: 'ledger' };

    if (p.reexports > 0 && p.functions <= 2 && p.branches === 0) {
        return { verdict: 'exclude', reason: 'barrel — re-exports only, no logic of its own' };
    }
    if (p.declarations > 0 && p.functions === 0 && p.branches === 0) {
        return { verdict: 'exclude', reason: 'type-only — declarations, nothing executes' };
    }
    if (p.branches === 0 && p.functions === 0) {
        return { verdict: 'exclude', reason: 'constants — data with no decisions in it' };
    }
    if (p.suites === 0) {
        return p.mentions === 0
            ? {
                  verdict: 'blocked',
                  reason: 'no tests at all — nothing in the suite so much as mentions it',
              }
            : {
                  verdict: 'blocked',
                  reason: 'no suite of its own — mentioned by other tests, may be covered indirectly',
              };
    }
    // NO REACT BLOCK. Two rules used to sit here — one on `.tsx` sources, one on `.ts`
    // sources whose every suite is a React suite — and both existed for a single reason:
    // the focused runner built its jest config from the NODE project, so a jsdom suite
    // could not run. `focusModule.mjs` now picks the project from the SUITES, and runs a
    // module with suites in both environments under jsdom, which is a superset of what
    // the node ones need. Verified 2026-09-03 with zero errors in each case:
    // `useSelection.ts` (React hook) 90.00%, `BrandGallery.tsx` (both environments)
    // 27.59%.
    //
    // 156 files — a third of the codebase — were invisible to this instrument for as
    // long as those two rules stood, and the second of them was written the same day.
    return { verdict: 'include', reason: 'has decisions and a suite that can be re-run' };
}

/** Async density predicts what score is ACHIEVABLE — see the thresholds doc. */
export function tierOf(p) {
    if (p.awaits === 0) return 'pure';
    const density = (p.awaits / Math.max(p.codeLines, 1)) * 100;
    return density > 4 ? 'orchestration' : 'mixed';
}

function main() {
    const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
    const rows = sourceFiles().map((f) => {
        const p = profile(f);
        const c = classify(p, ledger);
        return { ...p, ...c, tier: c.verdict === 'include' ? tierOf(p) : null };
    });

    if (process.argv.includes('--json')) {
        console.log(JSON.stringify(rows, null, 1));
        return;
    }
    const listFlag = process.argv.indexOf('--list');
    if (listFlag !== -1) {
        const want = process.argv[listFlag + 1];
        rows.filter((r) => r.verdict === want).forEach((r) => console.log(r.path));
        return;
    }

    const by = (k) => rows.filter((r) => r.verdict === k);
    console.log(`${rows.length} source files\n`);
    for (const v of ['include', 'blocked', 'exclude']) {
        const g = by(v);
        console.log(`${v.toUpperCase().padEnd(9)} ${String(g.length).padStart(4)}`);
        const reasons = {};
        for (const r of g) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
        for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
            console.log(`            ${String(n).padStart(4)}  ${reason}`);
        }
    }
    console.log('\nINCLUDED, by tier (async density decides the realistic target):');
    for (const t of ['pure', 'mixed', 'orchestration']) {
        const g = by('include').filter((r) => r.tier === t);
        const lines = g.reduce((n, r) => n + r.codeLines, 0);
        console.log(`   ${t.padEnd(14)} ${String(g.length).padStart(4)} files, ${lines} code lines`);
    }
}

/**
 * Only run the CLI when this file IS the command, not when another script imports it.
 * Without this, importing `tierOf` executes main() against the IMPORTER's argv — the sweep
 * runner's `--minutes 480` was read as a module path and exited 1 before doing anything.
 */
const isEntryPoint =
    !!process.argv[1] &&
    existsSync(process.argv[1]) &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) main();
