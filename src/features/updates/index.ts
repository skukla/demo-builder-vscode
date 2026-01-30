/**
 * Updates Feature
 *
 * Handles extension and component updates via GitHub Releases,
 * including background checking, auto-updates, and manual updates.
 *
 * Also handles EDS template updates via commit-based comparison,
 * enabling storefronts to receive updates from their upstream template.
 *
 * Public API:
 * - UpdateManager: Check for extension and component updates
 * - ComponentUpdater: Update components with snapshot/rollback safety
 * - ExtensionUpdater: Download and install extension updates
 * - TemplateUpdateChecker: Check for EDS template updates (commit-based)
 * - TemplateSyncService: Sync EDS projects with upstream templates
 * - CheckUpdatesCommand: VS Code command for manual update checks
 */

// Services
export { UpdateManager } from './services/updateManager';
export type { UpdateCheckResult, MultiProjectUpdateResult } from './services/updateManager';

export { ComponentUpdater } from './services/componentUpdater';

export { ExtensionUpdater } from './services/extensionUpdater';

export { ComponentRepositoryResolver } from './services/componentRepositoryResolver';
export type { ComponentRepositoryInfo } from './services/componentRepositoryResolver';

// Template sync services (for EDS storefronts)
export { TemplateUpdateChecker } from './services/templateUpdateChecker';
export type { TemplateUpdateResult } from './services/templateUpdateChecker';

export { TemplateSyncService } from './services/templateSyncService';
export type { TemplateSyncOptions, TemplateSyncResult } from './services/templateSyncService';

// Commands
export { CheckUpdatesCommand } from './commands/checkUpdates';

// Note: Internal types (ReleaseInfo, GitHubRelease, etc.) are NOT exported.
// They are internal to the update services.
