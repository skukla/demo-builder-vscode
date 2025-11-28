/**
 * Custom Error Classes
 *
 * Typed error classes for common error scenarios.
 * Use these instead of raw Error for better error handling.
 *
 * Benefits:
 * - Type-safe error codes (no string matching)
 * - Automatic user-friendly messages
 * - Technical details for debugging
 * - Structured error data
 *
 * Usage:
 * ```typescript
 * throw new TimeoutError('mesh deployment', 30000);
 * throw new AuthError(ErrorCode.AUTH_EXPIRED, 'Please sign in again');
 * throw new NetworkError('Failed to reach Adobe services');
 * ```
 */

import { ErrorCode, getErrorTitle, isRecoverableError } from './errorCodes';

/**
 * Base application error with structured error data
 */
export class AppError extends Error {
    /** Error code for programmatic handling */
    public readonly code: ErrorCode;

    /** User-friendly message (displayed in UI) */
    public readonly userMessage: string;

    /** Technical details (logged, not shown to user) */
    public readonly technical?: string;

    /** Whether user can retry the operation */
    public readonly recoverable: boolean;

    /** Original error that caused this error */
    public readonly cause?: Error;

    constructor(
        message: string,
        code: ErrorCode,
        options?: {
            userMessage?: string;
            technical?: string;
            recoverable?: boolean;
            cause?: Error;
        },
    ) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.userMessage = options?.userMessage || getErrorTitle(code);
        this.technical = options?.technical;
        this.recoverable = options?.recoverable ?? isRecoverableError(code);
        this.cause = options?.cause;

        // Maintains proper stack trace for where error was thrown
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    /**
     * Create AppError from unknown error
     */
    static from(error: unknown, code: ErrorCode = ErrorCode.UNKNOWN): AppError {
        if (error instanceof AppError) {
            return error;
        }

        const message = extractErrorMessage(error);

        return new AppError(message, code, {
            userMessage: message,
            cause: error instanceof Error ? error : undefined,
        });
    }
}

/**
 * Timeout error for operations that exceed time limits
 */
export class TimeoutError extends AppError {
    /** The operation that timed out */
    public readonly operation: string;

    /** The timeout duration in milliseconds */
    public readonly timeoutMs: number;

    constructor(operation: string, timeoutMs: number, options?: { cause?: Error }) {
        super(
            `${operation} timed out after ${timeoutMs}ms`,
            ErrorCode.TIMEOUT,
            {
                userMessage: `${operation} took too long. Please try again.`,
                technical: `Timeout after ${timeoutMs}ms`,
                recoverable: true,
                cause: options?.cause,
            },
        );
        this.name = 'TimeoutError';
        this.operation = operation;
        this.timeoutMs = timeoutMs;
    }
}

/**
 * Network error for connectivity issues
 */
export class NetworkError extends AppError {
    /** The URL or service that failed */
    public readonly target?: string;

    constructor(
        message: string,
        options?: {
            target?: string;
            cause?: Error;
        },
    ) {
        super(message, ErrorCode.NETWORK, {
            userMessage: "Can't reach the server. Check your internet connection and try again.",
            technical: options?.target ? `Failed to connect to ${options.target}` : undefined,
            recoverable: true,
            cause: options?.cause,
        });
        this.name = 'NetworkError';
        this.target = options?.target;
    }
}

/**
 * Authentication error for auth-related failures
 */
export class AuthError extends AppError {
    constructor(
        code: ErrorCode,
        message: string,
        options?: {
            userMessage?: string;
            technical?: string;
            cause?: Error;
        },
    ) {
        super(message, code, {
            userMessage: options?.userMessage || getErrorTitle(code),
            technical: options?.technical,
            recoverable: code === ErrorCode.AUTH_REQUIRED || code === ErrorCode.AUTH_EXPIRED,
            cause: options?.cause,
        });
        this.name = 'AuthError';
    }

    /**
     * Create an "auth required" error
     */
    static required(message = 'Authentication required'): AuthError {
        return new AuthError(ErrorCode.AUTH_REQUIRED, message, {
            userMessage: 'Please sign in to continue',
        });
    }

    /**
     * Create an "auth expired" error
     */
    static expired(message = 'Session expired'): AuthError {
        return new AuthError(ErrorCode.AUTH_EXPIRED, message, {
            userMessage: 'Your session has expired. Please sign in again.',
        });
    }

    /**
     * Create a "no App Builder access" error
     */
    static noAppBuilder(orgName?: string): AuthError {
        return new AuthError(
            ErrorCode.AUTH_NO_APP_BUILDER,
            `Organization ${orgName || 'selected'} does not have App Builder access`,
            {
                userMessage: orgName
                    ? `${orgName} doesn't have App Builder access`
                    : "This organization doesn't have App Builder access",
            },
        );
    }
}

