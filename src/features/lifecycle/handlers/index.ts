/**
 * Lifecycle Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred)
export { LifecycleHandlerRegistry } from './LifecycleHandlerRegistry';

// Export individual handlers (backward compatibility)
export * from './lifecycleHandlers';
