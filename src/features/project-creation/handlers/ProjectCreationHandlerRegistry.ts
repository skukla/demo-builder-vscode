/**
 * Project Creation Handlers - Composite handler map for wizard
 *
 * Maps message types to handler functions from multiple features.
 * Used by createProject command for message dispatch.
 */

// Direct module imports (NOT the './' barrel): the barrel re-exports this registry
// first, so a barrel-first load would evaluate this map before the barrel's own
// re-exports exist — capturing `undefined`.
import { addIntegrationFlowHandlers } from './addIntegrationFlowHandlers';
// Direct module imports, NOT the './' barrel: index.ts re-exports THIS
// registry, so importing the barrel here was a genuine runtime cycle
// (registry -> index -> registry) that worked on evaluation-order luck.
import { checkGitHubApp } from './checkGitHubAppHandler';
import { handleCreateProject } from './createHandler';
import { handleValidate } from './validateHandler';
import * as lifecycle from './wizardLifecycleHandlers';
import { handleReDetectContext } from '@/features/authentication/handlers/organizationHandlers';
import { handleCheckProjectApis, handleEnsureOrgSelected } from '@/features/authentication/handlers/projectHandlers';
import * as components from '@/features/components/handlers/componentHandlers';
import { dataInstallerHandlers } from '@/features/data-installer/handlers/dataInstallerHandlers';
import { handleOpenDataInstallerSettings } from '@/features/data-installer/handlers/settingsHandlers';
import { handleCheckRepoReadiness } from '@/features/eds/handlers/checkRepoReadinessHandler';
import { handleCheckCredentialService } from '@/features/eds/handlers/credentialServiceHandler';
import { handleCheckDaLiveAuth, handleClearDaLiveAuth, handleOpenDaLiveLogin, handleStoreDaLiveTokenWithOrg } from '@/features/eds/handlers/daLive/edsDaLiveHandlers';
import { handleCheckGitHubAuth, handleCreateGitHubRepo, handleGetGitHubRepos, handleGitHubChangeAccount, handleGitHubOAuth } from '@/features/eds/handlers/edsGitHubHandlers';
import { handleDiscoverStoreStructure } from '@/features/eds/handlers/edsHandlers';
import { handleCancelStorefrontSetup, handleStartStorefrontSetup } from '@/features/eds/handlers/storefrontSetup/storefrontSetupHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { handleCheckPrerequisites } from '@/features/prerequisites/handlers/checkHandler';
import { handleContinuePrerequisites } from '@/features/prerequisites/handlers/continueHandler';
import { handleInstallPrerequisite } from '@/features/prerequisites/handlers/installHandler';
import { defineHandlers } from '@/types/handlers';

/**
 * Composite handler map for project creation wizard
 *
 * Combines handlers from multiple features into a single map.
 * Use with dispatchHandler() from @/core/handlers for message dispatch.
 */
export const projectCreationHandlers = defineHandlers({
    // The Add Integration flow's own host contract (auth + destination + console
    // APIs + org recovery). Spread rather than re-listed so the wizard cannot drift
    // from the flow it hosts — see `addIntegrationFlowHandlers`. Entries below may
    // still override a key where the wizard genuinely needs a different handler.
    ...addIntegrationFlowHandlers,

    // Lifecycle handlers
    ready: lifecycle.handleReady,
    cancel: lifecycle.handleCancel,
    openProject: lifecycle.handleOpenProject,
    log: lifecycle.handleLog,
    'cancel-project-creation': lifecycle.handleCancelProjectCreation,
    openExternal: lifecycle.handleOpenExternal,

    // Prerequisite handlers
    'check-prerequisites': handleCheckPrerequisites,
    'continue-prerequisites': handleContinuePrerequisites,
    'install-prerequisite': handleInstallPrerequisite,

    // Component handlers
    'update-component-selection': components.handleUpdateComponentSelection,
    'update-components-data': components.handleUpdateComponentsData,
    loadComponents: components.handleLoadComponents,
    'get-components-data': components.handleGetComponentsData,
    checkCompatibility: components.handleCheckCompatibility,
    loadDependencies: components.handleLoadDependencies,
    loadPreset: components.handleLoadPreset,
    validateSelection: components.handleValidateSelection,

    // Re-detect Adobe context after an external auth/org change
    're-detect-context': handleReDetectContext,

    // Project handlers
    'ensure-org-selected': handleEnsureOrgSelected,
    'check-project-apis': handleCheckProjectApis,

    // Workspace handlers
    // Mesh handlers
    'check-api-mesh': meshHandlers['check-api-mesh'],
    'delete-api-mesh': meshHandlers['delete-api-mesh'],

    // Sample data — ONE read, deliberately. The Commerce area's sample-data
    // sub-step lists the packs a project can be seeded with, and this is what it
    // calls. Without it registered here the request had no handler at all, and
    // the step could render nothing but "the catalog could not be loaded".
    //
    // The Data Installer panel registers the union of the read and write maps.
    // This is not that panel: datapack WRITES stay out, or project creation could
    // start an import, a reset or an export. Pinned both ways in
    // sampleDataHandlerReach.test.ts.
    'find-datapacks': dataInstallerHandlers['find-datapacks'],

    // The sub-step's recovery path. `apiBaseUrl` has no default, so a fresh
    // install reaches the catalog refusal before it reaches a catalog; naming the
    // setting without opening it leaves the user hunting through a settings tree.
    'open-data-installer-settings': handleOpenDataInstallerSettings,

    // EDS handlers - GitHub
    'check-github-auth': handleCheckGitHubAuth,
    'check-github-app': checkGitHubApp,
    'check-repo-readiness': handleCheckRepoReadiness,
    'create-github-repo': handleCreateGitHubRepo,
    'github-oauth': handleGitHubOAuth,
    'github-change-account': handleGitHubChangeAccount,
    'get-github-repos': handleGetGitHubRepos,
    // EDS handlers - DA.live
    'check-dalive-auth': handleCheckDaLiveAuth,
    'open-dalive-login': handleOpenDaLiveLogin,
    'store-dalive-token-with-org': handleStoreDaLiveTokenWithOrg,
    'clear-dalive-auth': handleClearDaLiveAuth,
    // EDS handlers - ACCS
    // EDS handlers - Store Discovery
    'discover-store-structure': handleDiscoverStoreStructure,
    // Whether the shared service supplies the Commerce credential, so the
    // Connection step can say the OAuth fields need no filling in. Status only —
    // the pair never crosses to the webview.
    'check-credential-service': handleCheckCredentialService,

    // EDS handlers - Storefront Setup (renamed from Preflight)
    'storefront-setup-start': handleStartStorefrontSetup,
    'storefront-setup-cancel': handleCancelStorefrontSetup,

    // Project creation handlers
    validate: handleValidate,
    'create-project': handleCreateProject,
});
