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

/**
 * Members whose type has a canonical fake, and the builder that makes one.
 *
 * WHY THIS EXISTS. The first run converted the OUTER literal only and 51 files then
 * failed the typecheck — because `createMockHandlerContext`'s overrides are TYPED,
 * so a member holding a partial fake is rejected where `as unknown as HandlerContext`
 * had erased it. The compiler ranked the blockers, and this is the answer to the ones
 * that need no new fake.
 *
 * `context` is the highest-value row and not obviously so: `createMockExtensionContext`
 * already supplies a full `secrets`, so converting this ONE member should clear both
 * the ExtensionContext failures (9) and the SecretStorage ones (21).
 *
 * `debugLogger` is deliberately absent — it is a different interface from `Logger`,
 * and handing it the logger builder would be the wrong fake, which is exactly the
 * mistake these builders exist to stop.
 */
const MEMBER_BUILDERS = {
    logger: { fn: 'createMockLogger', from: 'tests/helpers/loggerFake', passLiteral: false },
    stateManager: {
        fn: 'createMockStateManager',
        from: 'tests/helpers/stateManagerFake',
        passLiteral: true,
    },
    context: {
        fn: 'createMockExtensionContext',
        from: 'tests/helpers/extensionContextFake',
        passLiteral: true,
    },
    authManager: {
        fn: 'createMockAuthenticationService',
        from: 'tests/helpers/authenticationServiceFake',
        passLiteral: true,
    },

    panel: {
        fn: 'createMockWebviewPanel',
        from: 'tests/helpers/webviewPanelFake',
        passLiteral: true,
    },

    // NESTED members, inside the `context` literal. Converting `context` alone was
    // NOT enough and the compiler said so: the literal handed to
    // `createMockExtensionContext` as overrides still held a partial `secrets`, and
    // `Partial<vscode.ExtensionContext>` wants a whole `SecretStorage`. SecretStorage
    // stayed at 21 failures across that change — a hypothesis measured and refuted
    // rather than assumed.
    //
    // Neither passes its literal through. Both are pure jest.fn bags in the corpus,
    // and the builders supply working, REMEMBERING versions — strictly better than
    // what is being replaced.
    secrets: {
        fn: 'createMockSecretStorage',
        from: 'tests/helpers/secretStorageFake',
        passLiteral: false,
        suffix: '().secrets',
    },
    globalState: {
        fn: 'createStatefulGlobalState',
        from: 'tests/helpers/extensionContextFake',
        passLiteral: false,
        suffix: '().globalState',
    },
};

/**
 * Members where an EMPTY literal override is worse than no override at all.
 *
 * `sharedState: {}` replaces the builder's real default — which carries
 * `isAuthenticating`, a selection and a Map — with an object that has none of them,
 * and `SharedState` requires `isAuthenticating`. Six failures came from exactly
 * that: the site was not asking for an empty shared state, it was writing the
 * shortest thing that satisfied a cast which checked nothing.
 *
 * Deliberately NOT every `{}` member. `panel: {}` may mean "a panel exists", and
 * dropping it would change what the test asserts.
 */
const DROP_IF_EMPTY = new Set(['sharedState']);

