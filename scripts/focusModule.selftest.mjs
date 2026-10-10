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
import { uncoveredModules, widenSelection } from './focusModule.mjs';

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

console.log(failed ? `\n${failed} CONTROL(S) BROKEN` : '\nALL CONTROLS PASSED');
process.exit(failed ? 1 : 0);
