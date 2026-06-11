/**
 * Projects List Feature Handler Map
 *
 * Maps message types to handler functions for projects list operations.
 * Replaces ProjectsListHandlerRegistry class with simple object literal.
 *
 * Part of Step 3: Handler Registry Simplification
 */

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
    handleResetProject,
    handleRepublishContent,
    handleEditProject,
    handleRenameProject,
    handleOpenHelp,
    handleOpenSettings,
    handleSetViewModeOverride,
    handleCopyProjectPath,
    handleOpenAiForProject,
    handleSetProjectPinned,
    handleSetAuthoringExperience,
} from './dashboardHandlers';
import { defineHandlers } from '@/types/handlers';

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

    // Project reset handler
    'resetProject': handleResetProject,
    'republishContent': handleRepublishContent,

    // Project edit handler
    'editProject': handleEditProject,

    // Project rename handler
    'renameProject': handleRenameProject,

    // Utility handlers (help, settings)
    'openHelp': handleOpenHelp,
    'openSettings': handleOpenSettings,

    // View mode override (session persistence)
    'setViewModeOverride': handleSetViewModeOverride,

    // Project folder actions
    'copy-project-path': handleCopyProjectPath,

    // Open AI surface for a specific project (E3)
    'openAi': handleOpenAiForProject,

    // Pin / unpin a project — pinned projects sort first on the dashboard
    'setProjectPinned': handleSetProjectPinned,

    // Flip a project's AEM authoring experience (UE ↔ Experience Workspace)
    'setAuthoringExperience': handleSetAuthoringExperience,
});
