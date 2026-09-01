#!/usr/bin/env node
/**
 * Self-test for the ts-morph harness. Exits non-zero on any failure.
 *
 * Lives as a script rather than a jest suite because the harness is ESM and jest
 * here is CommonJS — the same reason the hook rules carry `.proof.sh` files.
 * `tests/sop/codemod-harness.test.ts` runs this, so it is not a thing anyone has to
 * remember: a harness nobody tests is exactly the instrument this repo keeps
 * finding dead.
 *
 *   node scripts/codemod/selftest.mjs
 */
import { Project, SyntaxKind } from 'ts-morph';
import { NEVER_TOUCH, addFiles, createProject, saveTouched } from './project.mjs';

let failures = 0;

/** @param {string} label @param {boolean} ok @param {unknown} [detail] */
function check(label, ok, detail) {
    if (ok) {
        console.log(`  OK    ${label}`);
    } else {
        failures += 1;
        console.log(`  FAIL  ${label}`);
        if (detail !== undefined) console.log(`        got: ${JSON.stringify(detail)}`);
    }
}

/** The same cast three ways: as code, inside a string, inside a comment. */
const MIXED = [
    "const s = 'foo(a, b as never)';",
    '// handler(payload as any);',
    'declare function handler(x: unknown): void;',
    'declare const payload: { a: number };',
    'handler(payload as any);',
    'const t = payload as never;',
    'export { s, t };',
].join('\n');

function fixture() {
    const project = new Project({ useInMemoryFileSystem: true });
    return project.createSourceFile('probe.ts', MIXED);
}

console.log('ts-morph harness self-test\n');

// --- 1. a cast in a string or a comment is not a node, so it cannot be edited ---
{
    const file = fixture();
    const types = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .map((c) => c.getTypeNode()?.getText())
        .sort();
    check('finds exactly the two REAL casts', JSON.stringify(types) === '["any","never"]', types);
    check('the string survives untouched', file.getFullText().includes("'foo(a, b as never)'"));
    check('the comment survives untouched', file.getFullText().includes('// handler(payload as any);'));
}

// --- 2. argument position is a FACT, not a regex guess ---
{
    const file = fixture();
    const positions = file.getDescendantsOfKind(SyntaxKind.AsExpression).map((c) => ({
        type: c.getTypeNode()?.getText(),
        isArgument: c.getParent()?.getKind() === SyntaxKind.CallExpression,
    }));
    check(
        'knows which cast is an argument',
        JSON.stringify(positions) ===
            '[{"type":"any","isArgument":true},{"type":"never","isArgument":false}]',
        positions
    );
}

// --- 3. removal is surgical ---
{
    const file = fixture();
    const arg = file
        .getDescendantsOfKind(SyntaxKind.AsExpression)
        .find((c) => c.getParent()?.getKind() === SyntaxKind.CallExpression);
    arg.replaceWithText(arg.getExpression().getText());
    const out = file.getFullText();
    check('the cast is gone, the expression stays', out.includes('handler(payload);'));
    check('the OTHER cast is untouched', out.includes('const t = payload as never;'));
    check('the string is still untouched', out.includes("'foo(a, b as never)'"));
    check('the comment is still untouched', out.includes('// handler(payload as any);'));
}

// --- 4. the guards refuse ---
{
    check(
        'NEVER_TOUCH covers the builders and the enforcers',
        NEVER_TOUCH.includes('tests/helpers/') && NEVER_TOUCH.includes('tests/sop/'),
        NEVER_TOUCH
    );
    let threw = false;
    try {
        addFiles(createProject(), ['tests/helpers/loggerFake.ts']);
    } catch (e) {
        threw = /refusing to load protected files/.test(String(e));
    }
    check('addFiles REFUSES a protected path', threw);

    let badMode = false;
    try {
        createProject({ mode: 'nonsense' });
    } catch {
        badMode = true;
    }
    check('createProject rejects an unknown mode', badMode);
}

// --- 5. writing has to be asked for ---
{
    const project = new Project({ useInMemoryFileSystem: true });
    project.createSourceFile('probe.ts', MIXED);
    const dry = saveTouched(project);
    check('saveTouched defaults to a dry run and reports a list', Array.isArray(dry));
}

// --- 6. NEGATIVE CONTROL: the checks above can actually fail ---
check('CONTROL: a deliberately false assertion is reported', false === true);
const expectedFailures = 1;

console.log(
    `\n${failures} failure(s); ${expectedFailures} expected from the negative control`
);
process.exit(failures === expectedFailures ? 0 : 1);
