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
import * as creation from './';
import * as authentication from '@/features/authentication';
import * as components from '@/features/components/handlers/componentHandlers';
import { dataInstallerHandlers } from '@/features/data-installer/handlers';
import * as eds from '@/features/eds/handlers';
import * as lifecycle from '@/features/lifecycle/handlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import * as prerequisites from '@/features/prerequisites/handlers';
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
    'check-prerequisites': prerequisites.handleCheckPrerequisites,
    'continue-prerequisites': prerequisites.handleContinuePrerequisites,
    'install-prerequisite': prerequisites.handleInstallPrerequisite,

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
    're-detect-context': authentication.handleReDetectContext,

    // Project handlers
    'ensure-org-selected': authentication.handleEnsureOrgSelected,
    'check-project-apis': authentication.handleCheckProjectApis,

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

    // EDS handlers - GitHub
    'check-github-auth': eds.handleCheckGitHubAuth,
    'check-github-app': creation.checkGitHubApp,
    'check-repo-readiness': eds.handleCheckRepoReadiness,
    'create-github-repo': eds.handleCreateGitHubRepo,
    'github-oauth': eds.handleGitHubOAuth,
    'github-change-account': eds.handleGitHubChangeAccount,
    'get-github-repos': eds.handleGetGitHubRepos,
    // EDS handlers - DA.live
    'check-dalive-auth': eds.handleCheckDaLiveAuth,
    'open-dalive-login': eds.handleOpenDaLiveLogin,
    'store-dalive-token': eds.handleStoreDaLiveToken,
    'store-dalive-token-with-org': eds.handleStoreDaLiveTokenWithOrg,
    'clear-dalive-auth': eds.handleClearDaLiveAuth,
    // EDS handlers - ACCS
    // EDS handlers - Store Discovery
    'discover-store-structure': eds.handleDiscoverStoreStructure,
    // Whether the shared service supplies the Commerce credential, so the
    // Connection step can say the OAuth fields need no filling in. Status only —
    // the pair never crosses to the webview.
    'check-credential-service': eds.handleCheckCredentialService,

    // EDS handlers - Storefront Setup (renamed from Preflight)
    'storefront-setup-start': eds.handleStartStorefrontSetup,
    'storefront-setup-cancel': eds.handleCancelStorefrontSetup,

    // Project creation handlers
    validate: creation.handleValidate,
    'create-project': creation.handleCreateProject,
});
