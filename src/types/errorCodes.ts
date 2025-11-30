/**
 * Error Codes
 *
 * Enumerated error codes for programmatic error handling.
 * Use these instead of string matching on error messages.
 *
 * Categories:
 * - GENERAL: Common errors (timeout, network, unknown)
 * - AUTH: Authentication and authorization errors
 * - PREREQ: Prerequisite checking and installation errors
 * - MESH: API Mesh deployment errors
 * - COMPONENT: Component configuration errors
 * - PROJECT: Project creation and lifecycle errors
 * - CONFIG: Configuration file errors
 */

export enum ErrorCode {
    // ===== General Errors =====
    /** Unknown error - fallback when no specific code applies */
    UNKNOWN = 'UNKNOWN',
    /** Operation timed out */
    TIMEOUT = 'TIMEOUT',
    /** Network connectivity issue */
    NETWORK = 'NETWORK',
    /** Operation was cancelled by user */
    CANCELLED = 'CANCELLED',
    /** Rate limiting or throttling */
    RATE_LIMITED = 'RATE_LIMITED',

    // ===== Authentication Errors =====
    /** User not authenticated - login required */
    AUTH_REQUIRED = 'AUTH_REQUIRED',
    /** Token expired - re-authentication needed */
    AUTH_EXPIRED = 'AUTH_EXPIRED',
    /** Invalid credentials or token */
    AUTH_INVALID = 'AUTH_INVALID',
    /** User lacks required permissions */
    AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
    /** No App Builder access for this org */
    AUTH_NO_APP_BUILDER = 'AUTH_NO_APP_BUILDER',
    /** Organization validation failed */
    AUTH_ORG_INVALID = 'AUTH_ORG_INVALID',

    // ===== Prerequisite Errors =====
    /** Required tool not installed */
    PREREQ_NOT_INSTALLED = 'PREREQ_NOT_INSTALLED',
    /** Installed version doesn't meet requirements */
    PREREQ_VERSION_MISMATCH = 'PREREQ_VERSION_MISMATCH',
    /** Prerequisite check command failed */
    PREREQ_CHECK_FAILED = 'PREREQ_CHECK_FAILED',
    /** Prerequisite installation failed */
    PREREQ_INSTALL_FAILED = 'PREREQ_INSTALL_FAILED',
    /** Node version not available */
    PREREQ_NODE_VERSION_MISSING = 'PREREQ_NODE_VERSION_MISSING',

    // ===== Mesh Errors =====
    /** Mesh deployment failed */
    MESH_DEPLOY_FAILED = 'MESH_DEPLOY_FAILED',
    /** Mesh configuration invalid */
    MESH_CONFIG_INVALID = 'MESH_CONFIG_INVALID',
    /** Mesh verification failed */
    MESH_VERIFY_FAILED = 'MESH_VERIFY_FAILED',
    /** Mesh not found */
    MESH_NOT_FOUND = 'MESH_NOT_FOUND',
    /** Mesh deletion failed */
    MESH_DELETE_FAILED = 'MESH_DELETE_FAILED',

    // ===== Component Errors =====
    /** Component not found in registry */
    COMPONENT_NOT_FOUND = 'COMPONENT_NOT_FOUND',
    /** Component configuration invalid */
    COMPONENT_CONFIG_INVALID = 'COMPONENT_CONFIG_INVALID',
    /** Component installation failed */
    COMPONENT_INSTALL_FAILED = 'COMPONENT_INSTALL_FAILED',
    /** Component update failed */
    COMPONENT_UPDATE_FAILED = 'COMPONENT_UPDATE_FAILED',
    /** Component dependency missing */
    COMPONENT_DEPENDENCY_MISSING = 'COMPONENT_DEPENDENCY_MISSING',

    // ===== Project Errors =====
    /** Project not found */
    PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
    /** Project creation failed */
    PROJECT_CREATE_FAILED = 'PROJECT_CREATE_FAILED',
    /** Project directory already exists */
    PROJECT_EXISTS = 'PROJECT_EXISTS',
    /** Project validation failed */
    PROJECT_INVALID = 'PROJECT_INVALID',
    /** Project start failed */
    PROJECT_START_FAILED = 'PROJECT_START_FAILED',
    /** Project stop failed */
    PROJECT_STOP_FAILED = 'PROJECT_STOP_FAILED',

    // ===== Configuration Errors =====
    /** Configuration file not found */
    CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
    /** Configuration file parse error */
    CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',
    /** Configuration file write error */
    CONFIG_WRITE_ERROR = 'CONFIG_WRITE_ERROR',
    /** Configuration validation failed */
    CONFIG_INVALID = 'CONFIG_INVALID',
}

