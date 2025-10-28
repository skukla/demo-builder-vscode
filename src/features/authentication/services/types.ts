/**
 * Shared types for authentication module
 *
 * Note: Adobe entity types (Organization, Project, Workspace, AdobeContext) have been
 * consolidated to src/types/adobe.ts and are re-exported from @/types for global use.
 */

// Re-export Adobe entity types from centralized location for backward compatibility
export type {
    Organization as AdobeOrg,
    AdobeProject,
    Workspace as AdobeWorkspace,
    AdobeContext,
    RawAdobeOrg,
    RawAdobeProject,
    RawAdobeWorkspace,
    AdobeConsoleWhereResponse,
    SDKResponse,
    AdobeCLIError,
} from '@/types/adobe';

export interface AuthToken {
    token: string;
    expiry: number;
}

export interface AuthTokenValidation {
    isValid: boolean;
    org: string;
    expiry: number;
}

export interface CacheEntry<T> {
    data: T;
    expiry: number;
}

export interface PerformanceMetric {
    operation: string;
    duration: number;
    timestamp: number;
}
