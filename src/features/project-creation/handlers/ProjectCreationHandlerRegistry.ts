/**
 * Project Creation Handlers - Composite handler map for wizard
 *
 * Maps message types to handler functions from multiple features.
 * Used by createProject command for message dispatch.
 */

import { handleListOrgConsoleApis } from './consoleApiHandlers';
import * as creation from './';
// Direct module import (NOT the './' barrel): the barrel re-exports this
// registry first, so a barrel-first load would evaluate this map before the
// barrel's consoleApiHandlers re-export exists — capturing `undefined`.
import * as authentication from '@/features/authentication';
import * as components from '@/features/components/handlers/componentHandlers';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
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
    // Lifecycle handlers
    ready: lifecycle.handleReady,
    cancel: lifecycle.handleCancel,
    openProject: lifecycle.handleOpenProject,
    browseFiles: lifecycle.handleBrowseFiles,
    log: lifecycle.handleLog,
    'cancel-project-creation': lifecycle.handleCancelProjectCreation,
    'cancel-mesh-creation': lifecycle.handleCancelMeshCreation,
    'cancel-auth-polling': lifecycle.handleCancelAuthPolling,
    'open-adobe-console': lifecycle.handleOpenAdobeConsole,
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

    // Authentication handlers
    'check-auth': authentication.handleCheckAuth,
    authenticate: authentication.handleAuthenticate,

    // Re-detect Adobe context after an external auth/org change
    're-detect-context': authentication.handleReDetectContext,

    // Org recovery. The project/workspace pickers offer "Switch IMS Org" when the
    // project's org is unreachable with the current token — a FORCED sign-in is the
    // only way to reach another org (adobe-org-context rule 3), so both panels that
    // render those pickers must answer it.
    switchOrg: dashboardHandlers.switchOrg,

    // Project handlers
    'ensure-org-selected': authentication.handleEnsureOrgSelected,
    'get-projects': authentication.handleGetProjects,
    'select-project': authentication.handleSelectProject,
    'check-project-apis': authentication.handleCheckProjectApis,
    'create-adobe-project': authentication.handleCreateAdobeProject,
    'delete-adobe-project': authentication.handleDeleteAdobeProject,

    // Workspace handlers
    'get-workspaces': authentication.handleGetWorkspaces,
    'select-workspace': authentication.handleSelectWorkspace,
    'create-workspace-credential': authentication.handleCreateWorkspaceCredential,
    'create-adobe-workspace': authentication.handleCreateAdobeWorkspace,

    // Mesh handlers
    'check-api-mesh': meshHandlers['check-api-mesh'],
    'create-api-mesh': meshHandlers['create-api-mesh'],
    'delete-api-mesh': meshHandlers['delete-api-mesh'],
    'ensure-mesh-api-subscribed': meshHandlers['ensure-mesh-api-subscribed'],

    // EDS handlers - GitHub
    'check-github-auth': eds.handleCheckGitHubAuth,
    'check-github-app': creation.checkGitHubApp,
    'check-repo-readiness': eds.handleCheckRepoReadiness,
    'create-github-repo': eds.handleCreateGitHubRepo,
    'github-oauth': eds.handleGitHubOAuth,
    'github-change-account': eds.handleGitHubChangeAccount,
    'get-github-repos': eds.handleGetGitHubRepos,
    'verify-github-repo': eds.handleVerifyGitHubRepo,

    // EDS handlers - DA.live
    'check-dalive-auth': eds.handleCheckDaLiveAuth,
    'open-dalive-login': eds.handleOpenDaLiveLogin,
    'store-dalive-token': eds.handleStoreDaLiveToken,
    'store-dalive-token-with-org': eds.handleStoreDaLiveTokenWithOrg,
    'clear-dalive-auth': eds.handleClearDaLiveAuth,
    'get-dalive-sites': eds.handleGetDaLiveSites,
    'verify-dalive-org': eds.handleVerifyDaLiveOrg,
    'list-dalive-orgs': eds.handleListDaLiveOrgs,

    // EDS handlers - ACCS
    'validate-accs-credentials': eds.handleValidateAccsCredentials,

    // EDS handlers - Store Discovery
    'discover-store-structure': eds.handleDiscoverStoreStructure,

    // EDS handlers - Storefront Setup (renamed from Preflight)
    'storefront-setup-start': eds.handleStartStorefrontSetup,
    'storefront-setup-cancel': eds.handleCancelStorefrontSetup,
    'storefront-setup-resume': eds.handleResumeStorefrontSetup,

    // Project creation handlers
    validate: creation.handleValidate,
    'create-project': creation.handleCreateProject,

    // Console API handlers (org entitlements for the Add Integration modal)
    'list-org-console-apis': handleListOrgConsoleApis,
});
