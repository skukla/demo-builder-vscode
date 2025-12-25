/**
 * EDS DA.live Handlers
 *
 * Message handlers for DA.live (Dark Alley) related EDS operations.
 *
 * This module re-exports handlers from domain-specific files:
 * - `edsDaLiveOrgHandlers.ts` - Organization and site operations
 * - `edsDaLiveAuthHandlers.ts` - Authentication operations
 *
 * Handlers:
 * - `handleVerifyDaLiveOrg`: Check user access to DA.live organization
 * - `handleGetDaLiveSites`: List sites in a DA.live organization
 * - `handleDaLiveOAuth`: Initiate OAuth flow with DA.live
 * - `handleCheckDaLiveAuth`: Check DA.live authentication status
 * - `handleOpenDaLiveLogin`: Open DA.live for login with bookmarklet info
 * - `handleStoreDaLiveToken`: Store a manually pasted DA.live token
 * - `handleStoreDaLiveTokenWithOrg`: Store token and verify org in one operation
 * - `handleClearDaLiveAuth`: Clear stored DA.live authentication
 *
 * @module features/eds/handlers/edsDaLiveHandlers
 */

// Re-export all DA.live org handlers
export {
    handleVerifyDaLiveOrg,
    handleGetDaLiveSites,
} from './edsDaLiveOrgHandlers';

// Re-export all DA.live auth handlers
export {
    handleDaLiveOAuth,
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './edsDaLiveAuthHandlers';
