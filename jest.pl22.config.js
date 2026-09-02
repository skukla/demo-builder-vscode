/**
 * Jest config for the PL-22 mutation sample. Not used by `gate` or CI.
 *
 * Same reasoning as `jest.stryker.config.js` — Stryker runs the suite once per
 * mutant in a bare node process, so the scope must be the tests that actually
 * cover the mutated files, not the whole repo.
 *
 * WHY THIS FILE EXISTS RATHER THAN REUSING THE PILOT'S. The pilot config hard-codes
 * its four test paths, and its own header warns that nothing polices the pairing
 * with `mutate`. Running the PL-22 sample against it produced exactly what that
 * warning predicts: the one pilot file in the sample scored 100%, every other file
 * reported 0% with ALL 1306 mutants in the no-coverage column, and the run finished
 * in 19 seconds. The number looked like a catastrophic coverage finding and was in
 * fact a config that never ran those tests.
 *
 * The list below is DERIVED, not hand-written: every test file that references one
 * of the mutated modules. `tests/sop/mutation-config-pairing.test.ts` now checks
 * that this file and `stryker.pl22.config.json` still agree.
 */
const base = require('./jest.config.js');

const node = base.projects.find((p) => p.displayName === 'node');

module.exports = {
    ...node,
    displayName: 'stryker-pl22',
    rootDir: __dirname,
    testMatch: [
        '**/tests/core/state/stateManager-basic.test.ts',
        '**/tests/core/state/stateManager-componentVersions.test.ts',
        '**/tests/core/state/stateManager-context.test.ts',
        '**/tests/core/state/stateManager-dirtyTracking.test.ts',
        '**/tests/core/state/stateManager-errorHandling.test.ts',
        '**/tests/core/state/stateManager-getCurrentProject-diskPointer.test.ts',
        '**/tests/core/state/stateManager-getCurrentProject-reload.test.ts',
        '**/tests/core/state/stateManager-processes.test.ts',
        '**/tests/core/state/stateManager-projects.test.ts',
        '**/tests/core/state/stateManager-recentProjects.test.ts',
        '**/tests/core/state/stateManager-utilities.test.ts',
        '**/tests/core/state/stateManager.disposal.test.ts',
        '**/tests/features/eds/handlers/daLive/daLiveAuthPrompt-inputValidation.test.ts',
        '**/tests/features/eds/handlers/daLive/daLiveAuthPrompt-tokenStorage.test.ts',
        '**/tests/features/eds/handlers/daLive/daLiveAuthPrompt-tokenStrict.test.ts',
        '**/tests/commands/claudeCodeFootprint.test.ts',
        '**/tests/commands/commandManager.test.ts',
        '**/tests/core/utils/mcpSocketPath.test.ts',
        '**/tests/features/ai/server/mcpSocketDiscovery.test.ts',
        '**/tests/features/ai/server/realSdkRegistration.test.ts',
        '**/tests/features/ai/server/siteTools.test.ts',
        '**/tests/features/components/services/commerceCredentialStore.test.ts',
        '**/tests/features/components/services/commerceSecretMigration.test.ts',
        '**/tests/features/eds/handlers/daLive/daLiveAuthPrompt-guard.test.ts',
        '**/tests/features/eds/handlers/daLive/daLiveAuthPrompt-signIn.test.ts',
        '**/tests/features/eds/services/patches/codePatchPipelineHelpers.test.ts',
        '**/tests/features/eds/services/patches/codePatchRegistry.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-adobeCliProgress.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-byId.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-edgeCases.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-errorHandling.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-fnmShell.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-finalStatus.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-happyPath.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-nodeVersions.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-versionSatisfaction.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler.test.ts',
        '**/tests/features/project-creation/services/aiBundle/homeAiContextWriter.test.ts',
        '**/tests/features/project-creation/services/aiBundle/mcpConfigWriter.test.ts',
        '**/tests/features/updates/services/envMerge.test.ts',
        // added 2026-08-31 with the sample's widening — UI-LAYER LOGIC, which runs
        // under the node project. Components (.tsx) are not here: see the stryker
        // config's comment for the two tooling blockers that stop them being measured.
        '**/tests/webview-ui/shared/utils/spectrumTokens.test.ts',
        '**/tests/features/dashboard/ui/components/integrations/integrationCardModel.test.ts',
        '**/tests/features/data-installer/ui/importProgress.test.ts',
        '**/tests/features/project-creation/ui/helpers/buttonTextHelpers.test.ts',
        '**/tests/features/prerequisites/handlers/installHandler-plugins.test.ts',
        '**/tests/features/dashboard/ui/components/integrations/integrationCardModel-commerceScope.test.ts',
        '**/tests/features/dashboard/ui/components/integrations/integrationCardModel-installation.test.ts',
        '**/tests/features/dashboard/ui/components/integrations/integrationCardModel-mesh.test.ts',
        '**/tests/features/dashboard/ui/components/integrations/integrationCardModel-vocabularyContract.test.ts',
    ],
};
