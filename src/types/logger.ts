/**
 * Logger Type Definitions
 *
 * Provides type-safe interfaces for all logging systems in the Demo Builder.
 * Replaces `any` types with proper logger interfaces.
 */

/**
 * LogLevel - Standard logging levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger - Main extension logger interface
 *
 * Used throughout the extension for general logging.
 * Wraps DebugLogger for backward compatibility.
 */
export interface Logger {
    /**
     * Write trace message (very low priority, verbose)
     */
    trace(message: string, ...args: unknown[]): void;

    /**
     * Write debug message (low priority)
     */
    debug(message: string, ...args: unknown[]): void;

    /**
     * Write info message (normal priority)
     */
    info(message: string, ...args: unknown[]): void;

    /**
     * Write warning message
     */
    warn(message: string, ...args: unknown[]): void;

    /**
     * Write error message (high priority)
     */
    error(message: string, error?: Error | unknown): void;

    /**
     * Set output channel (for backward compatibility, may be no-op)
     */
    setOutputChannel?(channel: unknown): void;
}

/**
 * DebugLogger - Enhanced logger with structured logging
 *
 * Used for detailed debugging with additional context.
 * Provides structured logging with metadata.
 */
export interface DebugLogger extends Logger {
    /**
     * Write structured debug log with metadata
     */
    debugStructured(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Write structured info log with metadata
     */
    infoStructured(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Write structured warning log with metadata
     */
    warnStructured(message: string, metadata?: Record<string, unknown>): void;

    /**
     * Write structured error log with metadata
     */
    errorStructured(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void;

    /**
     * Set minimum log level
     */
    setLogLevel(level: LogLevel): void;

    /**
     * Get current log level
     */
    getLogLevel(): LogLevel;
}

/**
 * LogEntry - Structured log entry
 */
export interface LogEntry {
    timestamp: Date;
    level: LogLevel;
    message: string;
    metadata?: Record<string, unknown>;
    error?: Error;
}
