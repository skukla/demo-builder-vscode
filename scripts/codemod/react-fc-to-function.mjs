#!/usr/bin/env node
/**
 * `const X: React.FC<Props> = (…) => …`  ->  `function X(…: Props) { … }`
 *
 *   node scripts/codemod/react-fc-to-function.mjs            # dry run
 *   node scripts/codemod/react-fc-to-function.mjs --write
 *
 * WHY. The repo declares components two ways — 98 files as plain functions, 31 as
 * `React.FC` — and two ways of doing one thing is what a convention exists to stop.
 * The plain function wins on numbers and on merit: `React.FC` used to add an
 * implicit `children` (React 18's types dropped it), it pins the return type, and it
 * gets in the way of generic components. Nothing here needs what it offers.
 *
 * WHAT IT LEAVES ALONE, deliberately:
 *   - `React.memo(...)` — that is MEMOISATION, a different decision from declaration
 *     style, and five components use it correctly.
 *   - a component whose props type is an inline literal is still converted, but the
 *     literal moves to the parameter, where it reads the same.
 *
 * The two body shapes are the whole difficulty. An arrow with a BLOCK body keeps its
 * block; an arrow with an EXPRESSION body has to gain a `return`. Getting that
 * backwards produces a component that renders nothing and still compiles, so the
 * kind is read from the AST rather than guessed from the text.
 *
 * @see docs/development/handbook.md — the convention this enforces
 */
import * as path from 'node:path';
import { SyntaxKind } from 'ts-morph';
import { addFiles, createProject, formatTouched, saveTouched } from './project.mjs';

const WRITE = process.argv.includes('--write');

const project = createProject();
const files = addFiles(project, ['src/**/*.tsx']);

let converted = 0;
const skipped = [];

for (const file of files) {
    const rel = path.relative(process.cwd(), file.getFilePath());

    // Reverse: replacing a statement invalidates positions after it.
    const statements = file.getVariableStatements().slice().reverse();

    for (const stmt of statements) {
        const decls = stmt.getDeclarations();
        if (decls.length !== 1) continue;

        const decl = decls[0];
        const typeNode = decl.getTypeNode();
        if (!typeNode) continue;

        const typeText = typeNode.getText();
        // The type argument is OPTIONAL. `const X: React.FC = () => …` takes no
        // props, and requiring `<…>` missed exactly one such component on the first
        // run — found by the ban's own control, not by the codemod.
        const m = /^React\.(?:FC|FunctionComponent)(?:<([\s\S]+)>)?$/.exec(typeText);
        if (!m) continue;
        const propsType = (m[1] ?? '').trim();

        const init = decl.getInitializer();
        if (!init || init.getKind() !== SyntaxKind.ArrowFunction) {
            skipped.push(`${rel}:${decl.getStartLineNumber()}  initializer is not an arrow`);
            continue;
        }

        const params = init.getParameters();
        if (params.length > 1) {
            skipped.push(`${rel}:${decl.getStartLineNumber()}  more than one parameter`);
            continue;
        }

        // The parameter keeps its binding pattern and gains the props type.
        const paramText =
            params.length === 0 || !propsType
                ? ''
                : `${params[0].getNameNode().getText()}: ${propsType}`;

        const body = init.getBody();
        const isBlock = body.getKind() === SyntaxKind.Block;
        const bodyText = isBlock
            ? body.getText() // already `{ … }`
            : `{\n    return ${body.getText()};\n}`;

        const isExported = stmt.isExported();
        const isDefault = stmt.hasModifier?.(SyntaxKind.DefaultKeyword) ?? false;
        if (isDefault) {
            skipped.push(`${rel}:${decl.getStartLineNumber()}  default export`);
            continue;
        }

        const name = decl.getName();
        const prefix = isExported ? 'export ' : '';

        /**
         * CARRY THE DOCBLOCK ACROSS.
         *
         * `replaceWithText` replaces the statement and its LEADING TRIVIA, so the
         * JSDoc above a component is silently dropped. The first run of this codemod
         * deleted 232 comment lines across 32 files and typechecked perfectly — the
         * compiler has nothing to say about documentation, and neither does the
         * suite. Only reading the diff caught it.
         */
        const docs = stmt.getLeadingCommentRanges().map((r) => r.getText());
        const preserved = docs.length > 0 ? `${docs.join('\n')}\n` : '';

        stmt.replaceWithText(`${preserved}${prefix}function ${name}(${paramText}) ${bodyText}`);
        converted += 1;
    }
}

console.log(`\nReact.FC -> function declaration — ${WRITE ? 'WRITING' : 'DRY RUN'}\n`);
console.log(`  files scanned : ${files.length}`);
console.log(`  converted     : ${converted}`);
console.log(`  skipped       : ${skipped.length}`);
for (const s of skipped) console.log(`      ${s}`);

const touched = saveTouched(project, { dryRun: !WRITE });
console.log(`\n  files ${WRITE ? 'written' : 'that WOULD change'}: ${touched.length}`);

if (WRITE) {
    formatTouched(touched);
    console.log('  prettier applied');
    console.log('\n  NEXT: tsc, then the react suites. A wrong body kind renders nothing.');
}
