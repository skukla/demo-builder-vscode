#!/usr/bin/env node
/**
 * Which argument-position `as any` casts are actually SILENCING a typed parameter?
 *
 *   node scripts/codemod/intersect-unsafe-casts.mjs <eslint-unsafe-json>
 *
 * WHY AN INTERSECTION. Two signals, each incomplete on its own:
 *
 *   the AST         knows which casts sit in ARGUMENT position — 752 of them — but
 *                   not whether the parameter they feed declares a real type.
 *   no-unsafe-      knows an `any` is reaching a typed parameter — 1,029 findings —
 *   argument        but not whether an explicit cast put it there. Most of those
 *                   1,029 are `any` from untyped mocks and `requireMock`, which is a
 *                   different job.
 *
 * The overlap is the set that matters: a cast someone WROTE, in the position the
 * handbook calls a silenced type error, feeding a parameter that declares a type.
 * Four production defects in this repo hid in exactly that shape — a field the
 * callee dispatches on, wrong or absent, with twelve tests agreeing.
 *
 * WHY `no-unnecessary-type-assertion` CANNOT DO THIS. It flags assertions that do
 * not change the type. `as any` always changes the type, so that rule never sees one
 * — measured, not assumed. The lesson from it ("ask the checker whether the
 * assertion does anything") does not transfer; the PRINCIPLE ("find a type-aware
 * rule that answers your actual question") is what transfers, and this is it.
 *
 * Reads, never writes. This produces a worklist, not a transformation: each site
 * needs the real type supplied, which is a per-call decision no tool holds.
 *
 * @see docs/development/toolchain.md
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section C4
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject } from './project.mjs';

const REPORT = process.argv[2];
if (!REPORT) {
    console.error('usage: intersect-unsafe-casts.mjs <eslint-unsafe-json>');
    process.exit(2);
}

/** file -> Set of lines where an `any` reaches a typed parameter. */
const unsafe = new Map();
for (const entry of JSON.parse(fs.readFileSync(REPORT, 'utf8'))) {
    const rel = path.relative(process.cwd(), entry.filePath);
    for (const m of entry.messages) {
        if (m.ruleId !== '@typescript-eslint/no-unsafe-argument') continue;
        if (!unsafe.has(rel)) unsafe.set(rel, new Set());
        unsafe.get(rel).add(m.line);
    }
}

const project = createProject();
const files = addFiles(project, ['tests/**/*.ts', 'tests/**/*.tsx'], { readOnly: true });

let argCasts = 0;
let intersect = 0;
const byFile = new Map();

for (const file of files) {
    const rel = path.relative(process.cwd(), file.getFilePath());
    const lines = unsafe.get(rel);

    for (const cast of file.getDescendantsOfKind(SyntaxKind.AsExpression)) {
        const t = cast.getTypeNode()?.getText();
        if (t !== 'any' && t !== 'never') continue;
        const parent = cast.getParent();
        const isArg =
            (parent?.getKind() === SyntaxKind.CallExpression ||
                parent?.getKind() === SyntaxKind.NewExpression) &&
            parent.getArguments?.().includes(cast);
        if (!isArg) continue;
        argCasts += 1;

        if (lines?.has(cast.getStartLineNumber())) {
            intersect += 1;
            if (!byFile.has(rel)) byFile.set(rel, []);
            byFile.get(rel).push(cast.getStartLineNumber());
        }
    }
}

const totalUnsafe = [...unsafe.values()].reduce((n, s) => n + s.size, 0);

console.log('\nargument-position casts vs the checker\n');
console.log(`  argument-position \`as any\`/\`as never\` : ${argCasts}`);
console.log(`  no-unsafe-argument findings            : ${totalUnsafe}`);
console.log(`  BOTH — a written cast silencing a type : ${intersect}`);
console.log(`  across files                           : ${byFile.size}\n`);

// A zero in either input would make the intersection meaningless.
console.log(`  CONTROL: ${files.length} files parsed, ${unsafe.size} in the eslint report`);

console.log('\n  worst files:');
for (const [f, ls] of [...byFile].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`    ${String(ls.length).padStart(3)}  ${f}`);
}
