/**
 * GitHub Service Types
 *
 * TypeScript interfaces for GitHub OAuth, token management,
 * repository operations, and file operations.
 */

/**
 * GitHub OAuth token with metadata
 */
export interface GitHubToken {
    /** The access token string */
    token: string;
    /** Token type (usually 'bearer') */
    tokenType: string;
    /** Granted OAuth scopes */
    scopes: string[];
}

/**
 * Result of token validation
 */
export interface GitHubTokenValidation {
    /** Whether the token is valid */
    valid: boolean;
    /** Scopes the token has */
    scopes?: string[];
    /** Required scopes that are missing */
    missingScopes?: string[];
    /** Authenticated user info (if valid) */
    user?: GitHubUser;
}

/**
 * GitHub user information
 */
export interface GitHubUser {
    /** GitHub username */
    login: string;
    /** User's email address */
    email: string | null;
    /** User's display name */
    name: string | null;
    /** URL to user's avatar image */
    avatarUrl: string | null;
}

/**
 * GitHub repository information
 */
export interface GitHubRepo {
    /** Repository ID */
    id: number;
    /** Repository name (without owner) */
    name: string;
    /** Full repository name (owner/repo) */
    fullName: string;
    /** GitHub web URL */
    htmlUrl: string;
    /** Git clone URL */
    cloneUrl: string;
    /** Default branch name */
    defaultBranch: string;
    /** Repository description (optional, for listing) */
    description?: string | null;
    /** Last updated timestamp (optional, for listing) */
    updatedAt?: string;
    /** Whether repository is private (optional, for listing) */
    isPrivate?: boolean;
}

/**
 * GitHub file content (from contents API)
 */
export interface GitHubFileContent {
    /** Decoded file content */
    content: string;
    /** SHA of the file (for updates) */
    sha: string;
    /** File path in repository */
    path: string;
    /** Content encoding (usually 'base64') */
    encoding: string;
}

/**
 * Result of file create/update operation
 */
export interface GitHubFileResult {
    /** SHA of the created/updated file */
    sha: string;
    /** SHA of the commit */
    commitSha: string;
}

/**
 * OAuth callback parameters
 */
export interface OAuthCallbackParams {
    /** Authorization code from GitHub */
    code: string;
    /** State parameter for CSRF protection */
    state: string;
}

/**
 * Required OAuth scopes for EDS operations
 *
 * - repo: Full control of private repositories (create, clone, push)
 * - user:email: Access user email addresses
 * - delete_repo: Delete repositories (required for repurpose/overwrite flow)
 */
export const REQUIRED_SCOPES = ['repo', 'user:email', 'delete_repo'] as const;

/**
 * GitHub API error with status
 */
export interface GitHubApiError extends Error {
    status?: number;
    headers?: Record<string, string>;
}

// ==========================================================
// DA.live Service Types
// ==========================================================

/**
 * DA.live directory entry
 */
export interface DaLiveEntry {
    /** Entry name (filename or folder name) */
    name: string;
    /** Full path within the site */
    path: string;
    /** Entry type: 'file' or 'folder' */
    type: 'file' | 'folder';
    /** Last modified timestamp (ISO string) */
    lastModified?: string;
    /** File size in bytes (only for files) */
    size?: number;
}

/**
 * Result of creating/updating source content
 */
export interface DaLiveSourceResult {
    /** Whether operation succeeded */
    success: boolean;
    /** Path of the created/updated content */
    path: string;
    /** Error message if operation failed */
    error?: string;
}

/**
 * Result of content copy operation
 */
export interface DaLiveCopyResult {
    /** Whether all files copied successfully */
    success: boolean;
    /** List of successfully copied file paths */
    copiedFiles: string[];
    /** List of files that failed to copy */
    failedFiles: { path: string; error: string }[];
    /** Total number of files processed */
    totalFiles: number;
}

/**
 * Organization access check result
 */
export interface DaLiveOrgAccess {
    /** Whether user has access to the organization */
    hasAccess: boolean;
    /** Reason for access result */
    reason?: string;
    /** Organization name checked */
    orgName: string;
}

/**
 * Progress callback for long-running operations
 */
export type DaLiveProgressCallback = (progress: {
    /** Current file being processed */
    currentFile?: string;
    /** Number of files processed */
    processed: number;
    /** Total number of files */
    total: number;
    /** Progress percentage (0-100) */
    percentage: number;
}) => void;

/**
 * Base error class for DA.live operations
 */
export class DaLiveError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly statusCode?: number,
    ) {
        super(message);
        this.name = 'DaLiveError';
    }
}

/**
 * Authentication error for DA.live operations
 */
export class DaLiveAuthError extends DaLiveError {
    constructor(message: string) {
        super(message, 'AUTH_ERROR', 401);
        this.name = 'DaLiveAuthError';
    }
}

/**
 * Network error for DA.live operations
 */
export class DaLiveNetworkError extends DaLiveError {
    constructor(
        message: string,
        public readonly retryAfter?: number,
    ) {
        super(message, 'NETWORK_ERROR');
        this.name = 'DaLiveNetworkError';
    }
}

