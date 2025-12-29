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
} from './settingsTransferService';

export { deleteProject } from './projectDeletionService';
