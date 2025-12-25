/**
 * Prerequisites Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred)
export { PrerequisitesHandlerRegistry } from './PrerequisitesHandlerRegistry';

// Export individual handlers (backward compatibility)
export * from './checkHandler';
export * from './continueHandler';
export * from './installHandler';
