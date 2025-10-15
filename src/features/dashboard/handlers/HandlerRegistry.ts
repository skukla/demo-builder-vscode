/**
 * Dashboard HandlerRegistry
 *
 * Central message dispatcher for dashboard message handlers.
 * Maps message types to handler functions for the Project Dashboard.
 */

import { MessageHandler } from '@/types/handlers';
import * as handlers from './dashboardHandlers';

/**
 * Dashboard HandlerRegistry class
 *
 * Provides centralized registration and dispatching of dashboard message handlers.
 */
export class DashboardHandlerRegistry {
    private handlers: Map<string, MessageHandler>;

    constructor() {
        this.handlers = new Map();
        this.registerHandlers();
    }

    /**
     * Register all dashboard message handlers
     */
    private registerHandlers(): void {
        // Initialization handlers
        this.handlers.set('ready', handlers.handleReady);
        this.handlers.set('requestStatus', handlers.handleRequestStatus);

        // Authentication handlers
        this.handlers.set('re-authenticate', handlers.handleReAuthenticate);

        // Demo lifecycle handlers
        this.handlers.set('startDemo', handlers.handleStartDemo);
        this.handlers.set('stopDemo', handlers.handleStopDemo);

        // Navigation handlers
        this.handlers.set('openBrowser', handlers.handleOpenBrowser);
        this.handlers.set('viewLogs', handlers.handleViewLogs);
        this.handlers.set('configure', handlers.handleConfigure);
        this.handlers.set('openDevConsole', handlers.handleOpenDevConsole);

        // Mesh handlers
        this.handlers.set('deployMesh', handlers.handleDeployMesh);

        // Project management handlers
        this.handlers.set('deleteProject', handlers.handleDeleteProject);
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
        context: any,
        messageType: string,
        payload?: unknown,
    ): Promise<unknown> {
        const handler = this.handlers.get(messageType);
        if (!handler) {
            return { success: false, handlerNotFound: true };
        }

        try {
            return await handler(context, payload);
        } catch (error) {
            context.logger.error(`[DashboardHandlerRegistry] Handler '${messageType}' failed:`, error as Error);
            throw error;
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
}
