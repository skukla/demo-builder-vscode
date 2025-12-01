/**
 * Projects List HandlerRegistry
 *
 * Central message dispatcher for projects list message handlers.
 * Maps message types to handler functions for the Projects List view.
 */

import * as handlers from './dashboardHandlers';
import { BaseHandlerRegistry } from '@/core/base';
import type { MessageHandler } from '@/types/handlers';

/**
 * ProjectsListHandlerRegistry class
 *
 * Provides centralized registration and dispatching of projects list message handlers.
 * Uses the existing dashboardHandlers (getProjects, selectProject, createProject).
 */
export class ProjectsListHandlerRegistry extends BaseHandlerRegistry {
    /**
     * Register all projects list message handlers
     */
    protected registerHandlers(): void {
        // Project loading handlers
        this.handlers.set('getProjects', handlers.handleGetProjects);

        // Project selection handler
        // Type assertion needed because handleSelectProject has typed payload
        this.handlers.set('selectProject', handlers.handleSelectProject as MessageHandler);

        // Project creation handler
        this.handlers.set('createProject', handlers.handleCreateProject);

        // Utility handlers (docs, help, settings)
        this.handlers.set('openDocs', handlers.handleOpenDocs);
        this.handlers.set('openHelp', handlers.handleOpenHelp);
        this.handlers.set('openSettings', handlers.handleOpenSettings);
    }
}
