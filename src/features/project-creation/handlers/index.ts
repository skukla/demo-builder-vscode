/**
 * Project Creation Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred) - with backward-compatible alias
export { ProjectCreationHandlerRegistry, HandlerRegistry } from './ProjectCreationHandlerRegistry';

// Export individual handlers (backward compatibility)
export * from './validateHandler';
export * from './createHandler';
export * from './executor';
