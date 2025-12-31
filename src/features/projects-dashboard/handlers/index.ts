/**
 * Projects Dashboard Handlers - Public API
 *
 * Exports the handler map and individual handlers for projects list.
 */

// Export handler map (preferred - Step 3: Handler Registry Simplification)
export { projectsListHandlers } from './projectsListHandlers';

// Export individual handlers (backward compatibility)
export * from './dashboardHandlers';
