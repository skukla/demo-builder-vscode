/**
 * Projects Dashboard Message Handlers
 *
 * Handles messages from the Projects Dashboard webview.
 * Follows Pattern B: Returns response data (doesn't use sendMessage).
 *
 * Split by job on 2026-10-05 (EDS-8; 951 lines, 22 imports) and re-exported here,
 * so the handler map, `configure.ts` and their tests keep naming this path:
 *   - `projectsListBrowse`    — list, select, create, help, settings
 *   - `projectsListTransfer`  — import from file, copy from existing, export
 *   - `projectsListOpen`      — start/stop the demo, open browser/AI/live site/DA.live/Admin
 *   - `projectsListLifecycle` — delete, edit, rename, reset, pin
 *
 * @module features/projects-dashboard/handlers/dashboardHandlers
 */

export {
    handleCreateProject,
    handleGetProjects,
    handleOpenHelp,
    handleOpenSettings,
    handleSelectProject,
} from './projectsListBrowse';
export {
    handleDeleteProject,
    handleEditProject,
    handleRenameProject,
    handleResetProject,
    handleSetProjectPinned,
    type DeleteProjectPayload,
    type ResetProjectPayload,
} from './projectsListLifecycle';
export {
    handleOpenAdminPanel,
    handleOpenAiForProject,
    handleOpenBrowser,
    handleOpenDaLive,
    handleOpenLiveSite,
    handleStartDemo,
    handleStopDemo,
} from './projectsListOpen';
export { handleCopyFromExisting, handleExportProject, handleImportFromFile } from './projectsListTransfer';