/**
 * Error code categories for grouping related errors
 */
export type ErrorCategory =
    | 'general'
    | 'auth'
    | 'prereq'
    | 'mesh'
    | 'component'
    | 'project'
    | 'config';

/**
 * Get the category for an error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
    if (code.startsWith('AUTH_')) return 'auth';
    if (code.startsWith('PREREQ_')) return 'prereq';
    if (code.startsWith('MESH_')) return 'mesh';
    if (code.startsWith('COMPONENT_')) return 'component';
    if (code.startsWith('PROJECT_')) return 'project';
    if (code.startsWith('CONFIG_')) return 'config';
    return 'general';
}

/**
 * Check if an error is recoverable (user can retry)
 */
export function isRecoverableError(code: ErrorCode): boolean {
    // Recoverable errors - user action can fix
    const recoverableErrors: ErrorCode[] = [
        ErrorCode.TIMEOUT,
        ErrorCode.NETWORK,
        ErrorCode.RATE_LIMITED,
        ErrorCode.AUTH_REQUIRED,
        ErrorCode.AUTH_EXPIRED,
        ErrorCode.PREREQ_NOT_INSTALLED,
        ErrorCode.PREREQ_NODE_VERSION_MISSING,
    ];

    return recoverableErrors.includes(code);
}

/**
 * Get user-friendly error title for an error code
 */
export function getErrorTitle(code: ErrorCode): string {
    const titles: Record<ErrorCode, string> = {
        // General
        [ErrorCode.UNKNOWN]: 'Something went wrong',
        [ErrorCode.TIMEOUT]: 'Operation timed out',
        [ErrorCode.NETWORK]: 'Connection problem',
        [ErrorCode.CANCELLED]: 'Operation cancelled',
        [ErrorCode.RATE_LIMITED]: 'Too many requests',

        // Auth
        [ErrorCode.AUTH_REQUIRED]: 'Sign in required',
        [ErrorCode.AUTH_EXPIRED]: 'Session expired',
        [ErrorCode.AUTH_INVALID]: 'Authentication failed',
        [ErrorCode.AUTH_FORBIDDEN]: 'Access denied',
        [ErrorCode.AUTH_NO_APP_BUILDER]: 'App Builder access required',
        [ErrorCode.AUTH_ORG_INVALID]: 'Organization unavailable',

        // Prereq
        [ErrorCode.PREREQ_NOT_INSTALLED]: 'Required tool not installed',
        [ErrorCode.PREREQ_VERSION_MISMATCH]: 'Version mismatch',
        [ErrorCode.PREREQ_CHECK_FAILED]: 'Check failed',
        [ErrorCode.PREREQ_INSTALL_FAILED]: 'Installation failed',
        [ErrorCode.PREREQ_NODE_VERSION_MISSING]: 'Node version required',

        // Mesh
        [ErrorCode.MESH_DEPLOY_FAILED]: 'Mesh deployment failed',
        [ErrorCode.MESH_CONFIG_INVALID]: 'Invalid mesh configuration',
        [ErrorCode.MESH_VERIFY_FAILED]: 'Mesh verification failed',
        [ErrorCode.MESH_NOT_FOUND]: 'Mesh not found',
        [ErrorCode.MESH_DELETE_FAILED]: 'Mesh deletion failed',

        // Component
        [ErrorCode.COMPONENT_NOT_FOUND]: 'Component not found',
        [ErrorCode.COMPONENT_CONFIG_INVALID]: 'Invalid configuration',
        [ErrorCode.COMPONENT_INSTALL_FAILED]: 'Component installation failed',
        [ErrorCode.COMPONENT_UPDATE_FAILED]: 'Component update failed',
        [ErrorCode.COMPONENT_DEPENDENCY_MISSING]: 'Missing dependency',

        // Project
        [ErrorCode.PROJECT_NOT_FOUND]: 'Project not found',
        [ErrorCode.PROJECT_CREATE_FAILED]: 'Project creation failed',
        [ErrorCode.PROJECT_EXISTS]: 'Project already exists',
        [ErrorCode.PROJECT_INVALID]: 'Invalid project',
        [ErrorCode.PROJECT_START_FAILED]: 'Failed to start project',
        [ErrorCode.PROJECT_STOP_FAILED]: 'Failed to stop project',

        // Config
        [ErrorCode.CONFIG_NOT_FOUND]: 'Configuration not found',
        [ErrorCode.CONFIG_PARSE_ERROR]: 'Configuration error',
        [ErrorCode.CONFIG_WRITE_ERROR]: 'Failed to save configuration',
        [ErrorCode.CONFIG_INVALID]: 'Invalid configuration',
    };

    return titles[code] || 'Error';
}
