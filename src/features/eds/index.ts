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
export { GitHubTokenService } from './services/github/githubTokenService';
export { GitHubRepoOperations } from './services/github/githubRepoOperations';
export { GitHubFileOperations } from './services/github/githubFileOperations';
export { GitHubOAuthService } from './services/github/githubOAuthService';

// DA.live Services (extracted modules - explicit dependencies, locality of behavior)
export { DaLiveOrgOperations, type TokenProvider } from './services/daLive/daLiveOrgOperations';
export {
    DaLiveContentOperations,
    type DaLiveContentSource,
} from './services/daLive/daLiveContentOperations';
export { DaLiveAuthService } from './services/daLive/daLiveAuthService';
export {
    DaLiveConfigService,
    type PermissionRow,
    type MultiSheetConfig,
    type GrantAccessResult,
    type HasAccessResult,
} from './services/daLive/daLiveConfigService';

// Project Orchestration Services
export { ToolManager } from './services/toolManager';
export { HelixService } from './services/helix/helixService';
export { CleanupService } from './services/cleanupService';
export {
    ConfigurationService,
    type SiteRegistrationParams,
    type ConfigServiceResult,
} from './services/configService/configurationService';

// Config Generator (for EDS Reset)
export { generateConfigJson, extractConfigParams } from './services/configGenerator';
export type { ConfigGeneratorParams, ConfigGeneratorResult } from './services/configGenerator';

// EDS Reset Service (shared by dashboard and projects-dashboard)
export { executeEdsReset, extractResetParams } from './services/reset/edsResetService';
export type {
    EdsResetParams,
    EdsResetProgress,
    EdsResetResult,
    ExtractParamsResult,
} from './services/reset/edsResetService';

// EDS Reset UI (UI orchestration extracted from edsResetService)
export { resetEdsProjectWithUI } from './services/reset/edsResetUI';
export type { ResetWithUIOptions } from './services/reset/edsResetUI';

// Storefront Staleness Detection (config.json republish tracking)
export {
    detectStorefrontChanges,
    updateStorefrontState,
    getCurrentStorefrontState,
    getStorefrontEnvVars,
} from './services/storefront/storefrontStalenessDetector';

// EDS Project Detection (single source of truth from typeGuards)
export { isEdsProject } from '@/types/typeGuards';
export type { StorefrontState, StorefrontChanges } from './services/storefront/storefrontStalenessDetector';

// Storefront Republish Service
export {
    republishStorefrontConfig,
    extractRepublishParams,
    needsStorefrontRepublish,
} from './services/storefront/storefrontRepublishService';
export type { RepublishParams, RepublishResult } from './services/storefront/storefrontRepublishService';

// Authoring-experience flip side-effects (shared by Configure + EW settings listener)
export {
    applyAuthoringExperienceFlip,
    type FlipResult,
    type FlipStepResult,
    type AuthoringExperienceFlipDeps,
} from './services/authoringExperienceFlip';

// EW settings-change listener (republish affected projects on daLive setting change)
export {
    registerEwSettingChangeListener,
    type EwSettingChangeListenerDeps,
} from './services/ewSettingChangeListener';

// Fstab Generator (single source of truth for fstab.yaml)
export { generateFstabContent } from './services/fstabGenerator';
export type { FstabConfig } from './services/fstabGenerator';

// Error Formatters
export { formatGitHubError, formatDaLiveError, formatHelixError } from './services/errorFormatters';

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
// They are imported directly by WizardContainer.tsx in the esbuild browser bundle
// to avoid mixing React/Node.js compilation contexts.

// Handlers
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleDiscoverStoreStructure,
    handleCheckCredentialService,
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

export { GITHUB_SCOPES } from './services/types';

// Types - DA.live
export type {
    DaLiveEntry,
    DaLiveSourceResult,
    DaLiveCopyResult,
    DaLiveOrgAccess,
    DaLiveProgressCallback,
} from './services/types';

export { DaLiveError, DaLiveAuthError, DaLiveNetworkError } from './services/types';

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
