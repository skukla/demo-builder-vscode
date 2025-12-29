/**
 * ProjectCreationHandlerRegistry - Central message dispatcher for all wizard handlers
 *
 * Maps message types to handler functions and provides centralized dispatch logic.
 */

import * as creation from './';
import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import * as authentication from '@/features/authentication';
import * as components from '@/features/components/handlers/componentHandlers';

// Import all handler modules
import * as eds from '@/features/eds/handlers';
import * as lifecycle from '@/features/lifecycle/handlers';
import * as mesh from '@/features/mesh/handlers';
import * as prerequisites from '@/features/prerequisites/handlers';

/**
 * ProjectCreationHandlerRegistry class
 *
 * Provides centralized registration and dispatching of message handlers
 * for the project creation wizard.
 */
export class ProjectCreationHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all message handlers
     */
    protected registerHandlers(): void {
        // Lifecycle handlers
        this.handlers.set('ready', lifecycle.handleReady as MessageHandler);
        this.handlers.set('cancel', lifecycle.handleCancel as MessageHandler);
        this.handlers.set('openProject', lifecycle.handleOpenProject as MessageHandler);
        this.handlers.set('browseFiles', lifecycle.handleBrowseFiles as MessageHandler);
        this.handlers.set('log', lifecycle.handleLog as MessageHandler);
        this.handlers.set('cancel-project-creation', lifecycle.handleCancelProjectCreation as MessageHandler);
        this.handlers.set('cancel-mesh-creation', lifecycle.handleCancelMeshCreation as MessageHandler);
        this.handlers.set('cancel-auth-polling', lifecycle.handleCancelAuthPolling as MessageHandler);
        this.handlers.set('open-adobe-console', lifecycle.handleOpenAdobeConsole as MessageHandler);
        this.handlers.set('show-logs', lifecycle.handleShowLogs as MessageHandler);
        this.handlers.set('openExternal', lifecycle.handleOpenExternal as MessageHandler);

        // Prerequisite handlers
        this.handlers.set('check-prerequisites', prerequisites.handleCheckPrerequisites as MessageHandler);
        this.handlers.set('continue-prerequisites', prerequisites.handleContinuePrerequisites as MessageHandler);
        this.handlers.set('install-prerequisite', prerequisites.handleInstallPrerequisite as MessageHandler);

        // Component handlers
        this.handlers.set('update-component-selection', components.handleUpdateComponentSelection as MessageHandler);
        this.handlers.set('update-components-data', components.handleUpdateComponentsData as MessageHandler);
        this.handlers.set('loadComponents', components.handleLoadComponents as MessageHandler);
        this.handlers.set('get-components-data', components.handleGetComponentsData as MessageHandler);
        this.handlers.set('checkCompatibility', components.handleCheckCompatibility as MessageHandler);
        this.handlers.set('loadDependencies', components.handleLoadDependencies as MessageHandler);
        this.handlers.set('loadPreset', components.handleLoadPreset as MessageHandler);
        this.handlers.set('validateSelection', components.handleValidateSelection as MessageHandler);

        // Authentication handlers
        this.handlers.set('check-auth', authentication.handleCheckAuth as MessageHandler);
        this.handlers.set('authenticate', authentication.handleAuthenticate as MessageHandler);

        // Project handlers
        this.handlers.set('ensure-org-selected', authentication.handleEnsureOrgSelected as MessageHandler);
        this.handlers.set('get-projects', authentication.handleGetProjects as MessageHandler);
        this.handlers.set('select-project', authentication.handleSelectProject as MessageHandler);
        this.handlers.set('check-project-apis', authentication.handleCheckProjectApis as MessageHandler);

        // Workspace handlers
        this.handlers.set('get-workspaces', authentication.handleGetWorkspaces as MessageHandler);
        this.handlers.set('select-workspace', authentication.handleSelectWorkspace as MessageHandler);

        // Mesh handlers
        this.handlers.set('check-api-mesh', mesh.handleCheckApiMesh as MessageHandler);
        this.handlers.set('create-api-mesh', mesh.handleCreateApiMesh as MessageHandler);
        this.handlers.set('delete-api-mesh', mesh.handleDeleteApiMesh as MessageHandler);

        // EDS handlers - GitHub
        this.handlers.set('check-github-auth', eds.handleCheckGitHubAuth as MessageHandler);
        this.handlers.set('github-oauth', eds.handleGitHubOAuth as MessageHandler);
        this.handlers.set('github-change-account', eds.handleGitHubChangeAccount as MessageHandler);
        this.handlers.set('get-github-repos', eds.handleGetGitHubRepos as MessageHandler);
        this.handlers.set('verify-github-repo', eds.handleVerifyGitHubRepo as MessageHandler);

        // EDS handlers - DA.live
        this.handlers.set('check-dalive-auth', eds.handleCheckDaLiveAuth as MessageHandler);
        this.handlers.set('open-dalive-login', eds.handleOpenDaLiveLogin as MessageHandler);
        this.handlers.set('store-dalive-token', eds.handleStoreDaLiveToken as MessageHandler);
        this.handlers.set('store-dalive-token-with-org', eds.handleStoreDaLiveTokenWithOrg as MessageHandler);
        this.handlers.set('clear-dalive-auth', eds.handleClearDaLiveAuth as MessageHandler);
        this.handlers.set('get-dalive-sites', eds.handleGetDaLiveSites as MessageHandler);
        this.handlers.set('verify-dalive-org', eds.handleVerifyDaLiveOrg as MessageHandler);

        // EDS handlers - ACCS
        this.handlers.set('validate-accs-credentials', eds.handleValidateAccsCredentials as MessageHandler);

        // Project creation handlers
        this.handlers.set('validate', creation.handleValidate as MessageHandler);
        this.handlers.set('create-project', creation.handleCreateProject as MessageHandler);
    }

    /**
     * Check if a message type requires progress callback
     *
     * Some handlers (like create-api-mesh) need a progress callback to send
     * incremental updates to the UI during long-running operations.
     *
     * @param messageType - Message type to check
     * @returns True if handler needs progress callback
     */
    public needsProgressCallback(messageType: string): boolean {
        return messageType === 'create-api-mesh';
    }
}

/**
 * @deprecated Use ProjectCreationHandlerRegistry instead
 * Alias for backward compatibility during migration
 */
export { ProjectCreationHandlerRegistry as HandlerRegistry };
