/**
 * Jest config for the FOCUSED mutation run — one module at a time.
 *
 * The sample (`jest.pl22.config.js`) runs twelve modules' tests and takes ~16
 * minutes. That is the right cadence for a release check and the wrong one for
 * working a module: killing a survivor and re-measuring should cost minutes.
 *
 * Keep `testMatch` here in step with `mutate` in `stryker.focus.config.json` — the
 * two are hand-maintained and `tests/sop/mutation-config-pairing.test.ts` fails the
 * build when they disagree. That enforcer exists because a run where they DID
 * disagree reported 0% for seven modules and finished in 19 seconds, which reads as
 * a devastating result and was actually a run that never executed the tests.
 *
 * MOVING TO THE NEXT MODULE means editing both files together.
 */
const base = require('./jest.config.js');

const node = base.projects.find((p) => p.displayName === 'node');

module.exports = {
    ...node,
    displayName: 'stryker-focus',
    // LISTED, not globbed: `mutation-config-pairing` verifies each named path
    // exists, and a glob is not a path it can check.
    testMatch: [
        '**/tests/features/prerequisites/handlers/installHandler-adobeCliProgress.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-byId.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-errorHandling.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-happyPath.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-plugins.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler.test.ts',
    ],
};