/**
 * Validation error for invalid data or configuration
 */
export class ValidationError extends AppError {
    /** The field or property that failed validation */
    public readonly field?: string;

    /** Validation error details */
    public readonly validationErrors: string[];

    constructor(
        message: string,
        code: ErrorCode = ErrorCode.CONFIG_INVALID,
        options?: {
            field?: string;
            validationErrors?: string[];
            cause?: Error;
        },
    ) {
        super(message, code, {
            userMessage: 'Please check your input and try again.',
            technical: options?.validationErrors?.join('; '),
            recoverable: true,
            cause: options?.cause,
        });
        this.name = 'ValidationError';
        this.field = options?.field;
        this.validationErrors = options?.validationErrors || [];
    }
}

/**
 * Prerequisite error for tool installation issues
 */
export class PrerequisiteError extends AppError {
    /** The prerequisite that failed */
    public readonly prerequisiteId: string;

    /** The required version (if applicable) */
    public readonly requiredVersion?: string;

    /** The installed version (if applicable) */
    public readonly installedVersion?: string;

    constructor(
        code: ErrorCode,
        prerequisiteId: string,
        message: string,
        options?: {
            requiredVersion?: string;
            installedVersion?: string;
            userMessage?: string;
            cause?: Error;
        },
    ) {
        super(message, code, {
            userMessage: options?.userMessage || getErrorTitle(code),
            technical: options?.requiredVersion
                ? `Required: ${options.requiredVersion}, Installed: ${options.installedVersion || 'none'}`
                : undefined,
            recoverable: code === ErrorCode.PREREQ_NOT_INSTALLED,
            cause: options?.cause,
        });
        this.name = 'PrerequisiteError';
        this.prerequisiteId = prerequisiteId;
        this.requiredVersion = options?.requiredVersion;
        this.installedVersion = options?.installedVersion;
    }

    /**
     * Create a "not installed" error
     */
    static notInstalled(prereqId: string, prereqName: string): PrerequisiteError {
        return new PrerequisiteError(
            ErrorCode.PREREQ_NOT_INSTALLED,
            prereqId,
            `${prereqName} is not installed`,
            {
                userMessage: `${prereqName} is required. Click Install to set it up.`,
            },
        );
    }
}

/**
 * Mesh error for API Mesh operations
 */
export class MeshError extends AppError {
    /** The mesh operation that failed */
    public readonly operation: 'deploy' | 'verify' | 'delete' | 'check';

    constructor(
        code: ErrorCode,
        operation: 'deploy' | 'verify' | 'delete' | 'check',
        message: string,
        options?: {
            userMessage?: string;
            technical?: string;
            cause?: Error;
        },
    ) {
        super(message, code, {
            userMessage: options?.userMessage || getErrorTitle(code),
            technical: options?.technical,
            recoverable: false,
            cause: options?.cause,
        });
        this.name = 'MeshError';
        this.operation = operation;
    }
}

// ===== Type Guards =====

/**
 * Check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
}

// ===== Helper Functions =====

/**
 * Extract error message from unknown error value
 * SOP §3: Extracted nested ternary to named helper
 */
export function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error occurred';
}

/**
 * Check if error is a TimeoutError
 */
export function isTimeout(error: unknown): error is TimeoutError {
    return error instanceof TimeoutError;
}

/**
 * Check if error is a NetworkError
 */
export function isNetwork(error: unknown): error is NetworkError {
    return error instanceof NetworkError;
}

/**
 * Check if error is an AuthError
 */
export function isAuth(error: unknown): error is AuthError {
    return error instanceof AuthError;
}

/**
 * Check if error has a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
    return isAppError(error) && error.code === code;
}

/**
 * Convert unknown error to AppError, detecting common error types
 */
export function toAppError(error: unknown): AppError {
    // Already an AppError
    if (isAppError(error)) {
        return error;
    }

    // Get error message
    const message = extractErrorMessage(error);
    const lowerMessage = message.toLowerCase();

    // Detect timeout errors
    if (
        lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out') ||
        lowerMessage.includes('etimedout')
    ) {
        return new TimeoutError('Operation', 0, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Detect network errors
    if (
        lowerMessage.includes('network') ||
        lowerMessage.includes('enotfound') ||
        lowerMessage.includes('econnrefused') ||
        lowerMessage.includes('fetch failed')
    ) {
        return new NetworkError(message, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Detect auth errors
    if (
        lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('not authenticated') ||
        lowerMessage.includes('auth failed') ||
        lowerMessage.includes('auth token')
    ) {
        return new AuthError(ErrorCode.AUTH_REQUIRED, message, {
            cause: error instanceof Error ? error : undefined,
        });
    }

    // Default to generic AppError
    return AppError.from(error);
}
