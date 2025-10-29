/**
 * Shared types for authentication module
 *
 * Note: Adobe entity types (Organization, Project, Workspace, AdobeContext) are defined
 * in src/core/ui/types/index.ts and re-exported here for backward compatibility.
 */

// Re-export Adobe entity types from centralized location for backward compatibility
export type {
    Organization as AdobeOrg,
    AdobeProject,
    Workspace as AdobeWorkspace,
} from '@/core/ui/types';

// Raw Adobe CLI response types (not in core/ui/types)
export interface RawAdobeOrg {
    id: string;
    code: string;
    name: string;
    type?: string;
}

export interface RawAdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;  // Project type from Adobe API
    org_id?: string;
}

export interface RawAdobeWorkspace {
    id: string;
    name: string;
    title?: string;
    description?: string;
    project_id?: string;
}

export interface AdobeContext {
    org?: string | { id: string; name: string; code: string };
    project?: string | {
        id: string;
        name: string;
        title?: string;
        description?: string;
        type?: string;
        org_id?: string;
    };
    workspace?: string | { id: string; name: string; title?: string };
}

export interface AdobeConsoleWhereResponse {
    org?: string | { id: string; name: string; code: string };
    project?: string | {
        id: string;
        name: string;
        title?: string;
        description?: string;
        type?: string;
        org_id?: string;
    };
    workspace?: string | { id: string; name: string; title?: string };
}

export interface SDKResponse<T = any> {
    body?: T;
    statusCode?: number;
}

export interface AdobeCLIError extends Error {
    code?: string;
    stdout?: string;
    stderr?: string;
}

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
