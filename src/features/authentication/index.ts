/**
 * Authentication Feature
 *
 * Handles Adobe authentication, organization selection, project selection,
 * and workspace management via Adobe Console SDK.
 */

// Main service
export { AuthenticationService } from './services/authenticationService';

// Sub-services
export { AdobeEntityService } from './services/adobeEntityService';
export { TokenManager } from './services/tokenManager';
export { OrganizationValidator } from './services/organizationValidator';
export { AdobeSDKClient } from './services/adobeSDKClient';
export { AuthCacheManager } from './services/authCacheManager';
export { PerformanceTracker } from './services/performanceTracker';

// Handlers
export { handleCheckAuth, handleAuthenticate } from './handlers/authenticationHandlers';

// Types
export type {
    AdobeOrg,
    AdobeProject,
    AdobeWorkspace,
    AdobeContext,
    AuthToken,
    ValidationResult,
    CacheEntry,
    PerformanceMetric,
} from './services/types';
