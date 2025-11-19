/**
 * Shared Test Utilities for Domain Type Guards
 *
 * Common test data factories and helpers for domain type guard testing.
 */

import {
    Project,
    ComponentInstance,
    ProcessInfo,
    ComponentStatus,
    ProjectStatus
} from '@/types/base';
import { MessageResponse } from '@/types/messages';
import { Logger } from '@/types/logger';
import { ValidationResult } from '@/types/typeGuards';

// =================================================================
// Factory Functions
// =================================================================

export function createValidProject(overrides?: Partial<Project>): Project {
    return {
        name: 'test-project',
        path: '/path/to/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        ...overrides
    };
}

export function createValidComponentInstance(overrides?: Partial<ComponentInstance>): ComponentInstance {
    return {
        id: 'comp-123',
        name: 'Component Name',
        status: 'ready',
        ...overrides
    };
}

export function createValidProcessInfo(overrides?: Partial<ProcessInfo>): ProcessInfo {
    return {
        pid: 12345,
        port: 3000,
        startTime: new Date(),
        command: 'npm start',
        status: 'running',
        ...overrides
    };
}

export function createValidValidationResult(overrides?: Partial<ValidationResult>): ValidationResult {
    return {
        valid: true,
        errors: [],
        warnings: [],
        ...overrides
    };
}

export function createValidMessageResponse(overrides?: Partial<MessageResponse>): MessageResponse {
    return {
        success: true,
        ...overrides
    };
}

export function createValidLogger(overrides?: Partial<Logger>): Logger {
    return {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        ...overrides
    };
}

// =================================================================
// Test Data Constants
// =================================================================

export const VALID_COMPONENT_STATUSES: ComponentStatus[] = [
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
    'error'
];

export const VALID_PROJECT_STATUSES: ProjectStatus[] = [
    'created',
    'configuring',
    'ready',
    'starting',
    'running',
    'stopping',
    'stopped',
    'error'
];

export const INVALID_STATUS_STRINGS = [
    'invalid',
    'unknown',
    'RUNNING', // Case sensitive
    ''
];

export const NON_OBJECT_VALUES = [
    null,
    undefined,
    'string',
    123,
    []
];

export const NON_STRING_VALUES = [
    null,
    undefined,
    123,
    {},
    []
];
