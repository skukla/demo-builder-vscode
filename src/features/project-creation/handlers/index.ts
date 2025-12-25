/**
 * Project Creation Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred)
export { HandlerRegistry } from './HandlerRegistry';

// Export individual handlers (backward compatibility)
export * from './validateHandler';
export * from './createHandler';
export * from './executor';
