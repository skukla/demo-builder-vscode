/**
 * OrganizationValidator Cache Tests
 *
 * Tests for cache management and context validation.
 * Covers validateAndClearInvalidOrgContext() method including:
 * - Cache usage and invalidation
 * - Retry logic
 * - Invalid organization clearing
 * - Error handling
 *
 * Strategy: Unit tests with mocked dependencies
 * Total tests: 15
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

describe('OrganizationValidator - Cache & Context', () => {
    let validator: OrganizationValidator;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockDebugLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mocked functions
        mockDebugLogger = createMockLogger();
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

    describe('validateAndClearInvalidOrgContext()', () => {
        it('should validate organization and keep if valid', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    createSuccessResult({ org: 'org-123' })
                )
                .mockResolvedValueOnce(
                    createSuccessResult([{ id: 'proj1' }])
                );

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalled();
            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('org-123', true);
            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully verified'));
        });

        it('should clear invalid organization after retries', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    createSuccessResult({ org: 'org-123' })
                )
                .mockResolvedValueOnce(
                    createErrorResult('403 Forbidden')
                )
                .mockResolvedValueOnce(
                    createErrorResult('403 Forbidden')
                )
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 });

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('org-123', false);
            expect(mockCacheManager.clearAll).toHaveBeenCalled();
            expect(mockCacheManager.setOrgClearedDueToValidation).toHaveBeenCalledWith(true);
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('no longer accessible'));
        });

        it('should use cached validation result', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult({ org: 'org-123' })
            );

            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'org-123',
                isValid: true,
                expiry: Date.now() + 60000
            });

            await validator.validateAndClearInvalidOrgContext();

            // Should not call project list since using cache
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(1);
            expect(mockCacheManager.setValidationCache).not.toHaveBeenCalled();
        });

        it('should clear if cached validation shows invalid', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    createSuccessResult({ org: 'org-123' })
                )
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 })
                .mockResolvedValueOnce({ stdout: '', stderr: '', code: 0, duration: 100 });

            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'org-123',
                isValid: false,
                expiry: Date.now() + 60000
            });

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.clearAll).toHaveBeenCalled();
        });

        it('should force validation when requested', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    createSuccessResult({ org: 'org-123' })
                )
                .mockResolvedValueOnce(
                    createSuccessResult([])
                );

            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'org-123',
                isValid: true,
                expiry: Date.now() + 60000
            });

            await validator.validateAndClearInvalidOrgContext(true);

            // Should validate despite cache
            expect(mockCommandExecutor.execute).toHaveBeenCalledTimes(2);
        });

        it('should handle missing console.where gracefully', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult({})
            );

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });

        it('should handle invalid JSON response', async () => {
            mockCommandExecutor.execute.mockResolvedValue({
                stdout: 'not valid json',
                stderr: '',
                code: 0,
                duration: 100
            });

            (parseJSON as jest.Mock).mockReturnValue(null);

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });

        it('should handle validation errors gracefully', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            await validator.validateAndClearInvalidOrgContext();

            // Should not throw, just log debug message
            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Failed to validate'),
                expect.anything()
            );
        });

        it('should retry validation on first failure', async () => {
            mockCommandExecutor.execute
                .mockResolvedValueOnce(
                    createSuccessResult({ org: 'org-123' })
                )
                .mockResolvedValueOnce(
                    createErrorResult('403 Forbidden')
                )
                .mockResolvedValueOnce(
                    createSuccessResult([{ id: 'proj1' }])
                );

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await validator.validateAndClearInvalidOrgContext();

            // First validation fails, second succeeds
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Retrying'));
            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('org-123', true);
            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });
    });
});
