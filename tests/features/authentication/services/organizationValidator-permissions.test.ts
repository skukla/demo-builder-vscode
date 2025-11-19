/**
 * OrganizationValidator Permission Tests
 *
 * Tests for developer permission validation.
 * Covers testDeveloperPermissions() method including:
 * - Valid Developer role scenarios
 * - Permission denied scenarios
 * - Error message formatting
 * - Fail-open behavior for non-permission errors
 *
 * Strategy: Unit tests with mocked dependencies
 * Total tests: 17
 */

// Mock dependencies - MUST be before imports
jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger } from '@/core/logging';
import { getLogger } from '@/core/logging';
import { parseJSON, toError } from '@/types/typeGuards';
import {
    createMockCommandExecutor,
    createMockCacheManager,
    createMockLogger,
    createSuccessResult,
    createErrorResult
} from './organizationValidator.testUtils';

describe('OrganizationValidator - Permissions', () => {
    let validator: OrganizationValidator;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mocked functions
        const mockDebugLogger = createMockLogger();
        (getLogger as jest.Mock).mockReturnValue(mockDebugLogger);

        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        (toError as jest.Mock).mockImplementation((error) => {
            if (error instanceof Error) {
                return error;
            }
            return new Error(String(error));
        });

        mockCommandExecutor = createMockCommandExecutor();
        mockCacheManager = createMockCacheManager();
        mockLogger = createMockLogger();

        validator = new OrganizationValidator(
            mockCommandExecutor,
            mockCacheManager,
            mockLogger
        );
    });

    describe('testDeveloperPermissions()', () => {
        it('should return true for users with Developer role', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult([{ name: 'My App' }])
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio app list --json',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should return false for users without Developer role (permission error)', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Permission denied')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('Developer or System Admin role');
            expect(result.error).toContain('contact your administrator');
        });

        it('should return false for unauthorized users', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Unauthorized')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for forbidden access', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('403 Forbidden')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for access denied error', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Access denied')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for insufficient privileges', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Insufficient privileges')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return true for non-permission errors (network issues)', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Network timeout')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return false for permission exceptions', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Permission denied'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for unauthorized exceptions', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Unauthorized access'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for forbidden exceptions', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Forbidden resource'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for insufficient privileges exceptions', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Insufficient privileges to access'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return true for non-permission exceptions (fail-open)', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network failure'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
        });

        it('should provide helpful error message for missing role', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Permission error')
            );

            const result = await validator.testDeveloperPermissions();

            expect(result.error).toContain('contact your administrator');
            expect(result.error).toContain('App Builder access');
        });
    });
});
