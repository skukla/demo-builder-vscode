/**
 * Mesh Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred)
export { MeshHandlerRegistry } from './MeshHandlerRegistry';

// Export individual handlers (backward compatibility)
export * from './checkHandler';
export * from './createHandler';
export * from './deleteHandler';
