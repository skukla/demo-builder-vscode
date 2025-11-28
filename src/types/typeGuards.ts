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

// =============================================================================
// Object Utility Functions
// =============================================================================
// These extract common inline Object.keys/values/entries patterns
// per SOP code-patterns.md §4 (Inline Object Operations)

/**
 * Check if object has any entries (type guard)
 *
 * Replaces inline: `Object.keys(obj).length > 0`
 * Acts as a type guard to narrow out null/undefined.
 *
 * @param obj - Object to check (can be undefined/null)
 * @returns true if object has at least one enumerable property
 */
export function hasEntries<T extends Record<string, unknown>>(
    obj: T | undefined | null,
): obj is T {
    if (!obj) return false;
    return Object.keys(obj).length > 0;
}

/**
 * Get count of entries in object
 *
 * Replaces inline: `Object.keys(obj).length`
 *
 * @param obj - Object to count (can be undefined/null)
 * @returns Number of enumerable properties, 0 if null/undefined
 */
export function getEntryCount(obj: Record<string, unknown> | undefined | null): number {
    if (!obj) return 0;
    return Object.keys(obj).length;
}

// =============================================================================
// Project Accessor Functions
// =============================================================================
// These extract common deep optional chain patterns from project data
// per SOP code-patterns.md §4 (Deep Optional Chaining)

/**
 * Get frontend component port from project
 *
 * Replaces inline: `project?.componentInstances?.['citisignal-nextjs']?.port`
 * SOP §4: Extracted deep optional chain to named getter
 *
 * @param project - Project to extract port from (can be undefined/null)
 * @returns Port number if available, undefined otherwise
 */
export function getProjectFrontendPort(project: Project | undefined | null): number | undefined {
    return project?.componentInstances?.['citisignal-nextjs']?.port;
}

/**
 * Get component IDs from component instances record
 *
 * Replaces inline: `Object.keys(componentInstances || {})`
 * SOP §4: Extracted inline object operation to named helper
 *
 * @param componentInstances - Component instances record (can be undefined/null)
 * @returns Array of component IDs, empty array if null/undefined
 */
export function getComponentIds(
    componentInstances: Record<string, ComponentInstance> | undefined | null,
): string[] {
    if (!componentInstances) return [];
    return Object.keys(componentInstances);
}

