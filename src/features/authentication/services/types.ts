/**
 * Shared types for authentication module
 */

export interface AdobeOrg {
    id: string;
    code: string;
    name: string;
}

export interface AdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string;
    org_id?: number;
}

export interface AdobeWorkspace {
    id: string;
    name: string;
    title?: string;
}

export interface AdobeContext {
    organization?: AdobeOrg;
    project?: AdobeProject;
    workspace?: AdobeWorkspace;
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

/**
 * Raw Adobe CLI Response Types
 * These represent the actual JSON structure returned by Adobe CLI commands
 */
export interface RawAdobeOrg {
    id: string;
    code: string;
    name: string;
    [key: string]: unknown; // Allow additional properties
}

export interface RawAdobeProject {
    id: string;
    name: string;
    title?: string;
    description?: string;
    type?: string;
    org_id?: number;
    [key: string]: unknown; // Allow additional properties
}

export interface RawAdobeWorkspace {
    id: string;
    name: string;
    title?: string;
    [key: string]: unknown; // Allow additional properties
}

/**
 * Error type for Adobe CLI command errors
 */
export interface AdobeCLIError extends Error {
    code?: number;
    stdout?: string;
    stderr?: string;
}

/**
 * Response from 'aio console where' command
 * Structure varies - can have org/project/workspace as strings or objects
 */
export interface AdobeConsoleWhereResponse {
    org?: string | { id: string; code: string; name: string; [key: string]: unknown };
    project?: string | { id: string; name: string; title?: string; description?: string; type?: string; org_id?: number; [key: string]: unknown };
    workspace?: string | { id: string; name: string; title?: string; [key: string]: unknown };
    [key: string]: unknown;
}

/**
 * Adobe Console SDK Response Types
 * These represent SDK method return types
 */
export interface SDKResponse<T> {
    body: T;
    [key: string]: unknown;
}
