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
} from '@/types/webview';

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

export interface SDKResponse<T = unknown> {
    body?: T;
    statusCode?: number;
}

/**
 * Raw credential from Adobe Console SDK getCredentials() response.
 * Each workspace may have multiple credentials (OAuth S2S, API Key, etc.)
 */
export interface RawWorkspaceCredential {
    id_integration: string;
    flow_type: string;
    integration_type: string;
    client_id?: string;
    name?: string;
}

/**
 * Mapped workspace credential — contains the OAuth S2S client_id
 * needed for ACCS REST API x-api-key header.
 */
export interface WorkspaceCredential {
    /** OAuth S2S client_id (used as x-api-key for ACCS) */
    clientId: string;
    /** Credential name from Adobe Console */
    name?: string;
    /** Integration type (e.g., 'oauth_server_to_server') */
    flowType: string;
}

export interface AdobeCLIError extends Error {
    code?: string;
    stdout?: string;
    stderr?: string;
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

