/**
 * Authentication module barrel export
 * Provides clean imports for all authentication-related functionality
 */

// Main service
export { AuthenticationService } from './authenticationService';

// Sub-services
export { AdobeEntityService } from './adobeEntityService';
export { TokenManager } from './tokenManager';
export { OrganizationValidator } from './organizationValidator';
export { AdobeSDKClient } from './adobeSDKClient';
export { AuthCacheManager } from './authCacheManager';
export { PerformanceTracker } from './performanceTracker';

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
} from './types';
