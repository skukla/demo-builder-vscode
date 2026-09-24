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
    handleOpenAdminPanel,
    handleResetProject,
    handleEditProject,
    handleRenameProject,
    handleOpenHelp,
    handleOpenSettings,
    handleOpenAiForProject,
    handleSetProjectPinned,
} from './dashboardHandlers';
import {
    handleBackgroundOperation,
    handleGetOperationProgress,
} from '@/core/vscode/operationProgress';
import { handleAnswerOperationPrompt } from '@/core/vscode/operationPrompt';
import { handleOpenDebugLogs } from '@/features/dashboard/handlers/panelNavigationHandlers';
import { handleSetViewModeOverride } from '@/core/handlers/viewModeHandler';
import { defineHandlers } from '@/types/handlers';

/**
 * Projects list feature handler map
 * Maps message types to handler functions for the Projects List view
 *
 * Replaces ProjectsListHandlerRegistry class with simple object literal.
 */
export const projectsListHandlers = defineHandlers({
    // Project loading handlers
    getProjects: handleGetProjects,

    // Project selection handler
    selectProject: handleSelectProject,

    // Project creation handler
    createProject: handleCreateProject,

    // Settings import/export/copy handlers
    importFromFile: handleImportFromFile,
    copyFromExisting: handleCopyFromExisting,
    exportProject: handleExportProject,

    // Project deletion handler
    deleteProject: handleDeleteProject,

    // Demo control handlers
    startDemo: handleStartDemo,
    stopDemo: handleStopDemo,
    openBrowser: handleOpenBrowser,
    openLiveSite: handleOpenLiveSite,
    openDaLive: handleOpenDaLive,
    openAdminPanel: handleOpenAdminPanel,

    // Project reset handler
    resetProject: handleResetProject,

    // Project edit handler
    editProject: handleEditProject,

    // Project rename handler
    renameProject: handleRenameProject,

    // Utility handlers (help, settings)
    openHelp: handleOpenHelp,
    openSettings: handleOpenSettings,

    // View mode override (session persistence)
    setViewModeOverride: handleSetViewModeOverride,



    // Open AI surface for a specific project (E3)
    openAi: handleOpenAiForProject,

    // Pin / unpin a project — pinned projects sort first on the dashboard
    setProjectPinned: handleSetProjectPinned,

    // The progress modal a reset narrates into (PL-59): where a reopened modal
    // asks how far the run got, and how a closed one hands over to a
    // notification. Shared with every other screen that hosts the modal.
    getOperationProgress: handleGetOperationProgress,
    backgroundOperation: handleBackgroundOperation,
    // The SC answered a question the work was paused on — a sign-in that expired,
    // a prerequisite missing, a merge needing a decision (PL-59, owner 2026-09-20).
    answerOperationPrompt: handleAnswerOperationPrompt,
    openDebugLogs: handleOpenDebugLogs,
});
