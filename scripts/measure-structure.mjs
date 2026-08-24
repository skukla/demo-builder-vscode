#!/usr/bin/env node
/**
 * Structural baseline measurement (backlog: 2026-05-21-structural-baseline.md).
 *
 * Numbers-first, deterministic, re-runnable at any commit:
 *   node scripts/measure-structure.mjs > docs/research/<date>-structural-baseline.md
 *
 * Method notes (stated here and in the report so the numbers are honest):
 * - Functions = function/method/constructor/accessor declarations plus
 *   function expressions and arrow functions with BLOCK bodies (a one-line
 *   `x => y` is an expression, not a countable function body).
 * - Cyclomatic complexity = 1 + decision points (if / for / while / do /
 *   case / catch / ternary / && / || / ??) counted INSIDE the function but
 *   OUTSIDE any nested function (nested functions are measured separately).
 *   This is the standard approximation, not a type-aware CFG.
 * - Imports exclude type-only imports for the coupling counts, matching the
 *   SOP's ">15 imports (excluding types)" threshold.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SRC = path.join(ROOT, 'src');
const TESTS = path.join(ROOT, 'tests');

const ENTRY_POINTS = new Set([
    'extension.ts',
    'mcp-proxy.ts',
    'mcp-server.ts',
    'features/dashboard/ui/aiSurface/index.tsx',
    'features/dashboard/ui/configure/index.tsx',
    'features/dashboard/ui/integrationsSurface/index.tsx',
    'features/dashboard/ui/main.tsx',
    'features/data-installer/ui/index.tsx',
    'features/project-creation/ui/wizard/index.tsx',
    'features/projects-dashboard/ui/index.tsx',
    'features/sidebar/ui/index.tsx',
]);

// SOP thresholds (root CLAUDE.md)
const SOP = { fileLines: 500, fnLines: 50, complexity: 10, imports: 15 };

/** Recursively list files under dir matching the filter. */
function walk(dir, filter, acc = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules') continue;
            walk(p, filter, acc);
        } else if (filter(p)) {
            acc.push(p);
        }
    }
    return acc;
}

const isProd = (p) =>
    /\.(ts|tsx)$/.test(p) && !/\.test\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p) && !/\.testUtils\./.test(p);

const srcFiles = walk(SRC, isProd);
const testFiles = fs.existsSync(TESTS)
    ? walk(TESTS, (p) => /\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p))
    : [];

const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');

/** Feature name for a src-relative path, or null. */
function featureOf(relPath) {
    const m = relPath.match(/^features\/([^/]+)\//);
    return m ? m[1] : null;
}
/** Layer for a src-relative path. */
function layerOf(relPath) {
    if (relPath.startsWith('core/')) return 'core';
    if (relPath.startsWith('features/')) return 'features';
    if (relPath.startsWith('commands/')) return 'commands';
    if (relPath.startsWith('types/')) return 'types';
    return 'root';
}

const DECISION_KINDS = new Set([
    ts.SyntaxKind.IfStatement,
    ts.SyntaxKind.ForStatement,
    ts.SyntaxKind.ForInStatement,
    ts.SyntaxKind.ForOfStatement,
    ts.SyntaxKind.WhileStatement,
    ts.SyntaxKind.DoStatement,
    ts.SyntaxKind.CaseClause,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.ConditionalExpression,
]);
const FN_KINDS = new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.Constructor,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
]);

function isFnWithBody(node) {
    return FN_KINDS.has(node.kind) && node.body && node.body.kind === ts.SyntaxKind.Block;
}

/** Complexity of one function node: 1 + decisions, skipping nested fns. */
function complexityOf(fnNode) {
    let c = 1;
    const visit = (node) => {
        if (node !== fnNode && isFnWithBody(node)) return; // nested fn measured separately
        if (DECISION_KINDS.has(node.kind)) c += 1;
        if (node.kind === ts.SyntaxKind.BinaryExpression) {
            const op = node.operatorToken.kind;
            if (
                op === ts.SyntaxKind.AmpersandAmpersandToken ||
                op === ts.SyntaxKind.BarBarToken ||
                op === ts.SyntaxKind.QuestionQuestionToken
            ) {
                c += 1;
            }
        }
        ts.forEachChild(node, visit);
    };
    ts.forEachChild(fnNode, visit);
    return c;
}

