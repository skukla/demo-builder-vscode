/**
 * EDS (Edge Delivery Services) Feature
 *
 * Exports public API for EDS integration including:
 * - GitHub services for authentication and repository operations (extracted modules)
 * - DA.live services for content management (extracted modules)
 * - EDS Project service for complete project setup orchestration
 * - UI components for wizard steps
 * - Message handlers for wizard operations
 * - Types for GitHub, DA.live, and EDS entities
 */

// GitHub Services (extracted modules - explicit dependencies, locality of behavior)
export { GitHubTokenService } from './services/githubTokenService';
export { GitHubRepoOperations } from './services/githubRepoOperations';
export { GitHubFileOperations } from './services/githubFileOperations';
export { GitHubOAuthService } from './services/githubOAuthService';

// DA.live Services (extracted modules - explicit dependencies, locality of behavior)
export { DaLiveOrgOperations, type TokenProvider } from './services/daLiveOrgOperations';
export { DaLiveContentOperations, type DaLiveContentSource } from './services/daLiveContentOperations';
export { DaLiveAuthService } from './services/daLiveAuthService';

// Project Orchestration Services
export { ToolManager } from './services/toolManager';
export { HelixService, type UnpublishResult } from './services/helixService';
export { CleanupService } from './services/cleanupService';

// Template Patch Registry
export {
    applyTemplatePatches,
    getPatchById,
    getEnabledPatches,
    TEMPLATE_PATCHES,
} from './services/templatePatchRegistry';
export type { TemplatePatch, PatchResult } from './services/templatePatchRegistry';

// Config Generator (for EDS Reset)
export {
    generateConfigJson,
    extractConfigParams,
} from './services/configGenerator';
export type { ConfigGeneratorParams, ConfigGeneratorResult } from './services/configGenerator';

// Error Formatters
export {
    formatGitHubError,
    formatDaLiveError,
    formatHelixError,
} from './services/errorFormatters';

// Code Sync Errors
export {
    CodeSyncError,
    CodeSyncTimeoutError,
    CodeSyncPermissionError,
    CodeSyncNotFoundError,
    CodeSyncVerificationError,
} from './services/codeSyncErrors';

export type {
    TimeoutErrorContext,
    PermissionErrorContext,
    NotFoundErrorContext,
    VerificationErrorContext,
} from './services/codeSyncErrors';

// Note: UI Components (steps, hooks) are NOT exported here.
// They are imported directly by WizardContainer.tsx in the webpack bundle
// to avoid mixing React/Node.js compilation contexts.

// Handlers
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleVerifyDaLiveOrg,
    handleValidateAccsCredentials,
} from './handlers';

// Types - GitHub
export type {
    GitHubToken,
    GitHubTokenValidation,
    GitHubUser,
    GitHubRepo,
    GitHubFileContent,
    GitHubFileResult,
    OAuthCallbackParams,
} from './services/types';

export { REQUIRED_SCOPES } from './services/types';

// Types - DA.live
export type {
    DaLiveEntry,
    DaLiveSourceResult,
    DaLiveCopyResult,
    DaLiveOrgAccess,
    DaLiveProgressCallback,
} from './services/types';

export {
    DaLiveError,
    DaLiveAuthError,
    DaLiveNetworkError,
} from './services/types';

// Types - EDS Project
export type {
    EdsSetupPhase,
    EdsProjectConfig,
    EdsProjectSetupResult,
    EdsProgressCallback,
    HelixConfigResult,
    CodeSyncStatus,
} from './services/types';

export { EdsProjectError } from './services/types';

// Types - Tool Manager
export type {
    ACOConfig,
    ToolExecutionResult,
    ToolInstallOptions,
    ToolExecutionOptions,
} from './services/types';

export { ToolManagerError } from './services/types';

// Types - Error Formatting
export type {
    EdsError,
    EdsPartialState,
    GitHubErrorCode,
    DaLiveErrorCode,
    HelixErrorCode,
} from './services/types';

// Types - Cleanup
export type {
    EdsMetadata,
    EdsCleanupOptions,
    EdsCleanupResult,
    CleanupOperationResult,
} from './services/types';
