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

// Handlers
export {
    handleGetProjects,
    handleSelectProject,
    handleCreateProject,
} from './handlers/dashboardHandlers';

// Handler Registry
export { ProjectsListHandlerRegistry } from './handlers/ProjectsListHandlerRegistry';

// Commands
export { ShowProjectsListCommand } from './commands/showProjectsList';
