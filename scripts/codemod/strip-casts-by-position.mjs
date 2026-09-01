#!/usr/bin/env node
/**
 * Remove `as any` / `as never` casts in ONE syntactic position, then let the
 * compiler say which of them were load-bearing.
 *
 *   node scripts/codemod/strip-casts-by-position.mjs never DECLARATION
 *   node scripts/codemod/strip-casts-by-position.mjs any DECLARATION --write
 *
 * POSITION IS THE WHOLE POINT, and it is why this is not one big strip. The survey
 * (`survey-casts.mjs`) counts 1,451 of these across two types, and they are not one
 * problem:
 *
 *   ARGUMENT     752  a SILENCED TYPE ERROR. Four production defects in this repo
 *                     hid behind exactly this shape — a field the callee dispatches
 *                     on, wrong or absent, with twelve tests agreeing. These get
 *                     READ, one at a time, never batched.
 *   DECLARATION  309  `const x = {...} as any` — usually a fake the compiler was
 *                     told to stop checking. Removing it lets the literal's own type
 *                     stand, and the compiler adjudicates.
 *   the rest     390  access, return, binary — inspect per shape.
 *
 * A text-based pass over `as never` on 2026-09-01 removed 215 and also deleted the
 * pattern from inside a detector's own control fixtures, silently disabling the
 * proof that the detector works. This runs on the syntax tree, where a string is not
 * a node, so that failure is impossible rather than unlikely.
 *
 * @see docs/development/toolchain.md
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section C4
 */
import * as path from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject, formatTouched, saveTouched } from './project.mjs';

const [TYPE, POSITION] = process.argv.slice(2);
const WRITE = process.argv.includes('--write');

if (!TYPE || !POSITION) {
    console.error('usage: strip-casts-by-position.mjs <any|never> <POSITION> [--write]');
    process.exit(2);
}

/** Where a cast sits. Mirrors survey-casts.mjs so the two agree on the vocabulary. */
function position(node) {
    const parent = node.getParent();
    if (!parent) return 'ORPHAN';
    switch (parent.getKind()) {
        case SyntaxKind.CallExpression:
        case SyntaxKind.NewExpression:
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
const files = addFiles(project, ['tests/**/*.ts', 'tests/**/*.tsx']);

let removed = 0;
for (const file of files) {
    // Reverse: replacing a node invalidates positions after it.
    const casts = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .filter((c) => c.getTypeNode()?.getText() === TYPE)
        .filter((c) => position(c) === POSITION)
        .reverse();

    for (const cast of casts) {
        // Replace the whole `x as T` with just `x`. `getExpression()` is the thing
        // being cast, so a nested `x as unknown as any` collapses one layer at a
        // time rather than losing the inner cast.
        cast.replaceWithText(cast.getExpression().getText());
        removed += 1;
    }
}

console.log(`\nstrip \`as ${TYPE}\` in ${POSITION} position — ${WRITE ? 'WRITING' : 'DRY RUN'}\n`);
console.log(`  files scanned : ${files.length}`);
console.log(`  casts removed : ${removed}`);

const touched = saveTouched(project, { dryRun: !WRITE });
console.log(`  files ${WRITE ? 'written' : 'that WOULD change'}: ${touched.length}`);

if (WRITE) {
    formatTouched(touched);
    console.log('  prettier applied');
    console.log('\n  NEXT: typecheck (SAVE the output), restore what fails, then the suite.');
}
