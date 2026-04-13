/**
 * EDS Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map
export { edsHandlers } from './edsHandlers';

// Export individual handlers
export { handleValidateAccsCredentials, handleDiscoverStoreStructure } from './edsHandlers';
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleVerifyGitHubRepo,
    handleCreateGitHubRepo,
} from './edsGitHubHandlers';
export {
    handleVerifyDaLiveOrg,
    handleGetDaLiveSites,
    handleListDaLiveOrgs,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './edsDaLiveHandlers';
export { clearServiceCache } from './edsHandlers';

// Export storefront setup handlers
export {
    handleStartStorefrontSetup,
    handleCancelStorefrontSetup,
    handleResumeStorefrontSetup,
} from './storefrontSetupHandlers';

// Note: edsHelpers are internal implementation details
// They should not be exported from the public API
// Use relative imports within eds/handlers instead
