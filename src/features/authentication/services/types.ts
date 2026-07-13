/**
 * Shared types for authentication module
 *
 * Note: Adobe entity types (Organization, Project, Workspace, AdobeContext) are defined
 * in src/core/ui/types/index.ts and re-exported here for backward compatibility.
 */

import type { CloudGrouping } from '@/types/adobeApis';

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
}

export interface RawAdobeProject {
    id: string;
    name: string;
    title: string;
    description?: string;
    type?: string; // Project type from Adobe API
    org_id?: string;
    /** Creator's IMS user id (`<GUID>@<authsrc>.e`) — present on Console list/detail responses */
    who_created?: string;
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
    project?:
        | string
        | {
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
    project?:
        | string
        | {
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

/**
 * The two ids of a workspace's OAuth Server-to-Server credential:
 * `clientId` (the `client_id` / create-response `apiKey` — used as x-api-key)
 * and `idIntegration` (the integration id the Console subscribe calls take).
 */
export interface WorkspaceS2SCredentialIds {
    clientId: string;
    idIntegration: string;
}

/**
 * An org service as returned by `getServicesForOrg` (D1 API subscriber).
 * `platformList` decides the subscribe path: `apiKey`/AdobeID (e.g. API Mesh
 * `GraphQLServiceSDK`) vs `oauth_server_to_server` (e.g. `AdobeIOManagementAPISDK`).
 */
export interface OrgServiceInfo {
    code: string;
    /** Human-readable service name (e.g. "API Mesh") — present in the SDK response. */
    name?: string;
    platformList?: string[];
    domainMandatory?: boolean;
    /**
     * Product profiles the service offers. Used for the subscribe payload
     * (`licenseConfigs: null` for the free path). NOT a reliable "requires a
     * profile" signal — the accurate signal is `enabled: false` +
     * `disabledReasons` containing `USER_MISSING_PRODUCT_PROFILES` (see
     * `apiAccessCatalog.ts`).
     */
    licenseConfigs?: unknown[];
    /** Roles the service exposes; present alongside licenseConfigs for profile-bound services. */
    roles?: unknown[];
    /**
     * Whether the service is currently usable by this org+user. `getServicesForOrg`
     * returns the whole entitled catalog (~90 rows) with disabled duplicates and
     * deprecated entries; `enabled` is the real "can self-serve subscribe" gate.
     */
    enabled?: boolean;
    /** True when Adobe must approve access first — the "Requires Adobe review" badge. */
    requiresApproval?: boolean;
    /** Reason codes when `enabled` is false (e.g. `USER_MISSING_PRODUCT_PROFILES`, `DEPRECATED`). */
    disabledReasons?: string[];
    /**
     * Product family the service belongs to (Console's "Filter by product":
     * Experience Cloud, Adobe Experience Platform, Adobe Services, …). Drives the
     * picker's "All available" product sub-headers.
     */
    cloudGrouping?: CloudGrouping;
}

/** Input to `createAdobeIdCredential` (apiKey path). `domain` mandatory for API Mesh. */
export interface AdobeIdCredentialInput {
    name: string;
    description: string;
    platform: 'apiKey';
    domain: string;
    /**
     * Extra credential names that also count as "already exists" during the
     * list-first check (e.g. a legacy fixed name to reuse instead of creating a
     * duplicate). Not sent to Adobe — stripped before the create call.
     */
    reuseNames?: string[];
}

/** A single service to subscribe. Free services use null licenseConfigs/roles. */
export interface ServiceSubscriptionInfo {
    sdkCode: string;
    licenseConfigs: unknown[] | null;
    roles: unknown[] | null;
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
