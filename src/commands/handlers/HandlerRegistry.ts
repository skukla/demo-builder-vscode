/**
 * HandlerRegistry - Central message dispatcher for all wizard handlers
 *
 * Maps message types to handler functions and provides centralized dispatch logic.
 */

import * as authentication from '@/features/authentication';
import * as components from './componentHandlers';
import { HandlerContext, MessageHandler } from './HandlerContext';

// Import all handler modules
import * as lifecycle from '@/features/lifecycle/handlers';
import * as mesh from '@/features/mesh/handlers';
import * as prerequisites from '@/features/prerequisites/handlers';
import * as creation from '@/features/project-creation/handlers';
import * as projects from './projectHandlers';
import * as workspaces from './workspaceHandlers';

/**
 * HandlerRegistry class
 *
 * Provides centralized registration and dispatching of message handlers.
 */
export class HandlerRegistry {
    private handlers: Map<string, MessageHandler>;

    constructor() {
        this.handlers = new Map();
        this.registerHandlers();
    }

    /**
     * Register all message handlers
     */
    private registerHandlers(): void {
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
        this.handlers.set('ensure-org-selected', projects.handleEnsureOrgSelected as MessageHandler);
        this.handlers.set('get-projects', projects.handleGetProjects as MessageHandler);
        this.handlers.set('select-project', projects.handleSelectProject as MessageHandler);
        this.handlers.set('check-project-apis', projects.handleCheckProjectApis as MessageHandler);

        // Workspace handlers
        this.handlers.set('get-workspaces', workspaces.handleGetWorkspaces as MessageHandler);
        this.handlers.set('select-workspace', workspaces.handleSelectWorkspace as MessageHandler);

        // Mesh handlers
        this.handlers.set('check-api-mesh', mesh.handleCheckApiMesh as MessageHandler);
        this.handlers.set('create-api-mesh', mesh.handleCreateApiMesh as MessageHandler);
        this.handlers.set('delete-api-mesh', mesh.handleDeleteApiMesh as MessageHandler);

        // Project creation handlers
        this.handlers.set('validate', creation.handleValidate as MessageHandler);
        this.handlers.set('create-project', creation.handleCreateProject as MessageHandler);
    }

    /**
     * Handle a message by dispatching to the appropriate handler
     *
     * @param context - Handler context with all dependencies
     * @param messageType - Type of message to handle
     * @param payload - Message payload
     * @returns Handler result
     */
    public async handle(
        context: HandlerContext,
        messageType: string,
        payload?: unknown,
    ): Promise<unknown> {
        const handler = this.handlers.get(messageType);
        if (!handler) {
            // Handler not found - this will be handled by fallback in main class
            return { success: false, handlerNotFound: true };
        }

        try {
            return await handler(context, payload);
        } catch (error) {
            context.logger.error(`[HandlerRegistry] Handler '${messageType}' failed:`, error as Error);
            throw error; // Re-throw to let caller handle
        }
    }

    /**
     * Check if a handler is registered for a message type
     *
     * @param messageType - Message type to check
     * @returns True if handler is registered
     */
    public hasHandler(messageType: string): boolean {
        return this.handlers.has(messageType);
    }

    /**
     * Get list of all registered message types
     *
     * @returns Array of registered message types
     */
    public getRegisteredTypes(): string[] {
        return Array.from(this.handlers.keys());
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
