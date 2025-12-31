/**
 * Project Creation Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map (object literal with all handlers)
export { projectCreationHandlers } from './ProjectCreationHandlerRegistry';

// Export progress callback config
export { needsProgressCallback } from './progressCallbackConfig';

// Export individual handlers (backward compatibility)
export * from './validateHandler';
export * from './createHandler';
export * from './executor';