// ==========================================================
// EDS Project Service Types
// ==========================================================

/**
 * Setup phases for EDS project creation
 */
export type EdsSetupPhase =
    | 'github-repo'
    | 'github-clone'
    | 'helix-config'
    | 'code-sync'
    | 'dalive-content'
    | 'tools-clone'
    | 'env-config'
    | 'complete';

/** EDS component ID for registration */
export const EDS_COMPONENT_ID = 'eds-storefront';

/**
 * Configuration for EDS project setup
 */
export interface EdsProjectConfig {
    /** Project name (used for display) */
    projectName: string;
    /** Local path where project will be created */
    projectPath: string;
    /** Path where EDS component will be cloned (components/eds-storefront) */
    componentPath: string;
    /** GitHub repository name (without owner, for new repos) */
    repoName: string;
    /** DA.live organization name */
    daLiveOrg: string;
    /** DA.live site name */
    daLiveSite: string;
    /** Template repository owner (GitHub username or org) */
    templateOwner?: string;
    /** Template repository name */
    templateRepo?: string;
    /** Selected backend component ID (from stack definition) */
    backendComponentId: string;
    /** Backend environment variables (from componentConfigs) */
    backendEnvVars?: Record<string, string | number | boolean | undefined>;
    /** ACCS endpoint URL (for ACCS backend) */
    accsEndpoint?: string;
    /** API Mesh GraphQL endpoint (for PaaS backend) */
    meshEndpoint?: string;
    /** GitHub username (owner for created/existing repo) */
    githubOwner: string;
    /** Whether to make the GitHub repo private */
    isPrivate?: boolean;
    /** Whether to skip DA.live content population */
    skipContent?: boolean;
    /** Whether to skip tools cloning */
    skipTools?: boolean;
    /** Repository mode: create new or use existing */
    repoMode?: 'new' | 'existing';
    /** Existing repository full name (owner/repo format, for existing repos) */
    existingRepo?: string;
    /** Whether to reset existing repo to template (repurpose flow) */
    resetToTemplate?: boolean;
    /** Whether to reset existing DA.live site content (requires cleanup before content copy) */
    resetSiteContent?: boolean;
    /** Abort signal for cancelling the setup process */
    abortSignal?: AbortSignal;
}

/**
 * Result of EDS project setup
 */
export interface EdsProjectSetupResult {
    /** Whether setup completed successfully */
    success: boolean;
    /** GitHub repository URL */
    repoUrl?: string;
    /** Preview URL (main--repo--owner.aem.page) */
    previewUrl?: string;
    /** Live URL (main--repo--owner.aem.live) */
    liveUrl?: string;
    /** Error message if setup failed */
    error?: string;
    /** Phase where failure occurred */
    phase?: EdsSetupPhase;
}

/**
 * Progress callback for EDS project setup
 */
export type EdsProgressCallback = (
    phase: EdsSetupPhase,
    progress: number,
    message: string,
) => void;

/**
 * Sub-progress callback for individual phase operations
 * Used to report granular progress during long-running operations
 * like verification and polling.
 */
export type PhaseProgressCallback = (message: string) => void;

/**
 * Result of Helix 5 configuration
 */
export interface HelixConfigResult {
    /** Whether configuration succeeded */
    success: boolean;
    /** Preview URL for the site */
    previewUrl?: string;
    /** Live URL for the site */
    liveUrl?: string;
    /** Error message if configuration failed */
    error?: string;
}

/**
 * Code bus synchronization status
 */
export interface CodeSyncStatus {
    /** Whether code is synced */
    synced: boolean;
    /** Number of polling attempts made */
    attempts: number;
    /** Maximum polling attempts allowed */
    maxAttempts: number;
}

/**
 * Error class for EDS project operations
 */
export class EdsProjectError extends Error {
    constructor(
        message: string,
        public readonly phase: EdsSetupPhase,
        public readonly cause?: Error,
    ) {
        super(message);
        this.name = 'EdsProjectError';
    }
}

/**
 * Error thrown when the AEM Code Sync GitHub app is not installed on a repository.
 *
 * This error contains the installation URL so the executor can pause and prompt
 * the user to install the app before retrying.
 */
export class GitHubAppNotInstalledError extends EdsProjectError {
    constructor(
        public readonly owner: string,
        public readonly repo: string,
        public readonly installUrl: string,
    ) {
        super(
            'GitHub App not installed. Code sync requires the AEM Code Sync app.',
            'code-sync',
        );
        this.name = 'GitHubAppNotInstalledError';
    }
}

// ==========================================================
// Tool Manager Types
// ==========================================================

/**
 * ACO (Adobe Commerce Optimizer) configuration for tool .env file
 */
export interface ACOConfig {
    /** ACO API URL */
    apiUrl: string;
    /** ACO API Key for authentication */
    apiKey: string;
    /** ACO Tenant ID */
    tenantId: string;
    /** ACO Environment ID */
    environmentId: string;
}

/**
 * Result of tool script execution
 */
