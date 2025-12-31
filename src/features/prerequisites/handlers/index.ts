/**
 * Prerequisites Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map (preferred - Step 3: Handler Registry Simplification)
export { prerequisitesHandlers } from './prerequisitesHandlers';

// Export individual handlers (backward compatibility)
export * from './checkHandler';
export * from './continueHandler';
export * from './installHandler';
