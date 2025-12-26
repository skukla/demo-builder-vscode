/**
 * Lifecycle Handlers - Public API
 *
 * Exports only the handler registry. Individual handlers are internal
 * and should be accessed via the registry for message dispatch.
 */

// Export registry only (preferred)
export { LifecycleHandlerRegistry } from './LifecycleHandlerRegistry';

// Note: Individual handlers (handleReady, handleCancel, etc.) are NOT exported.
// They are internal and registered with LifecycleHandlerRegistry.