/** Swap each known member's partial literal for its builder. Returns imports needed. */
function convertMembers(objectLiteral) {
    const needed = new Set();
    // Reverse: replacing a property invalidates positions after it.
    const props = objectLiteral.getProperties().slice().reverse();
    for (const prop of props) {
        if (prop.getKind() !== SyntaxKind.PropertyAssignment) continue;
        const name = prop.getName?.();

        // Drop an empty override that only destroys a good default.
        if (DROP_IF_EMPTY.has(name)) {
            const v = prop.getInitializer();
            if (v && v.getKind() === SyntaxKind.ObjectLiteralExpression && v.getText().trim() === '{}') {
                prop.remove();
                continue;
            }
        }

        const spec = MEMBER_BUILDERS[name];
        if (!spec) continue;
        const value = prop.getInitializer();
        if (!value) continue;

        // A member can be a CONDITIONAL: `authManager: opts.none ? undefined : {...}`.
        // The literal is in a branch, so a plain kind check skips the whole member —
        // which is why AuthenticationService stayed at 4 failures after the builder
        // existed. Convert each branch that IS a literal and leave the rest alone.
        if (value.getKind() === SyntaxKind.ConditionalExpression) {
            for (const branch of [value.getWhenFalse(), value.getWhenTrue()]) {
                if (branch.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
                for (const nested of convertMembers(branch)) needed.add(nested);
                const text = branch.getText().trim();
                const a = spec.passLiteral && text !== '{}' ? text : '';
                branch.replaceWithText(spec.suffix ? `${spec.fn}${spec.suffix}` : `${spec.fn}(${a})`);
                needed.add(spec);
            }
            continue;
        }

        if (value.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
        // RECURSE FIRST. A member's own literal can hold another known member —
        // `context` holds `secrets` and `globalState` — and the outer builder's
        // overrides are typed, so the inside has to be right before the outside is
        // built. Depth-first is the only order that converges.
        for (const nested of convertMembers(value)) needed.add(nested);

        const inner = value.getText().trim();
        if (spec.suffix) {
            value.replaceWithText(`${spec.fn}${spec.suffix}`);
        } else {
            const arg = spec.passLiteral && inner !== '{}' ? inner : '';
            value.replaceWithText(`${spec.fn}(${arg})`);
        }
        needed.add(spec);
    }
    return needed;
}

/** Builder names this codemod introduces, for the shadowing check. */
const MEMBER_BUILDER_NAMES = new Set(Object.values(MEMBER_BUILDERS).map((m) => m.fn));

const project = createProject();
const files = addFiles(project, ['tests/**/*.ts', 'tests/**/*.tsx']);

let converted = 0;
const skipped = [];
const touchedFiles = new Set();

for (const file of files) {
    const rel = path.relative(process.cwd(), file.getFilePath());
    let changedHere = 0;
    const memberImports = new Set();

    // Reverse: replacing a node invalidates positions after it.
    const casts = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .filter((c) => c.getTypeNode()?.getText() === 'HandlerContext')
        .reverse();

    // A file with its OWN function of the builder's name cannot take the import —
    // `edsHelpers.test.ts` defines a local `createMockHandlerContext`, and adding the
    // import produced "Import declaration conflicts with local declaration". Leave it
    // to a person: renaming someone's local helper is not this codemod's call.
    const shadows = file
        .getFunctions()
        .some((fn) => fn.getName() === BUILDER || MEMBER_BUILDER_NAMES.has(fn.getName()));
    if (shadows) {
        skipped.push(`${rel}  defines its own builder of the same name`);
        continue;
    }

    for (const cast of casts) {
        const target = innermost(cast);
        if (target.getKind() !== SyntaxKind.ObjectLiteralExpression) {
            skipped.push(`${rel}:${cast.getStartLineNumber()}  ${target.getKindName()}`);
            continue;
        }
        // Members FIRST: the outer builder's overrides are typed, so a member
        // holding a partial fake is rejected. Converting the inside before the
        // outside is what makes the whole literal acceptable.
        for (const spec of convertMembers(target)) memberImports.add(spec);

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
        for (const m of memberImports) {
            // Check for the NAMED import, not the module. Checking the module was a
            // real bug: a file already importing `createStatefulGlobalState` from
            // `extensionContextFake` looked satisfied, so `createMockExtensionContext`
            // was never added — 11 files failed with "Cannot find name", and the
            // whole cluster read like reading work when it was one wrong predicate.
            const existing = file
                .getImportDeclarations()
                .find((d) => d.getModuleSpecifierValue().includes(path.basename(m.from)));
            if (existing) {
                const names = existing.getNamedImports().map((n) => n.getName());
                if (!names.includes(m.fn)) existing.addNamedImport(m.fn);
                continue;
            }
            let spec = path.relative(path.dirname(rel), m.from);
            if (!spec.startsWith('.')) spec = `./${spec}`;
            file.addImportDeclaration({ moduleSpecifier: spec, namedImports: [m.fn] });
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
