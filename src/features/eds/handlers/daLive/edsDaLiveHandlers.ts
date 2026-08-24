/**
 * EDS DA.live Handlers
 *
 * Message handlers for DA.live (Dark Alley) related EDS operations.
 *
 * This module re-exports handlers from domain-specific files:
 * - `edsDaLiveAuthHandlers.ts` - Authentication operations
 *
 * Handlers:
 * - `handleCheckDaLiveAuth`: Check DA.live authentication status
 * - `handleOpenDaLiveLogin`: Open DA.live for login with bookmarklet info
 * - `handleStoreDaLiveToken`: Store a manually pasted DA.live token
 * - `handleStoreDaLiveTokenWithOrg`: Store token and verify org in one operation
 * - `handleClearDaLiveAuth`: Clear stored DA.live authentication
 *
 * @module features/eds/handlers/daLive/edsDaLiveHandlers
 */

// hasWriteAccess moved to the service layer (daLiveOrgOperations) as
// part of the AEM Assets first-time-user fix. Re-export removed; no
// external consumer was importing it via this barrel — direct importers
// are updated to pull from the service directly.

// Re-export all DA.live auth handlers
export {
    handleCheckDaLiveAuth,
    handleOpenDaLiveLogin,
    handleStoreDaLiveToken,
    handleStoreDaLiveTokenWithOrg,
    handleClearDaLiveAuth,
} from './edsDaLiveAuthHandlers';
