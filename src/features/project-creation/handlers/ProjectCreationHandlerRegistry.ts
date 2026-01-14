/**
 * Project Creation Handlers - Composite handler map for wizard
 *
 * Maps message types to handler functions from multiple features.
 * Used by createProject command for message dispatch.
 */

import { defineHandlers } from '@/types/handlers';

import * as creation from './';
import * as authentication from '@/features/authentication';
import * as components from '@/features/components/handlers/componentHandlers';

// Import all handler modules
import * as eds from '@/features/eds/handlers';
import * as lifecycle from '@/features/lifecycle/handlers';
import * as mesh from '@/features/mesh/handlers';
import * as prerequisites from '@/features/prerequisites/handlers';

/**
 * Composite handler map for project creation wizard
 *
 * Combines handlers from multiple features into a single map.
 * Use with dispatchHandler() from @/core/handlers for message dispatch.
 */
export const projectCreationHandlers = defineHandlers({
    // Lifecycle handlers
    'ready': lifecycle.handleReady,
    'cancel': lifecycle.handleCancel,
    'openProject': lifecycle.handleOpenProject,
    'browseFiles': lifecycle.handleBrowseFiles,
    'log': lifecycle.handleLog,
    'cancel-project-creation': lifecycle.handleCancelProjectCreation,
    'cancel-mesh-creation': lifecycle.handleCancelMeshCreation,
    'cancel-auth-polling': lifecycle.handleCancelAuthPolling,
    'open-adobe-console': lifecycle.handleOpenAdobeConsole,
    'show-logs': lifecycle.handleShowLogs,
    'openExternal': lifecycle.handleOpenExternal,

    // Prerequisite handlers
    'check-prerequisites': prerequisites.handleCheckPrerequisites,
    'continue-prerequisites': prerequisites.handleContinuePrerequisites,
    'install-prerequisite': prerequisites.handleInstallPrerequisite,

    // Component handlers
    'update-component-selection': components.handleUpdateComponentSelection,
    'update-components-data': components.handleUpdateComponentsData,
    'loadComponents': components.handleLoadComponents,
    'get-components-data': components.handleGetComponentsData,
    'checkCompatibility': components.handleCheckCompatibility,
    'loadDependencies': components.handleLoadDependencies,
    'loadPreset': components.handleLoadPreset,
    'validateSelection': components.handleValidateSelection,

    // Authentication handlers
    'check-auth': authentication.handleCheckAuth,
    'authenticate': authentication.handleAuthenticate,

    // Project handlers
    'ensure-org-selected': authentication.handleEnsureOrgSelected,
    'get-projects': authentication.handleGetProjects,
    'select-project': authentication.handleSelectProject,
    'check-project-apis': authentication.handleCheckProjectApis,

    // Workspace handlers
    'get-workspaces': authentication.handleGetWorkspaces,
    'select-workspace': authentication.handleSelectWorkspace,

    // Mesh handlers
    'check-api-mesh': mesh.handleCheckApiMesh,
    'create-api-mesh': mesh.handleCreateApiMesh,
    'delete-api-mesh': mesh.handleDeleteApiMesh,

    // EDS handlers - GitHub
    'check-github-auth': eds.handleCheckGitHubAuth,
    'check-github-app': creation.checkGitHubApp,
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

    // EDS handlers - ACCS
    'validate-accs-credentials': eds.handleValidateAccsCredentials,

    // EDS handlers - Storefront Setup (renamed from Preflight)
    'storefront-setup-start': eds.handleStartStorefrontSetup,
    'storefront-setup-cancel': eds.handleCancelStorefrontSetup,
    'storefront-setup-resume': eds.handleResumeStorefrontSetup,

    // Project creation handlers
    'validate': creation.handleValidate,
    'create-project': creation.handleCreateProject,
});
