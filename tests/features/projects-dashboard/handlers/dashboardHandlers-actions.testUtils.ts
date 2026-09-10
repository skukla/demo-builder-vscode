/**
 * The module wall the two ACTION suites share — `dashboardHandlers-projectActions`
 * and `dashboardHandlers-settingsActions`.
 *
 * Separate from `dashboardHandlers.testUtils` on purpose. That wall exists for the
 * three suites that exercise `handleGetProjects` and its mesh enrichment, and mocks
 * the mesh/staleness pair those need. These two suites never reach mesh; they reach
 * the DELEGATION seam — settings transfer, deletion, rename, reset — and handing
 * either family the other's wall is the failure the first file's own header warns
 * about.
 *
 * Suites import the handlers FROM HERE: `jest.mock` hoists above the imports of the
 * module it appears in, so a suite importing the handlers itself could bind them
 * before these mocks were registered.
 */

/**
 * `validateProjectPath()` canonicalizes via `fs.realpathSync`; an identity
 * `realpathSync` keeps the security prefix check intact while letting valid in-tree
 * project paths through regardless of what exists on disk.
 */
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

export const mockImportSettingsFromFile = jest.fn();
export const mockCopySettingsFromProject = jest.fn();
export const mockExportProjectSettings = jest.fn();
jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    importSettingsFromFile: (...args: unknown[]) => mockImportSettingsFromFile(...args),
    copySettingsFromProject: (...args: unknown[]) => mockCopySettingsFromProject(...args),
    exportProjectSettings: (...args: unknown[]) => mockExportProjectSettings(...args),
}));

export const mockDeleteProject = jest.fn();
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
}));

export const mockRenameProjectCore = jest.fn();
jest.mock('@/features/projects-dashboard/services/projectRenameService', () => ({
    renameProjectCore: (...args: unknown[]) => mockRenameProjectCore(...args),
}));

export const mockExtractSettingsFromProject = jest.fn();
jest.mock('@/features/projects-dashboard/services/settingsSerializer', () => ({
    extractSettingsFromProject: (...args: unknown[]) => mockExtractSettingsFromProject(...args),
}));

export const mockOpenInIncognito = jest.fn();
jest.mock('@/core/utils/browserUtils', () => ({
    openInIncognito: (...args: unknown[]) => mockOpenInIncognito(...args),
}));

export const mockResolveProjectAuthoringExperience = jest.fn();
export const mockGetEwCanvasBranch = jest.fn();
jest.mock('@/features/eds/handlers/edsHelpers', () => ({
    resolveProjectAuthoringExperience: (...args: unknown[]) =>
        mockResolveProjectAuthoringExperience(...args),
    getEwCanvasBranch: (...args: unknown[]) => mockGetEwCanvasBranch(...args),
}));

export const mockResetProjectWithUI = jest.fn();
jest.mock('@/features/lifecycle/services/projectResetService', () => ({
    resetProjectWithUI: (...args: unknown[]) => mockResetProjectWithUI(...args),
}));

export const mockResetEdsProjectWithUI = jest.fn();
jest.mock('@/features/eds/services/reset/edsResetUI', () => ({
    resetEdsProjectWithUI: (...args: unknown[]) => mockResetEdsProjectWithUI(...args),
}));

export const mockGetCommandExecutor = jest.fn();
export const mockGetAuthenticationService = jest.fn();
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getCommandExecutor: (...args: unknown[]) => mockGetCommandExecutor(...args),
        getAuthenticationService: (...args: unknown[]) => mockGetAuthenticationService(...args),
    },
}));

// Below the mocks on purpose — see the note above about hoisting.
export {
    handleCopyFromExisting,
    handleDeleteProject,
    handleEditProject,
    handleExportProject,
    handleImportFromFile,
    handleOpenBrowser,
    handleOpenDaLive,
    handleOpenHelp,
    handleOpenLiveSite,
    handleOpenSettings,
    handleRenameProject,
    handleResetProject,
    handleSetProjectPinned,
    handleSetViewModeOverride,
    handleStartDemo,
    handleStopDemo,
} from '@/features/projects-dashboard/handlers/dashboardHandlers';
