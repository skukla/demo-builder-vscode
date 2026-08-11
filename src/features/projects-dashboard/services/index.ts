/**
 * Projects Dashboard Services
 *
 * Business logic services for projects dashboard operations.
 */

export {
    parseSettingsFile,
    isValidSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
} from './settingsSerializer';

export {
    importSettingsFromFile,
    copySettingsFromProject,
    exportProjectSettings,
    exportProjectSettingsToFile,
} from './settingsTransferService';
export type { ExportSettingsToFileResult } from './settingsTransferService';

export { deleteProject } from './projectDeletionService';

export { renameProjectCore } from './projectRenameService';
