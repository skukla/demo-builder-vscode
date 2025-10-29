/**
 * Type Guards
 *
 * Provides runtime type checking functions for type-safe operations.
 * Used when receiving data from external sources (webview, JSON, CLI output).
 */

import { Logger } from './logger';
import { MessageResponse } from './messages';
import { StateValue } from './state';
import {
    Project,
    ComponentInstance,
    ProcessInfo,
    ComponentStatus,
    ProjectStatus,
} from './index';

/**
 * ValidationResult - Represents validation result
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * isProject - Type guard for Project
 */
export function isProject(value: unknown): value is Project {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return (
        typeof obj.name === 'string' &&
        typeof obj.path === 'string' &&
        typeof obj.status === 'string' &&
        obj.created instanceof Date &&
        obj.lastModified instanceof Date
    );
}

/**
 * isComponentInstance - Type guard for ComponentInstance
 */
export function isComponentInstance(value: unknown): value is ComponentInstance {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return (
        typeof obj.id === 'string' &&
        typeof obj.name === 'string' &&
        typeof obj.status === 'string'
    );
}

/**
 * isProcessInfo - Type guard for ProcessInfo
 */
export function isProcessInfo(value: unknown): value is ProcessInfo {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return (
        typeof obj.pid === 'number' &&
        typeof obj.port === 'number' &&
        typeof obj.command === 'string' &&
        typeof obj.status === 'string' &&
        obj.startTime instanceof Date
    );
}

/**
 * isComponentStatus - Type guard for ComponentStatus
 */
export function isComponentStatus(value: unknown): value is ComponentStatus {
    const validStatuses: ComponentStatus[] = [
        'not-installed',
        'cloning',
        'installing',
        'ready',
        'starting',
        'running',
        'stopping',
        'stopped',
        'deploying',
        'deployed',
        'updating',
        'error',
    ];
    return typeof value === 'string' && validStatuses.includes(value as ComponentStatus);
}

/**
 * isProjectStatus - Type guard for ProjectStatus
 */
export function isProjectStatus(value: unknown): value is ProjectStatus {
    const validStatuses: ProjectStatus[] = [
        'created',
        'configuring',
        'ready',
        'starting',
        'running',
        'stopping',
        'stopped',
        'error',
    ];
    return typeof value === 'string' && validStatuses.includes(value as ProjectStatus);
}

/**
 * isValidationResult - Type guard for ValidationResult
 */
export function isValidationResult(value: unknown): value is ValidationResult {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return (
        typeof obj.valid === 'boolean' &&
        Array.isArray(obj.errors) &&
        Array.isArray(obj.warnings)
    );
}

/**
 * isMessageResponse - Type guard for MessageResponse
 */
export function isMessageResponse(value: unknown): value is MessageResponse {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return typeof obj.success === 'boolean';
}

/**
 * isLogger - Type guard for Logger interface
 */
export function isLogger(value: unknown): value is Logger {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const obj = value as Record<string, unknown>;
    return (
        typeof obj.debug === 'function' &&
        typeof obj.info === 'function' &&
        typeof obj.warn === 'function' &&
        typeof obj.error === 'function'
    );
}

/**
 * isStateValue - Type guard for StateValue
 */
export function isStateValue(value: unknown): value is StateValue {
    if (value === null || value === undefined) {
        return true;
    }

    const type = typeof value;
    return (
        type === 'string' ||
        type === 'number' ||
        type === 'boolean' ||
        Array.isArray(value) ||
        type === 'object'
    );
}

/**
 * isRecord - Type guard for Record<string, unknown>
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * isStringArray - Type guard for string[]
 */
export function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * hasProperty - Type guard to check if object has property
 */
export function hasProperty<K extends string>(
    obj: unknown,
    key: K,
): obj is Record<K, unknown> {
    return isRecord(obj) && key in obj;
}

/**
 * assertNever - Exhaustiveness checking for discriminated unions
 *
 * @example
 * type Status = 'success' | 'error';
 * function handle(status: Status) {
 *   switch(status) {
 *     case 'success': return handleSuccess();
 *     case 'error': return handleError();
 *     default: assertNever(status); // Compile error if Status has unhandled cases
 *   }
 * }
 */
export function assertNever(value: never): never {
    throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}

/**
 * parseJSON - Safe JSON parsing with type guard
 */
export function parseJSON<T = unknown>(
    json: string,
    guard?: (value: unknown) => value is T,
): T | null {
    try {
        const parsed = JSON.parse(json); // OK: parseJSON implementation uses JSON.parse internally
        if (guard && !guard(parsed)) {
            return null;
        }
        return parsed as T;
    } catch {
        return null;
    }
}

/**
 * isError - Type guard for Error
 */
export function isError(value: unknown): value is Error {
    return value instanceof Error;
}

/**
 * toError - Convert unknown error to Error
 */
export function toError(error: unknown): Error {
    if (isError(error)) {
        return error;
    }
    if (typeof error === 'string') {
        return new Error(error);
    }
    if (isRecord(error) && typeof error.message === 'string') {
        return new Error(error.message);
    }
    return new Error('Unknown error occurred');
}

/**
 * isTimeoutError - Check if error is a timeout error
 */
export function isTimeoutError(error: unknown): boolean {
    const err = toError(error);
    const message = err.message.toLowerCase();
    return (
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('etimedout') ||
        (isRecord(error) && (error as any).code === 'ETIMEDOUT')
    );
}
