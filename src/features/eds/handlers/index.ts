/**
 * EDS Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map (preferred - Step 3: Handler Registry Simplification)
export { edsHandlers } from './edsHandlers';

// Export individual handlers (backward compatibility)
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleGetDaLiveSites,
    handleVerifyDaLiveOrg,
    handleVerifyGitHubRepo,
    handleValidateAccsCredentials,
    handleDaLiveOAuth,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
    clearServiceCache,
} from './edsHandlers';

// Export helpers for direct access (clearServiceCache already exported from edsHandlers)
export {
    getGitHubServices,
    getDaLiveServices,
    getDaLiveAuthService,
    validateDaLiveToken,
    type GitHubServices,
    type DaLiveServices,
    type DaLiveTokenValidationResult,
} from './edsHelpers';
