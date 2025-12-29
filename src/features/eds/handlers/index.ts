/**
 * EDS Handlers - Public API
 *
 * Exports the handler registry and individual handlers for backward compatibility.
 */

// Export registry (preferred)
export { EdsHandlerRegistry } from './EdsHandlerRegistry';

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
