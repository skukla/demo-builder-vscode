#!/usr/bin/env node
/**
 * Survey casts to a type, by SYNTACTIC POSITION.
 *
 *   node scripts/codemod/survey-casts.mjs HandlerContext
 *   node scripts/codemod/survey-casts.mjs "Partial<Project>" --files 'tests/**\/*.ts'
 *
 * Reads, never writes. This is step one of the documented workflow: know what the
 * corpus IS before transforming it. Position is the thing that decides treatment
 * and the thing a regex cannot tell you:
 *
 *   handler(x as any)      ARGUMENT     — a silenced type error; read each one
 *   const y = x as any;    DECLARATION  — SAFE to attempt in bulk, which is not the
 *                                   same as likely to succeed: measured 2026-09-01,
 *                                   84% of `as never` and 69% of `as any` in this
 *                                   position were load-bearing. The compiler catches
 *                                   every one, so bulk is safe; expect a low yield.
 *   return x as any;       RETURN       — a silenced contract
 *   (x as any).foo         ACCESS       — reaching past the type to poke at it
 *
 * Four production defects in this repo hid behind the ARGUMENT shape — a field the
 * callee dispatches on, wrong or absent, with twelve tests agreeing. So the counts
 * below are not trivia: they say how much of a family is mechanical and how much
 * needs a person.
 *
 * @see docs/development/toolchain.md
 * @see .claude/skills/ask-the-tool/SKILL.md
 */
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject } from './project.mjs';

const argv = process.argv.slice(2);
const TYPE = argv[0];
if (!TYPE) {
    console.error('usage: survey-casts.mjs <TypeText> [--files <glob>] [--list]');
    process.exit(2);
}
const globIdx = argv.indexOf('--files');
const GLOB = globIdx >= 0 ? argv[globIdx + 1] : 'tests/**/*.ts';
const LIST = argv.includes('--list');

/** Where a cast sits, which is what decides how it may be treated. */
function position(node) {
    const parent = node.getParent();
    if (!parent) return 'ORPHAN';
    switch (parent.getKind()) {
        case SyntaxKind.CallExpression:
        case SyntaxKind.NewExpression:
            // only an ARGUMENT, not the callee itself
            return parent.getArguments?.().includes(node) ? 'ARGUMENT' : 'CALLEE';
        case SyntaxKind.VariableDeclaration:
        case SyntaxKind.PropertyAssignment:
        case SyntaxKind.PropertyDeclaration:
            return 'DECLARATION';
        case SyntaxKind.ReturnStatement:
            return 'RETURN';
        case SyntaxKind.PropertyAccessExpression:
        case SyntaxKind.ElementAccessExpression:
            return 'ACCESS';
        case SyntaxKind.AsExpression:
            return 'NESTED';
        default:
            return parent.getKindName().toUpperCase();
    }
}

const project = createProject();
// Read-only: a survey wants to SEE the protected directories too, and
// `saveTouched` refuses to write them regardless.
const files = addFiles(project, [GLOB], { readOnly: true });

const byPosition = new Map();
const byFile = new Map();
let total = 0;

for (const file of files) {
    for (const cast of file.getDescendantsOfKind(SyntaxKind.AsExpression)) {
        if (cast.getTypeNode()?.getText() !== TYPE) continue;
        total += 1;
        const pos = position(cast);
        byPosition.set(pos, (byPosition.get(pos) ?? 0) + 1);
        const rel = file.getFilePath().replace(`${process.cwd()}/`, '');
        if (!byFile.has(rel)) byFile.set(rel, []);
        byFile.get(rel).push({ pos, line: cast.getStartLineNumber() });
    }
}

console.log(`\ncasts to \`${TYPE}\` under ${GLOB}\n`);
console.log(`  files scanned : ${files.length}`);
console.log(`  casts found   : ${total}\n`);

if (total === 0) {
    // A zero must mean "none there", not "never looked".
    console.log('  none. CONTROL: files scanned is above — if that is 0, the glob is wrong.');
    process.exit(0);
}

for (const [pos, n] of [...byPosition].sort((a, b) => b[1] - a[1])) {
    const treatment =
        pos === 'ARGUMENT'
            ? 'read each — this shape has hidden four real defects'
            : pos === 'DECLARATION'
              ? 'safe to ATTEMPT in bulk — most are still load-bearing'
              : 'inspect';
    console.log(`  ${String(n).padStart(4)}  ${pos.padEnd(12)} ${treatment}`);
}

console.log(`\n  ${byFile.size} file(s) affected; top 10:`);
for (const [f, hits] of [...byFile].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`    ${String(hits.length).padStart(3)}  ${f}`);
}

if (LIST) {
    console.log('\n  every site:');
    for (const [f, hits] of [...byFile].sort()) {
        for (const h of hits) console.log(`    ${f}:${h.line}  ${h.pos}`);
    }
}