export interface ToolExecutionResult {
    /** Whether the execution succeeded (exit code 0) */
    success: boolean;
    /** Standard output from the command */
    stdout: string;
    /** Standard error output from the command */
    stderr: string;
    /** Error message if execution failed */
    error?: string;
    /** Execution duration in milliseconds */
    duration: number;
}

/**
 * Options for tool installation
 */
export interface ToolInstallOptions {
    /** Force reinstall even if tool exists (default: false) */
    forceReinstall?: boolean;
}

/**
 * Options for tool script execution
 */
export interface ToolExecutionOptions {
    /** Callback for streaming output */
    onOutput?: (data: string) => void;
    /** Execution timeout in milliseconds */
    timeout?: number;
    /** Whether to run in dry run mode (for cleanup operations) */
    dryRun?: boolean;
}

/**
 * Error class for Tool Manager operations
 */
export class ToolManagerError extends Error {
    constructor(
        message: string,
        public readonly operation: 'clone' | 'install' | 'configure' | 'execute',
        public readonly cause?: Error,
    ) {
        super(message);
        this.name = 'ToolManagerError';
    }
}

// ==========================================================
// EDS Error Formatting Types
// ==========================================================

/**
 * Structured error for EDS operations with user-friendly messaging
 *
 * Provides both technical details for debugging and user-friendly
 * messages for display in the UI.
 */
export interface EdsError {
    /** Error code for programmatic handling (e.g., 'REPO_EXISTS', 'RATE_LIMITED') */
    code: string;
    /** Technical error message for logging */
    message: string;
    /** User-friendly message suitable for display in UI (no technical jargon) */
    userMessage: string;
    /** Optional hint for how to recover from this error */
    recoveryHint?: string;
    /** Optional technical details for debugging */
    technicalDetails?: string;
}

/**
 * Partial state tracking for EDS project setup
 *
 * Captures what resources have been created during setup,
 * enabling resume/rollback after partial failures.
 */
export interface EdsPartialState {
    /** Whether GitHub repository was created */
    repoCreated?: boolean;
    /** URL of created GitHub repository (for cleanup) */
    repoUrl?: string;
    /** Whether DA.live content was copied */
    contentCopied?: boolean;
    /** List of files that failed to copy */
    failedFiles?: string[];
    /** Current/failed phase for resumption */
    phase: EdsSetupPhase;
}

/**
 * Error codes for GitHub operations
 */
export type GitHubErrorCode =
    | 'OAUTH_CANCELLED'
    | 'REPO_EXISTS'
    | 'AUTH_EXPIRED'
    | 'RATE_LIMITED'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';

/**
 * Error codes for DA.live operations
 */
export type DaLiveErrorCode =
    | 'ACCESS_DENIED'
    | 'NETWORK_ERROR'
    | 'TIMEOUT'
    | 'NOT_FOUND'
    | 'UNKNOWN';

/**
 * Error codes for Helix operations
 */
export type HelixErrorCode =
    | 'SERVICE_UNAVAILABLE'
    | 'SYNC_TIMEOUT'
    | 'CONFIG_FAILED'
    | 'NETWORK_ERROR'
    | 'UNKNOWN';

// ==========================================================
// EDS Cleanup Types
// ==========================================================

/**
 * EDS project metadata stored in project manifest for cleanup operations.
 * Captures all external resources created during EDS project setup.
 */
export interface EdsMetadata {
    /** GitHub repository full name (owner/repo) */
    githubRepo?: string;
    /** DA.live organization name */
    daLiveOrg?: string;
    /** DA.live site name */
    daLiveSite?: string;
    /** Helix site URL for unpublishing */
    helixSiteUrl?: string;
    /** ISO timestamp of last publish */
    lastPublished?: string;
    /** Backend type for data cleanup */
    backendType?: 'commerce' | 'aco';
    /** Brand ID for backend data */
    brandId?: string;
}

/**
 * Options for EDS cleanup operations
 */
export interface EdsCleanupOptions {
    /** Clean up backend data (Commerce/ACO) via commerce-demo-ingestion tool */
    cleanupBackendData?: boolean;
    /** Delete GitHub repository */
    deleteGitHub?: boolean;
    /** Archive repository instead of deleting (safer, default: true) */
    archiveInsteadOfDelete?: boolean;
    /** Delete DA.live site content */
    deleteDaLive?: boolean;
    /** Unpublish from Helix (live and preview) */
    unpublishHelix?: boolean;
}

/**
 * Result of a single cleanup operation
 */
export interface CleanupOperationResult {
    /** Whether the operation succeeded */
    success: boolean;
    /** Whether the operation was skipped (e.g., missing metadata) */
    skipped: boolean;
    /** Error message if operation failed */
    error?: string;
}

/**
 * Comprehensive result of EDS cleanup operations
 */
export interface EdsCleanupResult {
    /** Backend data cleanup result */
    backendData: CleanupOperationResult;
    /** Helix unpublish result */
    helix: CleanupOperationResult;
    /** DA.live content deletion result */
    daLive: CleanupOperationResult;
    /** GitHub repository deletion/archive result */
    github: CleanupOperationResult;
}
