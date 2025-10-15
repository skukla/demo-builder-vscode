/**
 * Updates Feature
 *
 * Handles extension and component updates via GitHub Releases,
 * including background checking, auto-updates, and manual updates.
 */

// Export services
export * from './services/updateManager';
export * from './services/componentUpdater';
export * from './services/extensionUpdater';

// Export commands
export * from './commands/checkUpdates';