const files = [];
for (const abs of srcFiles) {
    const relPath = rel(abs);
    const text = fs.readFileSync(abs, 'utf8');
    const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, /\.tsx$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const lines = text.split('\n').length;

    const fns = [];
    let exportCount = 0;
    const importSpecs = []; // { spec, typeOnly }

    const visit = (node) => {
        if (isFnWithBody(node)) {
            const start = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
            const end = sf.getLineAndCharacterOfPosition(node.end).line;
            fns.push({ len: end - start + 1, cx: complexityOf(node) });
        }
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            const typeOnly = !!(node.importClause && node.importClause.isTypeOnly);
            importSpecs.push({ spec: node.moduleSpecifier.text, typeOnly });
        }
        if (ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
                importSpecs.push({ spec: node.moduleSpecifier.text, typeOnly: !!node.isTypeOnly });
            }
            if (node.exportClause && ts.isNamedExports(node.exportClause)) {
                exportCount += node.exportClause.elements.length;
            } else {
                exportCount += 1; // export * from
            }
        }
        if (
            (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isVariableStatement(node) ||
             ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) || ts.isEnumDeclaration(node)) &&
            node.modifiers && node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
        ) {
            exportCount += ts.isVariableStatement(node) ? node.declarationList.declarations.length : 1;
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);

    files.push({ relPath, lines, fns, exportCount, importSpecs, text });
}

