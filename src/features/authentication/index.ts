/**
 * Authentication Feature
 *
 * Handles Adobe authentication, organization selection, project selection,
 * and workspace management via Adobe Console SDK.
 *
 * Public API:
 * - AuthenticationService: Main service for Adobe authentication
 * - TokenManager: Token validation and caching
 * - Handler functions for HandlerRegistry use
 *
 * Internal Services (not exported):
 * - AdobeEntityFetcher, AdobeContextResolver, AdobeEntitySelector (used internally by AuthenticationService)
 * - Validation utilities (use @/core/validation instead)
 */

// Main service
export { AuthenticationService } from './services/authenticationService';

// Sub-services
export { TokenManager } from './services/tokenManager';
export { OrganizationValidator } from './services/organizationValidator';
export { AdobeSDKClient } from './services/adobeSDKClient';
export { AuthCacheManager } from './services/authCacheManager';
export { AuthenticationErrorFormatter } from './services/authenticationErrorFormatter';

// Handlers - Explicit named exports (no wildcards)
export { handleCheckAuth, handleAuthenticate } from './handlers/authenticationHandlers';
export {
    handleEnsureOrgSelected,
    handleGetProjects,
    handleSelectProject,
    handleCheckProjectApis,
} from './handlers/projectHandlers';
export {
    handleGetWorkspaces,
    handleSelectWorkspace,
} from './handlers/workspaceHandlers';

// Types
export type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    AdobeConsoleWhereResponse,
    SDKResponse,
    AdobeCLIError,
    AuthToken,
    AuthTokenValidation,
    CacheEntry,
    PerformanceMetric,
} from './services/types';
