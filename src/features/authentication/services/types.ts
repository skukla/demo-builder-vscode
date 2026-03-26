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
 *
 * Per the API spec, each credential has a top-level `apiKey` (client ID)
 * and typed sub-objects (`jwt`, `oauth_server_to_server`, `oauth2`)
 * that contain credential-specific details including their own `client_id`.
 */
export interface RawWorkspaceCredential {
    id: string;
    name?: string;
    /** Top-level client ID / API key */
    apiKey?: string;
    /** Credential type: 'service', 'oauthweb', 'oauthandroid', 'oauthios' */
    integration_type?: string;
    /** OAuth Server-to-Server credential details (if this type) */
    oauth_server_to_server?: { client_id?: string; scopes?: string[] };
    /** JWT credential details (if this type) */
    jwt?: { client_id?: string };
    /** OAuth2 credential details (if this type) */
    oauth2?: { client_id?: string };
}

/**
 * Mapped workspace credential — contains the client_id
 * needed for ACCS REST API x-api-key header.
 */
export interface WorkspaceCredential {
    /** Client ID (used as x-api-key for ACCS) */
    clientId: string;
    /** Credential name from Adobe Console */
    name?: string;
    /** How the client ID was resolved */
    source: 'oauth_server_to_server' | 'apiKey' | 'jwt' | 'oauth2';
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

