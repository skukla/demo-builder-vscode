/**
 * Projects List Feature Handler Map
 *
 * Maps message types to handler functions for projects list operations.
 * Replaces ProjectsListHandlerRegistry class with simple object literal.
 *
 * Part of Step 3: Handler Registry Simplification
 */

import { defineHandlers } from '@/types/handlers';
import {
    handleGetProjects,
    handleSelectProject,
    handleCreateProject,
    handleImportFromFile,
    handleCopyFromExisting,
    handleExportProject,
    handleDeleteProject,
    handleStartDemo,
    handleStopDemo,
    handleOpenBrowser,
    handleOpenLiveSite,
    handleOpenDaLive,
    handleResetEds,
    handleEditProject,
    handleRenameProject,
    handleOpenDocs,
    handleOpenHelp,
    handleOpenSettings,
    handleSetViewModeOverride,
} from './dashboardHandlers';

/**
 * Projects list feature handler map
 * Maps message types to handler functions for the Projects List view
 *
 * Replaces ProjectsListHandlerRegistry class with simple object literal.
 */
export const projectsListHandlers = defineHandlers({
    // Project loading handlers
    'getProjects': handleGetProjects,

    // Project selection handler
    'selectProject': handleSelectProject,

    // Project creation handler
    'createProject': handleCreateProject,

    // Settings import/export/copy handlers
    'importFromFile': handleImportFromFile,
    'copyFromExisting': handleCopyFromExisting,
    'exportProject': handleExportProject,

    // Project deletion handler
    'deleteProject': handleDeleteProject,

    // Demo control handlers
    'startDemo': handleStartDemo,
    'stopDemo': handleStopDemo,
    'openBrowser': handleOpenBrowser,
    'openLiveSite': handleOpenLiveSite,
    'openDaLive': handleOpenDaLive,

    // EDS action handler
    'resetEds': handleResetEds,

    // Project edit handler
    'editProject': handleEditProject,

    // Project rename handler
    'renameProject': handleRenameProject,

    // Utility handlers (docs, help, settings)
    'openDocs': handleOpenDocs,
    'openHelp': handleOpenHelp,
    'openSettings': handleOpenSettings,

    // View mode override (session persistence)
    'setViewModeOverride': handleSetViewModeOverride,
});
