/**
 * EDS Handlers - Public API
 *
 * Exports the handler map and individual handlers.
 */

// Export handler map
export { edsHandlers } from './edsHandlers';

// Export individual handlers
export { handleDiscoverStoreStructure } from './edsHandlers';
export { handleCheckCredentialService } from './credentialServiceHandler';
export {
    handleCheckGitHubAuth,
    handleGitHubOAuth,
    handleGitHubChangeAccount,
    handleGetGitHubRepos,
    handleCreateGitHubRepo,
} from './edsGitHubHandlers';
export {
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './daLive/edsDaLiveHandlers';
export { clearServiceCache } from './edsHandlers';

// Export storefront setup handlers
export {
    handleStartStorefrontSetup,
    handleCancelStorefrontSetup,
} from './storefrontSetup/storefrontSetupHandlers';

// Note: edsHelpers are internal implementation details
// They should not be exported from the public API
// Use relative imports within eds/handlers instead
export { handleCheckRepoReadiness } from './checkRepoReadinessHandler';
