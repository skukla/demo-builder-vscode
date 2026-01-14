/**
 * Code Sync Error Types
 *
 * Phase 3: Enhance AEM Code Sync Verification
 *
 * Specific error types for different code sync failure modes:
 * - CodeSyncTimeoutError: Polling timed out after max attempts
 * - CodeSyncPermissionError: HTTP 403 or 401 responses
 * - CodeSyncNotFoundError: HTTP 404 - repository not on Helix
 * - CodeSyncVerificationError: Admin sync succeeded but CDN not accessible
 */

/**
 * Base error class for code sync failures.
 * Contains context information for debugging and user-friendly messaging.
 */
export class CodeSyncError extends Error {
    constructor(
        message: string,
        public readonly context: Record<string, unknown>,
    ) {
        super(message);
        this.name = 'CodeSyncError';
        // Fix prototype chain for instanceof checks
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Context for timeout errors
 */
export interface TimeoutErrorContext {
    owner: string;
    repo: string;
    attempts: number;
    durationMs?: number;
}

/**
 * Thrown when code sync polling times out after max attempts.
 *
 * This typically indicates:
 * - GitHub App is slow to process
 * - GitHub App is misconfigured
 * - Helix admin service is experiencing issues
 *
 * Recovery: Retry, or check GitHub App configuration
 */
export class CodeSyncTimeoutError extends CodeSyncError {
    constructor(message: string, context: TimeoutErrorContext) {
        super(message, context);
        this.name = 'CodeSyncTimeoutError';
    }

    get attempts(): number {
        return this.context.attempts as number;
    }

    get owner(): string {
        return this.context.owner as string;
    }

    get repo(): string {
        return this.context.repo as string;
    }
}

/**
 * Context for permission errors
 */
export interface PermissionErrorContext {
    owner: string;
    repo: string;
    statusCode: number;
}

/**
 * Thrown when code sync returns 403 (Forbidden) or 401 (Unauthorized).
 *
 * This typically indicates:
 * - GitHub App doesn't have sufficient permissions
 * - Repository access has been revoked
 * - Authentication token expired
 *
 * Recovery: Check and update GitHub App permissions
 */
export class CodeSyncPermissionError extends CodeSyncError {
    constructor(message: string, context: PermissionErrorContext) {
        super(message, context);
        this.name = 'CodeSyncPermissionError';
    }

    get statusCode(): number {
        return this.context.statusCode as number;
    }
}

/**
 * Context for not-found errors
 */
export interface NotFoundErrorContext {
    owner: string;
    repo: string;
    url: string;
}

/**
 * Thrown when repository is not found on Helix (HTTP 404).
 *
 * This typically indicates:
 * - GitHub App hasn't synced the repository yet
 * - Repository name or owner is incorrect
 * - Repository has been deleted
 *
 * Recovery: Verify GitHub App has access, wait for initial sync
 */
export class CodeSyncNotFoundError extends CodeSyncError {
    constructor(message: string, context: NotFoundErrorContext) {
        super(message, context);
        this.name = 'CodeSyncNotFoundError';
    }

    get url(): string {
        return this.context.url as string;
    }
}

/**
 * Context for verification errors
 */
export interface VerificationErrorContext {
    owner: string;
    repo: string;
    url: string;
    statusCode: number;
}

/**
 * Thrown when admin sync reports success but CDN content is not accessible.
 *
 * This typically indicates:
 * - CDN propagation delay
 * - Edge server issues
 * - Content transformation failures
 *
 * Recovery: Wait a few seconds and retry
 */
export class CodeSyncVerificationError extends CodeSyncError {
    constructor(message: string, context: VerificationErrorContext) {
        super(message, context);
        this.name = 'CodeSyncVerificationError';
    }

    get url(): string {
        return this.context.url as string;
    }

    get statusCode(): number {
        return this.context.statusCode as number;
    }
}
