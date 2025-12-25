/**
 * Lifecycle HandlerRegistry
 *
 * Central message dispatcher for lifecycle message handlers.
 * Maps message types to handler functions for wizard lifecycle operations.
 */

import { MessageHandler } from '@/commands/handlers/HandlerContext';
import { BaseHandlerRegistry } from '@/core/base';
import {
    handleReady,
    handleCancel,
    handleCancelProjectCreation,
    handleCancelMeshCreation,
    handleCancelAuthPolling,
    handleOpenProject,
    handleBrowseFiles,
    handleLog,
    handleOpenAdobeConsole,
    handleShowLogs,
    handleOpenExternal,
} from './lifecycleHandlers';

/**
 * LifecycleHandlerRegistry class
 *
 * Provides centralized registration and dispatching of lifecycle message handlers.
 */
export class LifecycleHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all lifecycle message handlers
     */
    protected registerHandlers(): void {
        // Core lifecycle handlers
        this.handlers.set('ready', handleReady as MessageHandler);
        this.handlers.set('cancel', handleCancel as MessageHandler);

        // Cancellation handlers
        this.handlers.set('cancel-project-creation', handleCancelProjectCreation as MessageHandler);
        this.handlers.set('cancel-mesh-creation', handleCancelMeshCreation as MessageHandler);
        this.handlers.set('cancel-auth-polling', handleCancelAuthPolling as MessageHandler);

        // Project actions
        this.handlers.set('openProject', handleOpenProject as MessageHandler);
        this.handlers.set('browseFiles', handleBrowseFiles as MessageHandler);

        // Utilities
        this.handlers.set('log', handleLog as MessageHandler);
        this.handlers.set('open-adobe-console', handleOpenAdobeConsole as MessageHandler);
        this.handlers.set('show-logs', handleShowLogs as MessageHandler);
        this.handlers.set('openExternal', handleOpenExternal as MessageHandler);
    }
}
