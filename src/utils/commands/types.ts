import type { ExecOptions } from 'child_process';

/**
 * Shared types for command execution module
 */

/**
 * Command execution result
 */
export interface CommandResult {
    stdout: string;
    stderr: string;
    code: number | null;
    duration: number;
}

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Polling configuration
 */
export interface PollOptions {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffFactor?: number;
    timeout?: number;
    name?: string;
}

/**
 * Unified command execution options
 */
export interface ExecuteOptions extends ExecOptions {
    // Environment setup
    useNodeVersion?: string | 'auto' | null;  // Use specific Node version ('auto' for Adobe CLI detection, null to skip)
    enhancePath?: boolean;                     // Add npm global paths to PATH
    configureTelemetry?: boolean;              // Ensure Adobe CLI telemetry configured

    // Execution mode
    streaming?: boolean;                       // Stream output in real-time
    exclusive?: string;                        // Resource name for mutual exclusion

    // Retry & timeout
    retryStrategy?: RetryStrategy;             // Custom retry logic
    timeout?: number;                          // Command timeout in ms (default: 30000)

    // Output handling
    onOutput?: (data: string) => void;         // Callback for streaming output
}

/**
 * Command execution request (for queuing)
 */
export interface CommandRequest {
    command: string;
    options?: ExecOptions;
    resolve: (value: CommandResult) => void;
    reject: (error: Error) => void;
    retryCount?: number;
    resourceLock?: string;
}

/**
 * Command configuration for sequencing
 */
export interface CommandConfig {
    command: string;
    options?: ExecOptions;
    resource?: string;
    name?: string;
}
