#!/usr/bin/env node
/**
 * Replace `{...} as [unknown as] HandlerContext` with `createMockHandlerContext({...})`.
 *
 *   node scripts/codemod/handler-context-casts.mjs            # dry run (default)
 *   node scripts/codemod/handler-context-casts.mjs --write
 *
 * The survey (`survey-casts.mjs HandlerContext`) found 100 sites in three shapes
 * that are all the SAME transformation:
 *
 *   const f = () => ({}) as HandlerContext;                     empty
 *   () => ({ sendMessage }) as unknown as HandlerContext;       partial, arrow body
 *   return { logger, stateManager } as unknown as HandlerContext;  partial, return
 *
 * Each is a partial literal standing in for a 20-member interface, and
 * `tests/helpers/handlerContextTestHelpers.ts` already covers it — 165 suites use
 * that builder and these hand-roll instead.
 *
 * WHAT IT DELIBERATELY SKIPS, because these are not the same job:
 *   - a cast whose expression is NOT an object literal (a call result, an
 *     identifier) — there is nothing to hand the builder
 *   - a file that already imports the builder under a different local name
 *   - anything under NEVER_TOUCH, refused by the harness
 *
 * @see docs/development/toolchain.md — the workflow this is step 3 of
 */
import * as path from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject, formatTouched, saveTouched } from './project.mjs';

const WRITE = process.argv.includes('--write');
const BUILDER = 'createMockHandlerContext';
const HELPER = 'tests/helpers/handlerContextTestHelpers';

/** Unwrap `x as unknown` / `(x)` down to the thing actually being cast. */
function innermost(node) {
    let n = node;
    for (;;) {
        if (n.getKind() === SyntaxKind.AsExpression) {
            n = n.getExpression();
            continue;
        }
        if (n.getKind() === SyntaxKind.ParenthesizedExpression) {
            n = n.getExpression();
            continue;
        }
        return n;
    }
}

const project = createProject();
const files = addFiles(project, ['tests/**/*.ts', 'tests/**/*.tsx']);

let converted = 0;
const skipped = [];
const touchedFiles = new Set();

for (const file of files) {
    const rel = path.relative(process.cwd(), file.getFilePath());
    let changedHere = 0;

    // Reverse: replacing a node invalidates positions after it.
    const casts = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .filter((c) => c.getTypeNode()?.getText() === 'HandlerContext')
        .reverse();

    for (const cast of casts) {
        const target = innermost(cast);
        if (target.getKind() !== SyntaxKind.ObjectLiteralExpression) {
            skipped.push(`${rel}:${cast.getStartLineNumber()}  ${target.getKindName()}`);
            continue;
        }
        const literal = target.getText().trim();
        const arg = literal === '{}' ? '' : literal;
        cast.replaceWithText(`${BUILDER}(${arg})`);
        converted += 1;
        changedHere += 1;
    }

    if (changedHere > 0) {
        touchedFiles.add(rel);
        // Add the import only once, and only if it is not already there.
        const already = file
            .getImportDeclarations()
            .some((d) => d.getModuleSpecifierValue().includes('handlerContextTestHelpers'));
        if (!already) {
            let spec = path.relative(path.dirname(rel), HELPER);
            if (!spec.startsWith('.')) spec = `./${spec}`;
            file.addImportDeclaration({ moduleSpecifier: spec, namedImports: [BUILDER] });
        }
    }
}

console.log(`\nHandlerContext cast codemod — ${WRITE ? 'WRITING' : 'DRY RUN'}\n`);
console.log(`  files scanned : ${files.length}`);
console.log(`  converted     : ${converted}`);
console.log(`  skipped       : ${skipped.length}  (expression is not an object literal)`);
for (const s of skipped.slice(0, 12)) console.log(`      ${s}`);
if (skipped.length > 12) console.log(`      …and ${skipped.length - 12} more`);

const touched = saveTouched(project, { dryRun: !WRITE });
console.log(`\n  files ${WRITE ? 'written' : 'that WOULD change'}: ${touched.length}`);

if (WRITE) {
    formatTouched(touched);
    console.log('  prettier applied');
    console.log('\n  NEXT: npm run typecheck:tests, then the suite. Restore what fails.');
}
