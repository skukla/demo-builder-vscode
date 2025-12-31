/**
 * Lifecycle Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 * Individual handlers are exported for use by project-creation handlers.
 */

// Export handler map (preferred - Step 3: Handler Registry Simplification)
export { lifecycleHandlers } from './lifecycleHandlers';

// Export individual handlers (for backward compatibility with project-creation)
export {
    handleReady,
    handleCancel,
    handleCancelProjectCreation,
    handleCancelMeshCreation,
    handleCancelAuthPolling,
    handleOpenProject,
    handleBrowseFiles,
    handleLog,
    handleOpenAdobeConsole,
    handleShowLogs,
    handleOpenExternal,
} from './lifecycleHandlers';
