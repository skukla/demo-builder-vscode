/**
 * Lifecycle Handlers - Public API
 *
 * Exports the handler registry and individual handlers.
 * Individual handlers are exported for use by project-creation HandlerRegistry.
 */

// Export registry (preferred for new code)
export { LifecycleHandlerRegistry } from './LifecycleHandlerRegistry';

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
