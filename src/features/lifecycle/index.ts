/**
 * Lifecycle Feature
 *
 * Manages demo lifecycle operations (start, stop, project management)
 *
 * Public API:
 * - StartDemoCommand: Start the demo server
 * - StopDemoCommand: Stop the demo server
 * - LifecycleHandlerRegistry: Message handler registry for wizard lifecycle events
 *
 * Internal Services (not exported):
 * - services/lifecycleService: Logs panel toggling, UI state management
 * - handlers/lifecycleHandlers: Individual handler functions (internal)
 */

// Commands
export { StartDemoCommand } from './commands/startDemo';
export { StopDemoCommand } from './commands/stopDemo';

// Handler Registry (only the registry, not individual handlers)
export { LifecycleHandlerRegistry } from './handlers';

// Note: Individual handlers (handleReady, handleCancel, etc.) are NOT exported.
// They are internal to the lifecycle feature. Use LifecycleHandlerRegistry for message dispatch.
