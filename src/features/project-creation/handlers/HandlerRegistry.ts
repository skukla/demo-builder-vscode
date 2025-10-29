/**
 * HandlerRegistry - Central message dispatcher for all wizard handlers
 *
 * Maps message types to handler functions and provides centralized dispatch logic.
 */

import { BaseHandlerRegistry } from '@/core/base';
import * as authentication from '@/features/authentication';
import * as components from '@/features/components/handlers/componentHandlers';
import { HandlerContext, MessageHandler } from './HandlerContext';

// Import all handler modules
import * as lifecycle from '@/features/lifecycle/handlers';
import * as mesh from '@/features/mesh/handlers';
import * as prerequisites from '@/features/prerequisites/handlers';
import * as creation from './';

/**
 * HandlerRegistry class
 *
 * Provides centralized registration and dispatching of message handlers.
 */
export class HandlerRegistry extends BaseHandlerRegistry {
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
