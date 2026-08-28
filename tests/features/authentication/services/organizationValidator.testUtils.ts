import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';

/**
 * OrganizationValidator Test Utilities
 *
 * Shared mocks, factories, and utilities for organizationValidator tests.
 */

/**
 * Creates a mock CommandExecutor for tests.
 * CRITICAL: Returns a factory function to avoid closure issues.
 */
export function createMockCommandExecutor(): jest.Mocked<CommandExecutor> {
    return {
        execute: jest.fn(),
    } as any;
}

/**
 * Creates a mock AuthCacheManager for tests.
 * CRITICAL: Returns a factory function to avoid closure issues.
 */
export function createMockCacheManager(): jest.Mocked<AuthCacheManager> {
    return {
        getCachedConsoleWhere: jest.fn(),
        setCachedConsoleWhere: jest.fn(),
        getValidationCache: jest.fn(),
        setValidationCache: jest.fn(),
        // Developer-permission probe cache — default get returns undefined (cache miss).
        getCachedDeveloperPermissions: jest.fn(),
        setCachedDeveloperPermissions: jest.fn(),
        clearDeveloperPermissionsCache: jest.fn(),
        clearAll: jest.fn(),
        clearConsoleWhereCache: jest.fn(),
        setOrgClearedDueToValidation: jest.fn(),
    } as any;
}

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';

/**
 * Creates a successful command execution result.
 */
export function createSuccessResult(data: any) {
    return {
        stdout: JSON.stringify(data),
        stderr: '',
        code: 0,
        duration: 100
    };
}

/**
 * Creates an error command execution result.
 */
export function createErrorResult(stderr: string, code = 1) {
    return {
        stdout: '',
        stderr,
        code,
        duration: 100
    };
}
