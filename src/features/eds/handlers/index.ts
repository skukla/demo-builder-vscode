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

// Note: edsHelpers are internal implementation details
// They should not be exported from the public API
// Use relative imports within eds/handlers instead
