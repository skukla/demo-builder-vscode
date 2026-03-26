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
/**
 * Raw credential from Adobe Console SDK getCredentials() response.
 *
 * Actual response fields (verified via logging):
 * - `client_id` — the API key / client ID (top-level, always present)
 * - `flow_type` — e.g. 'adobeid', 'oauth_server_to_server'
 * - `integration_type` — e.g. 'apikey', 'oauth_server_to_server'
 * - `id_integration` — integration ID
 * - `integration_name` — credential name
 *
 * Note: The API spec documents `apiKey` and sub-objects (`oauth_server_to_server`,
 * `jwt`, `oauth2`) but the actual SDK response uses flat `client_id` + `flow_type`.
 */
export interface RawWorkspaceCredential {
    /** Client ID / API key — always present on credentials */
    client_id?: string;
    /** Flow type: 'adobeid', 'oauth_server_to_server', etc. */
    flow_type?: string;
    /** Integration type: 'apikey', 'oauth_server_to_server', etc. */
    integration_type?: string;
    /** Integration ID */
    id_integration?: string;
    /** Credential name */
    integration_name?: string;
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

