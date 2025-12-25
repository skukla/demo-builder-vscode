/**
 * Lifecycle Feature
 *
 * Manages demo lifecycle operations (start, stop, project management)
 *
 * Internal Services (not exported):
 * - services/lifecycleService: Logs panel toggling, UI state management
 */

// Export commands
export * from './commands/startDemo';
export * from './commands/stopDemo';

// Export handlers
export * from './handlers';
