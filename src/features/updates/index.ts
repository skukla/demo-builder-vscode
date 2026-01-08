/**
 * Updates Feature
 *
 * Handles extension and component updates via GitHub Releases,
 * including background checking, auto-updates, and manual updates.
 *
 * Public API:
 * - UpdateManager: Check for extension and component updates
 * - ComponentUpdater: Update components with snapshot/rollback safety
 * - ExtensionUpdater: Download and install extension updates
 * - CheckUpdatesCommand: VS Code command for manual update checks
 */

// Services
export { UpdateManager } from './services/updateManager';
export type { UpdateCheckResult, MultiProjectUpdateResult } from './services/updateManager';

export { ComponentUpdater } from './services/componentUpdater';

export { ExtensionUpdater } from './services/extensionUpdater';

export { ComponentRepositoryResolver } from './services/componentRepositoryResolver';
export type { ComponentRepositoryInfo } from './services/componentRepositoryResolver';

// Commands
export { CheckUpdatesCommand } from './commands/checkUpdates';

// Note: Internal types (ReleaseInfo, GitHubRelease, etc.) are NOT exported.
// They are internal to the update services.
