#!/usr/bin/env node
/**
 * Controls for the focus tool's WIDENING rule (`focusModule.mjs --widen`).
 *
 * The rule: after a mirror-only run, a module that was left with uncovered mutants
 * also gets the suites that import it. It has to hold in both directions — it must add
 * the importers where the mirror run proved a gap, and it must add NOTHING where the
 * mirror run covered the module, because widening every module is the 24.5x sweep the
 * mirror-first order exists to avoid.
 *
 * `widenSelection` takes the import graph as a parameter, so these run in milliseconds
 * with no jest and no Stryker.
 *
 * Run directly (`node scripts/focusModule.selftest.mjs`) or via its jest wrapper,
 * `tests/scripts/focusModule.test.ts`.
 */
import { uncoveredModules, WIDEN_LIMIT, widenSelection } from './focusModule.mjs';

/** A Stryker-shaped report: module -> list of mutant statuses. */
const report = (spec) => ({
    files: Object.fromEntries(
        Object.entries(spec).map(([path, statuses]) => [
            path,
            { mutants: statuses.map((status, id) => ({ id: String(id), status })) },
        ])
    ),
});

const GRAPH = {
    'src/a/updateCore.ts': ['tests/a/updateCore.test.ts', 'tests/a/updateExecutor.test.ts', 'tests/a/updateApply.test.ts'],
    'src/a/covered.ts': ['tests/a/covered.test.ts', 'tests/a/consumer.test.ts'],
    'src/a/lonely.ts': ['tests/a/lonely.test.ts'],
};
const related = (m) => GRAPH[m] ?? [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let failed = 0;
function control(label, ok, detail) {
    if (!ok) failed += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      ${detail}`}`);
}

// A: the mirror suite left mutants uncovered and two other suites import the module.
{
    const r = report({ 'src/a/updateCore.ts': ['Killed', 'NoCoverage', 'Survived'] });
    const out = widenSelection({
        mutate: ['src/a/updateCore.ts'],
        selected: ['tests/a/updateCore.test.ts'],
        uncovered: uncoveredModules(r),
        related,
    });
    control(
        'A-uncovered-module-gets-its-importers',
        same(out.suites, ['tests/a/updateApply.test.ts', 'tests/a/updateCore.test.ts', 'tests/a/updateExecutor.test.ts']) &&
            same(out.added, { 'src/a/updateCore.ts': ['tests/a/updateExecutor.test.ts', 'tests/a/updateApply.test.ts'] }),
        JSON.stringify(out)
    );
}

// B: every mutant was reached. Importers exist and must NOT be added.
{
    const r = report({ 'src/a/covered.ts': ['Killed', 'Survived', 'Timeout'] });
    const out = widenSelection({
        mutate: ['src/a/covered.ts'],
        selected: ['tests/a/covered.test.ts'],
        uncovered: uncoveredModules(r),
        related,
    });
    control(
        'B-covered-module-is-never-widened',
        same(out.suites, ['tests/a/covered.test.ts']) && same(out.added, {}),
        JSON.stringify(out)
    );
}

// C: uncovered, but nothing beyond the selected suite imports it. Nothing to add.
{
    const r = report({ 'src/a/lonely.ts': ['NoCoverage'] });
    const out = widenSelection({
        mutate: ['src/a/lonely.ts'],
        selected: ['tests/a/lonely.test.ts'],
        uncovered: uncoveredModules(r),
        related,
    });
    control('C-no-other-importer-adds-nothing', same(out.added, {}) && out.suites.length === 1, JSON.stringify(out));
}

// D: a group. Only the uncovered member's importers arrive; the covered member's do not.
{
    const r = report({ 'src/a/updateCore.ts': ['NoCoverage'], 'src/a/covered.ts': ['Killed'] });
    const out = widenSelection({
        mutate: ['src/a/updateCore.ts', 'src/a/covered.ts'],
        selected: ['tests/a/covered.test.ts', 'tests/a/updateCore.test.ts'],
        uncovered: uncoveredModules(r),
        related,
    });
    control(
        'D-group-widens-only-the-uncovered-member',
        !out.suites.includes('tests/a/consumer.test.ts') && out.suites.includes('tests/a/updateExecutor.test.ts'),
        JSON.stringify(out)
    );
}

// E: the evidence reader itself. Survived is not uncovered; NoCoverage is.
{
    const r = report({ 'src/a/x.ts': ['Survived', 'Killed'], 'src/a/y.ts': ['Killed', 'NoCoverage'] });
    control('E-only-NoCoverage-counts-as-uncovered', same(uncoveredModules(r), ['src/a/y.ts']), JSON.stringify(uncoveredModules(r)));
}

// F: too many importers — refused, named, and the other member still widens (PL-71).
{
    const many = Array.from({ length: WIDEN_LIMIT + 1 }, (_, i) => `tests/b/importer${i}.test.ts`);
    const graph = { ...GRAPH, 'src/b/everywhere.ts': many };
    const r = report({ 'src/b/everywhere.ts': ['NoCoverage'], 'src/a/updateCore.ts': ['NoCoverage'] });
    const out = widenSelection({
        mutate: ['src/b/everywhere.ts', 'src/a/updateCore.ts'],
        selected: ['tests/a/updateCore.test.ts'],
        uncovered: uncoveredModules(r),
        related: (m) => graph[m] ?? [],
        isReact: () => false,
    });
    control(
        'F-a-module-with-too-many-importers-is-refused-and-named',
        !out.suites.includes(many[0]) &&
            /41 importing suites/.test(out.refused['src/b/everywhere.ts'] ?? '') &&
            out.suites.includes('tests/a/updateExecutor.test.ts'),
        JSON.stringify(out.refused)
    );
}

// G: an importer in the other environment would put the node suites under jsdom (PL-71).
{
    const graph = { 'src/c/util.ts': ['tests/c/util.test.ts', 'tests/c/Field.test.tsx'] };
    const r = report({ 'src/c/util.ts': ['NoCoverage'] });
    const out = widenSelection({
        mutate: ['src/c/util.ts'],
        selected: ['tests/c/util.test.ts'],
        uncovered: uncoveredModules(r),
        related: (m) => graph[m] ?? [],
        isReact: (s) => s.endsWith('.tsx'),
    });
    control(
        'G-a-widen-that-would-mix-environments-is-refused',
        same(out.suites, ['tests/c/util.test.ts']) && /Field\.test\.tsx/.test(out.refused['src/c/util.ts'] ?? ''),
        JSON.stringify(out)
    );
}

console.log(failed ? `\n${failed} CONTROL(S) BROKEN` : '\nALL CONTROLS PASSED');
process.exit(failed ? 1 : 0);
