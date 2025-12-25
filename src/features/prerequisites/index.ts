/**
 * Prerequisites Feature
 *
 * Handles detection, validation, and installation of required tools:
 * - Node.js (via fnm multi-version management)
 * - npm
 * - Adobe I/O CLI
 * - Other dependencies
 *
 * Public API:
 * - PrerequisitesManager: Main service for checking/installing prerequisites
 * - Handler functions for wizard message handling
 * - Type exports for prerequisite definitions
 */

// Main service
export { PrerequisitesManager } from './services/PrerequisitesManager';

// Types re-exported from service
export type {
    PrerequisiteCheck,
    ProgressMilestone,
    InstallStep,
    PrerequisiteInstall,
    PrerequisitePlugin,
    PrerequisiteDefinition,
    ComponentRequirement,
    PrerequisitesConfig,
    PrerequisiteStatus,
} from './services/PrerequisitesManager';

// Handlers - Named exports for HandlerRegistry use
export { handleCheckPrerequisites } from './handlers/checkHandler';
export { handleInstallPrerequisite } from './handlers/installHandler';
export { handleContinuePrerequisites } from './handlers/continueHandler';

// Note: Internal utilities (versioning, cache manager) are NOT exported.
// Access them via PrerequisitesManager methods if needed.
