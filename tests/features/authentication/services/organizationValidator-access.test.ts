/**
 * OrganizationValidator Access Tests
 *
 * Tests for organization access validation logic.
 * Covers validateOrganizationAccess() method including:
 * - Valid organization scenarios
 * - Invalid organization scenarios
 * - Timeout handling (fail-open)
 * - Error handling
 *
 * Strategy: Unit tests with mocked dependencies
 * Total tests: 8
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

describe('OrganizationValidator - Access Validation', () => {
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

    describe('validateOrganizationAccess()', () => {
        it('should return true for valid organization with projects', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createSuccessResult([{ id: 'proj1', name: 'Project 1' }])
            );

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
            expect(mockCommandExecutor.execute).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should return true for valid organization without projects', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('no Project found')
            );

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false for invalid organization (403)', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('403 Forbidden')
            );

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should return false for access denied error', async () => {
            mockCommandExecutor.execute.mockResolvedValue(
                createErrorResult('Access denied')
            );

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should return true on timeout (fail-open)', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Timeout'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
            expect(mockDebugLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('timed out')
            );
        });

        it('should return true on ETIMEDOUT error', async () => {
            const error = new Error('ETIMEDOUT');
            (error as any).code = 'ETIMEDOUT';
            mockCommandExecutor.execute.mockRejectedValue(error);

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false for non-timeout errors', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Network error'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should handle timed out error message', async () => {
            mockCommandExecutor.execute.mockRejectedValue(new Error('Request timed out'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });
    });
});
