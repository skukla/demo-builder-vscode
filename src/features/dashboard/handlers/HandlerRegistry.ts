/**
 * Dashboard HandlerRegistry
 *
 * Central message dispatcher for dashboard message handlers.
 * Maps message types to handler functions for the Project Dashboard.
 */

import * as handlers from './dashboardHandlers';
import { BaseHandlerRegistry } from '@/core/base';

/**
 * Dashboard HandlerRegistry class
 *
 * Provides centralized registration and dispatching of dashboard message handlers.
 */
export class DashboardHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all dashboard message handlers
     */
    protected registerHandlers(): void {
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
}
