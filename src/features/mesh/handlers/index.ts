/**
 * Mesh Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map (preferred - Step 3: Handler Registry Simplification)
export { meshHandlers } from './meshHandlers';

// Export individual handlers (backward compatibility)
export * from './checkHandler';
export * from './createHandler';
export * from './deleteHandler';
