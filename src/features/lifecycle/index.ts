/**
 * Lifecycle Feature
 *
 * Manages demo lifecycle operations (start, stop, project management)
 *
 * Public API:
 * - StartDemoCommand: Start the demo server
 * - StopDemoCommand: Stop the demo server
 * - lifecycleHandlers: Handler map for wizard lifecycle events
 *
 * Internal Services (not exported):
 * - services/lifecycleService: Logs panel toggling, UI state management
 * - handlers/lifecycleHandlers: Individual handler functions (internal)
 */

// Commands
export { StartDemoCommand } from './commands/startDemo';
export { StopDemoCommand } from './commands/stopDemo';

// Handler map (Step 3: Handler Registry Simplification)
export { lifecycleHandlers } from './handlers';

// Note: Individual handlers (handleReady, handleCancel, etc.) are NOT exported.
// They are internal to the lifecycle feature. Use lifecycleHandlers with dispatchHandler.