// ── Import resolution (spec → src-relative file path, or null) ──────────────
const fileSet = new Set(files.map((f) => f.relPath));
function resolveSpec(fromRel, spec) {
    let base = null;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.')) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
    else return null; // external package
    for (const cand of [base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx', base]) {
        if (fileSet.has(cand)) return cand;
    }
    return null;
}

const incoming = new Map(); // target -> Set(source)
const crossFeatureEdges = new Map(); // "A -> B" -> count
for (const f of files) {
    const fromFeature = featureOf(f.relPath);
    for (const { spec, typeOnly } of f.importSpecs) {
        const target = resolveSpec(f.relPath, spec);
        if (target && target !== f.relPath) {
            if (!incoming.has(target)) incoming.set(target, new Set());
            incoming.get(target).add(f.relPath);
        }
        if (typeOnly) continue;
        const toFeature = target ? featureOf(target) : (spec.startsWith('@/features/') ? spec.split('/')[2] : null);
        if (fromFeature && toFeature && fromFeature !== toFeature) {
            const key = `${fromFeature} -> ${toFeature}`;
            crossFeatureEdges.set(key, (crossFeatureEdges.get(key) ?? 0) + 1);
        }
    }
}

// per-file derived metrics
for (const f of files) {
    const nonType = f.importSpecs.filter((s) => !s.typeOnly);
    f.importCount = nonType.length;
    const feats = new Set();
    for (const { spec } of nonType) {
        const t = resolveSpec(f.relPath, spec);
        const feat = t ? featureOf(t) : (spec.startsWith('@/features/') ? spec.split('/')[2] : null);
        if (feat) feats.add(feat);
        else if (spec.startsWith('@/core')) feats.add('core');
    }
    f.uniqueModules = feats.size;
    const own = featureOf(f.relPath);
    f.crossFeatureImports = own ? [...feats].filter((x) => x !== own && x !== 'core').length : 0;
    f.maxFnLen = f.fns.length ? Math.max(...f.fns.map((x) => x.len)) : 0;
    f.avgFnLen = f.fns.length ? f.fns.reduce((a, x) => a + x.len, 0) / f.fns.length : 0;
    f.maxCx = f.fns.length ? Math.max(...f.fns.map((x) => x.cx)) : 0;
    f.avgCx = f.fns.length ? f.fns.reduce((a, x) => a + x.cx, 0) / f.fns.length : 0;
}

// ── Feature aggregation ──────────────────────────────────────────────────────
const features = new Map();
for (const f of files) {
    const feat = featureOf(f.relPath);
    if (!feat) continue;
    if (!features.has(feat)) features.set(feat, { loc: 0, files: 0, barrelExports: 0, barrelLines: 0 });
    const agg = features.get(feat);
    agg.loc += f.lines;
    agg.files += 1;
    if (f.relPath === `features/${feat}/index.ts`) {
        agg.barrelExports = f.exportCount;
        agg.barrelLines = f.lines;
    }
}
// barrel vs deep importers (from outside the feature)
for (const feat of features.keys()) {
    let barrel = 0, deep = 0;
    for (const f of files) {
        if (featureOf(f.relPath) === feat) continue;
        let usesBarrel = false, usesDeep = false;
        for (const { spec } of f.importSpecs) {
            if (spec === `@/features/${feat}`) usesBarrel = true;
            else if (spec.startsWith(`@/features/${feat}/`)) usesDeep = true;
        }
        if (usesBarrel) barrel += 1;
        if (usesDeep) deep += 1;
    }
    Object.assign(features.get(feat), { barrelImporters: barrel, deepImporters: deep });
}
// test LOC per feature
const testLoc = new Map();
let totalTestLoc = 0;
for (const abs of testFiles) {
    const lines = fs.readFileSync(abs, 'utf8').split('\n').length;
    totalTestLoc += lines;
    const relT = path.relative(TESTS, abs).split(path.sep).join('/');
    const m = relT.match(/^(?:unit\/)?features\/([^/]+)\//);
    if (m) testLoc.set(m[1], (testLoc.get(m[1]) ?? 0) + lines);
}

// ── Repo-level ───────────────────────────────────────────────────────────────
const totalProdLoc = files.reduce((a, f) => a + f.lines, 0);
const exportsByLayer = new Map();
for (const f of files) {
    const layer = layerOf(f.relPath);
    exportsByLayer.set(layer, (exportsByLayer.get(layer) ?? 0) + f.exportCount);
}
const orphans = files
    .filter((f) => !incoming.has(f.relPath) && !ENTRY_POINTS.has(f.relPath))
    .map((f) => f.relPath);
const highCoupling = [...incoming.entries()]
    .filter(([, s]) => s.size > 20)
    .map(([t, s]) => ({ target: t, count: s.size }))
    .sort((a, b) => b.count - a.count);

// feature-level cycle detection over crossFeatureEdges
const adj = new Map();
for (const key of crossFeatureEdges.keys()) {
    const [a, b] = key.split(' -> ');
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
}
const featureCycles = [];
for (const [a, tos] of adj) {
    for (const b of tos) {
        if (adj.get(b)?.has(a) && a < b) featureCycles.push(`${a} <-> ${b}`);
    }
}

// pattern hits over prod source
const patterns = {
    '@deprecated': /@deprecated/g,
    'backward(s) compat': /backwards? compat/gi,
    'legacy': /\blegacy\b/gi,
    'TODO|FIXME|XXX': /\b(TODO|FIXME|XXX)\b/g,
    'eslint-disable': /eslint-disable/g,
};
const patternHits = {};
for (const [name, re] of Object.entries(patterns)) {
    patternHits[name] = files.reduce((a, f) => a + (f.text.match(re)?.length ?? 0), 0);
}

// ── Report ───────────────────────────────────────────────────────────────────
const today = process.env.BASELINE_DATE ?? new Date().toISOString().slice(0, 10);
const out = [];
const p = (s = '') => out.push(s);
const pct = (x) => (x * 100).toFixed(0) + '%';
const f1 = (x) => x.toFixed(1);

p(`# Structural Baseline — ${today}`);
p();
p(`> Generated by \`scripts/measure-structure.mjs\` at commit \`${process.env.BASELINE_COMMIT ?? '(uncommitted)'}\`.`);
p(`> Numbers only, per the item's contract — interpretation happens elsewhere.`);
p(`> Complexity is the standard decision-point approximation (see script header).`);
p();
p(`## 1. Headline numbers`);
p();
p(`| Metric | Value |`);
p(`|---|---|`);
p(`| Production files (src, non-test) | ${files.length} |`);
p(`| Production LOC | ${totalProdLoc.toLocaleString('en-US')} |`);
p(`| Test files | ${testFiles.length} |`);
p(`| Test LOC | ${totalTestLoc.toLocaleString('en-US')} |`);
p(`| Test:code LOC ratio | ${(totalTestLoc / totalProdLoc).toFixed(2)} |`);
p(`| Features | ${features.size} |`);
p(`| Cross-feature import edges (pairs) | ${crossFeatureEdges.size} |`);
p(`| Feature-level cycles (mutual imports) | ${featureCycles.length}${featureCycles.length ? ' — ' + featureCycles.join(', ') : ''} |`);
p(`| Orphan candidates (no incoming imports) | ${orphans.length} |`);
p(`| Files with >20 incoming imports | ${highCoupling.length} |`);
p();
p(`## 2. SOP violations`);
p();
p(`Thresholds: file >${SOP.fileLines} lines · function >${SOP.fnLines} lines · complexity >${SOP.complexity} · non-type imports >${SOP.imports}.`);
p();
p(`| File | Lines | Fns | Max fn | Max cx | Imports | Violations |`);
p(`|---|---|---|---|---|---|---|`);
const violators = files
    .map((f) => {
        const v = [];
        if (f.lines > SOP.fileLines) v.push('file-length');
        if (f.maxFnLen > SOP.fnLines) v.push('fn-length');
        if (f.maxCx > SOP.complexity) v.push('complexity');
        if (f.importCount > SOP.imports) v.push('imports');
        return { f, v };
    })
    .filter((x) => x.v.length > 0)
    .sort((a, b) => b.v.length - a.v.length || b.f.lines - a.f.lines);
for (const { f, v } of violators) {
    p(`| ${f.relPath} | ${f.lines} | ${f.fns.length} | ${f.maxFnLen} | ${f.maxCx} | ${f.importCount} | ${v.join(', ')} |`);
}
p();
p(`Total: ${violators.length} of ${files.length} files (${pct(violators.length / files.length)}).`);
p();
p(`## 3. Per-feature size + coupling`);
p();
p(`| Feature | Files | LOC | Test LOC | Test:code | Barrel exports | Barrel importers | Deep importers |`);
p(`|---|---|---|---|---|---|---|---|`);
for (const [feat, a] of [...features.entries()].sort((x, y) => y[1].loc - x[1].loc)) {
    const t = testLoc.get(feat) ?? 0;
    p(`| ${feat} | ${a.files} | ${a.loc.toLocaleString('en-US')} | ${t.toLocaleString('en-US')} | ${(t / a.loc).toFixed(2)} | ${a.barrelExports} | ${a.barrelImporters} | ${a.deepImporters} |`);
}
p();
p(`## 4. Export surface per layer`);
p();
p(`| Layer | Exported symbols |`);
p(`|---|---|`);
for (const [layer, n] of [...exportsByLayer.entries()].sort((a, b) => b[1] - a[1])) {
    p(`| ${layer} | ${n} |`);
}
p();
p(`## 5. Cross-feature import graph`);
p();
p(`Directed edges (importing feature -> imported feature), by import-statement count:`);
p();
for (const [key, n] of [...crossFeatureEdges.entries()].sort((a, b) => b[1] - a[1])) {
    p(`- ${key} (${n})`);
}
p();
p(`## 6. Pattern hits`);
p();
p(`| Pattern | Count |`);
p(`|---|---|`);
for (const [name, n] of Object.entries(patternHits)) {
    p(`| ${name} | ${n} |`);
}
p();
p(`## 7. Orphans and high coupling`);
p();
p(`### Files with no incoming imports (excluding entry points)`);
p();
for (const o of orphans) p(`- ${o}`);
p();
p(`### Files with >20 incoming imports`);
p();
p(`| File | Incoming |`);
p(`|---|---|`);
for (const h of highCoupling) p(`| ${h.target} | ${h.count} |`);
p();
p(`## Method / controls`);
p();
p(`- Function/complexity/export/import counts come from the TypeScript AST; pattern hits from regex over production source; test LOC from raw line counts under \`tests/\`.`);
p(`- Type-only imports are excluded from coupling counts, matching the SOP.`);
p(`- Orphan detection resolves \`@/\` aliases and relative imports only; a file reached exclusively via a dynamic import with a computed specifier would be a false positive here.`);
p(`- Imports from tests/ are NOT counted as incoming: a src file used only by tests appears in the orphan list. That is deliberate — production code whose only consumer is a test is a finding, not noise.`);
p(`- Re-run: \`BASELINE_COMMIT=$(git rev-parse --short HEAD) node scripts/measure-structure.mjs > docs/research/<date>-structural-baseline.md\``);
p();
process.stdout.write(out.join('\n'));
