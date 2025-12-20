/**
 * EDS (Edge Delivery Services) Feature
 *
 * Exports public API for EDS integration including:
 * - GitHub service for authentication and repository operations
 * - DA.live service for content management
 * - EDS Project service for complete project setup orchestration
 * - UI components for wizard steps
 * - Message handlers for wizard operations
 * - Types for GitHub, DA.live, and EDS entities
 */

// Services
export { GitHubService } from './services/githubService';
export { DaLiveService } from './services/daLiveService';
export { EdsProjectService } from './services/edsProjectService';
export { ToolManager } from './services/toolManager';
export { HelixService, type UnpublishResult } from './services/helixService';
export { CleanupService } from './services/cleanupService';

// Error Formatters
export {
    formatGitHubError,
    formatDaLiveError,
    formatHelixError,
} from './services/errorFormatters';

// UI Components
export { DataSourceConfigStep } from './ui/steps/DataSourceConfigStep';
export { GitHubSetupStep } from './ui/steps/GitHubSetupStep';
export { EdsRepositoryConfigStep } from './ui/steps/EdsRepositoryConfigStep';
export { useGitHubAuth } from './ui/hooks/useGitHubAuth';

// Handlers
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
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
