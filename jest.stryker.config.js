/**
 * Jest config for the MUTATION-TESTING PILOT only. Not used by `gate` or CI.
 *
 * WHY THIS EXISTS. Stryker's dry run executes the test suite once before any
 * mutant, then re-runs the related tests once PER MUTANT. Pointed at the repo's
 * real `jest.config.js` it therefore ran all 1198 suites in a bare node child
 * process — where an unhandled promise rejection is FATAL (node >= 15), not a
 * warning. One leaked rejection anywhere in the suite kills the run and reports
 * "Something went wrong in the initial test run", which names neither the test
 * nor the reason.
 *
 * That is not a Stryker problem to work around; it is the wrong scope. The pilot
 * measures four modules, so it should run four modules' tests. Scoping here makes
 * the run fast AND makes any crash attributable to the files under test.
 *
 * Keep `testMatch` in step with `mutate` in `stryker.config.json` — one entry per
 * mutated module. `tests/sop/tooling-registry.test.ts` does not police this pair;
 * if you add a fifth module, add its suite here by hand.
 *
 * The one real bug this already found is worth keeping in mind when adding files:
 * `componentUpdater-core.test.ts` awaited one promise while a second, already
 * rejected, sat unhandled. Jest tolerated it for as long as the test existed.
 */
const base = require('./jest.config.js');

const node = base.projects.find((p) => p.displayName === 'node');

module.exports = {
    ...node,
    displayName: 'stryker-pilot',
    rootDir: __dirname,
    testMatch: [
        '**/tests/features/project-creation/services/sanitization.test.ts',
        '**/tests/features/authentication/services/projectOwnership.test.ts',
        '**/tests/features/mesh/services/meshStatusResolver.test.ts',
        '**/tests/features/updates/services/envMerge.test.ts',
    ],
};
