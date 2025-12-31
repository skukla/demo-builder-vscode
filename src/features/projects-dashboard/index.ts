/**
 * Projects Dashboard Feature
 *
 * Main dashboard showing all projects with search/filter capabilities.
 * Replaces the Welcome Screen as the primary entry point.
 */

// UI Components
export { ProjectsDashboard } from './ui/ProjectsDashboard';
export type { ProjectsDashboardProps } from './ui/ProjectsDashboard';

export {
    ProjectCard,
    ProjectsGrid,
    DashboardEmptyState,
} from './ui/components';
export type {
    ProjectCardProps,
    ProjectsGridProps,
    DashboardEmptyStateProps,
} from './ui/components';

// Handler map (Step 3: Handler Registry Simplification)
export { projectsListHandlers } from './handlers';

// Handlers (backward compatibility)
export {
    handleGetProjects,
    handleSelectProject,
    handleCreateProject,
    handleImportFromFile,
    handleCopyFromExisting,
    handleExportProject,
} from './handlers/dashboardHandlers';

// Commands
export { ShowProjectsListCommand } from './commands/showProjectsList';

// Services
export {
    parseSettingsFile,
    isValidSettingsFile,
    isNewerVersion,
    extractSettingsFromProject,
    createExportSettings,
    getSuggestedFilename,
} from './services/settingsSerializer';
export type { ParseResult, ParseError } from './services/settingsSerializer';

// Types
export type {
    SettingsFile,
    SettingsSelections,
    SettingsConfigs,
    SettingsAdobeContext,
    SettingsSource,
    ImportResult,
} from './types/settingsFile';
export { SETTINGS_FILE_VERSION } from './types/settingsFile';

// Utils
export {
    getComponentSummary,
    getComponentCount,
    getProjectDescription,
} from './utils/componentSummaryUtils';
