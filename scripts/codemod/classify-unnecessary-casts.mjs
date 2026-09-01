#!/usr/bin/env node
/**
 * Split the "unnecessary type assertion" findings into the ones that are SAFE to
 * remove and the ones whose removal is a regression.
 *
 *   node scripts/codemod/classify-unnecessary-casts.mjs <eslint-json>
 *   node scripts/codemod/classify-unnecessary-casts.mjs <eslint-json> --write
 *
 * WHY A FILTER AND NOT JUST `eslint --fix`. The rule is right that the assertion
 * does not change the type — but when the expression is already `any`, the
 * assertion is the ONLY type information in the expression, and deleting it hands
 * you back `any`. Measured on 2026-09-01:
 * `jest.requireMock('vscode') as { commands: … }` is flagged, and the autofix is a
 * strict downgrade. That is why the repo-wide `--fix` was never run.
 *
 * So eslint FINDS them and the type checker DECIDES. eslint has the locations;
 * ts-morph in typed mode can ask what the expression's own type actually is. Neither
 * tool does the whole job, which is the point of using both.
 *
 * SAFE     the expression already has the asserted type — pure noise
 * KEEP     the expression is `any` or `unknown` — the assertion is the type
 *
 * @see docs/development/toolchain.md
 * @see .rptc/backlog/2026-09-01-cast-and-builder-worklog.md — section A3
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject, formatTouched, saveTouched } from './project.mjs';

const REPORT = process.argv[2];
const WRITE = process.argv.includes('--write');
const RULE = '@typescript-eslint/no-unnecessary-type-assertion';

if (!REPORT) {
    console.error('usage: classify-unnecessary-casts.mjs <eslint-json> [--write]');
    process.exit(2);
}

/** file -> Set of 1-based lines eslint flagged. */
const flagged = new Map();
for (const entry of JSON.parse(fs.readFileSync(REPORT, 'utf8'))) {
    const rel = path.relative(process.cwd(), entry.filePath);
    for (const m of entry.messages) {
        if (m.ruleId !== RULE) continue;
        if (!flagged.has(rel)) flagged.set(rel, new Set());
        flagged.get(rel).add(m.line);
    }
}

const targets = [...flagged.keys()];
console.log(`\neslint flagged ${[...flagged.values()].reduce((n, s) => n + s.size, 0)} assertion(s) in ${targets.length} file(s)`);
console.log('asking the TYPE CHECKER which are safe...\n');

// `typed` mode: the checker is the whole point here.
const project = createProject({ mode: 'typed' });
addFiles(project, targets);

let safe = 0;
let keep = 0;
const keepExamples = [];

for (const rel of targets) {
    const file = project.getSourceFile(path.resolve(rel));
    if (!file) continue;
    const lines = flagged.get(rel);

    const casts = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .filter((c) => lines.has(c.getStartLineNumber()))
        .reverse();

    for (const cast of casts) {
        const expr = cast.getExpression();
        const sourceType = expr.getType().getText();

        /**
         * A call whose generic is INFERRED FROM THIS ASSERTION.
         *
         * `jest.requireMock<TModule = any>(name): TModule` takes its type parameter
         * from context, so `requireMock(x) as Shape` makes the expression's type
         * READ as `Shape` — non-any — purely because the cast is there. The checker
         * then reports the assertion as unnecessary, which is true and useless:
         * remove it and TModule collapses to its `any` default.
         *
         * The any-check below cannot see this, because the source type is only
         * non-any BECAUSE of the thing being tested. And tsc cannot catch the
         * fallout either — `any` is assignable everywhere, so the removal
         * typechecks and the suite passes while the file quietly loses its types.
         * It happened on 2026-09-01 to `stateManager.testUtils.ts`, in the very
         * filter written to prevent it.
         *
         * Named rather than general on purpose. "A call whose declared return type
         * is a type parameter with a default" is the real rule; these two are the
         * instances that exist here, and a narrow guard that is exact beats a broad
         * one that is approximately right.
         */
        const INFERS_FROM_CONTEXT = /\b(requireMock|requireActual)\s*\(/;
        if (INFERS_FROM_CONTEXT.test(expr.getText())) {
            keep += 1;
            if (keepExamples.length < 6) {
                keepExamples.push(
                    `${rel}:${cast.getStartLineNumber()}  generic inferred from the cast`
                );
            }
            continue;
        }

        const isAnyish = sourceType === 'any' || sourceType === 'unknown';
        if (isAnyish) {
            keep += 1;
            if (keepExamples.length < 6) {
                keepExamples.push(`${rel}:${cast.getStartLineNumber()}  from ${sourceType}`);
            }
            continue;
        }
        safe += 1;
        if (WRITE) cast.replaceWithText(cast.getExpression().getText());
    }
}

console.log(`  SAFE  ${safe}  the expression already has that type — pure noise`);
console.log(`  KEEP  ${keep}  asserting from any/unknown; removing would hand back \`any\``);
for (const e of keepExamples) console.log(`          ${e}`);

const touched = saveTouched(project, { dryRun: !WRITE });
console.log(`\n  files ${WRITE ? 'written' : 'that WOULD change'}: ${touched.length}`);
if (WRITE) {
    formatTouched(touched);
    console.log('  prettier applied');
    console.log('\n  NEXT: typecheck (save the output), restore what fails, then the suite.');
}
