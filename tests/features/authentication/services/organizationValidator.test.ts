import { OrganizationValidator } from '@/features/authentication/services/organizationValidator';
import type { CommandExecutor } from '@/core/shell';
import type { AuthCacheManager } from '@/features/authentication/services/authCacheManager';
import type { Logger } from '@/core/logging';

/**
 * OrganizationValidator Test Suite
 *
 * Unit tests for organization validation and permission checking.
 * Tests organization access validation, developer permissions, and cache management.
 *
 * Strategy: Unit tests with mocked dependencies
 *
 * Total tests: 40+
 * Target coverage: 70-80% of organizationValidator.ts
 */

// Mock dependencies
jest.mock('@/core/logging');
jest.mock('@/types/typeGuards');

import { getLogger } from '@/core/logging';
import { parseJSON, toError } from '@/types/typeGuards';

describe('OrganizationValidator', () => {
    let validator: OrganizationValidator;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;
    let mockDebugLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock debug logger
        mockDebugLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        (getLogger as jest.Mock).mockReturnValue(mockDebugLogger);

        // Mock parseJSON to return the parsed object
        (parseJSON as jest.Mock).mockImplementation((str) => {
            try {
                return JSON.parse(str);
            } catch {
                return null;
            }
        });

        // Mock toError
        (toError as jest.Mock).mockImplementation((error) => {
            if (error instanceof Error) {
                return error;
            }
            return new Error(String(error));
        });

        // Mock dependencies
        mockCommandExecutor = {
            executeAdobeCLI: jest.fn(),
        } as any;

        mockCacheManager = {
            getCachedConsoleWhere: jest.fn(),
            setCachedConsoleWhere: jest.fn(),
            getValidationCache: jest.fn(),
            setValidationCache: jest.fn(),
            clearAll: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            setOrgClearedDueToValidation: jest.fn(),
        } as any;

        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        } as any;

        validator = new OrganizationValidator(
            mockCommandExecutor,
            mockCacheManager,
            mockLogger
        );
    });

    describe('validateOrganizationAccess()', () => {
        it('should return true for valid organization with projects', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([{ id: 'proj1', name: 'Project 1' }]),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should return true for valid organization without projects', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'no Project found',
                code: 1,
                duration: 100
            });

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false for invalid organization (403)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: '403 Forbidden',
                code: 1,
                duration: 100
            });

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should return false for access denied error', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Access denied',
                code: 1,
                duration: 100
            });

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should return true on timeout (fail-open)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Timeout'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
            expect(mockDebugLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('timed out')
            );
        });

        it('should return true on ETIMEDOUT error', async () => {
            const error = new Error('ETIMEDOUT');
            (error as any).code = 'ETIMEDOUT';
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(error);

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false for non-timeout errors', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should handle timed out error message', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Request timed out'));

            const result = await validator.validateOrganizationAccess();

            expect(result).toBe(true);
        });
    });

    describe('testDeveloperPermissions()', () => {
        it('should return true for users with Developer role', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify([{ name: 'My App' }]),
                stderr: '',
                code: 0,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
            expect(result.error).toBeUndefined();
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio app list --json',
                expect.objectContaining({
                    timeout: expect.any(Number)
                })
            );
        });

        it('should return false for users without Developer role (permission error)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Permission denied',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error).toContain('Developer or System Admin role');
            expect(result.error).toContain('contact your administrator');
        });

        it('should return false for unauthorized users', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Unauthorized',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for forbidden access', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: '403 Forbidden',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for access denied error', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Access denied',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for insufficient privileges', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Insufficient privileges',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return true for non-permission errors (network issues)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Network timeout',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should return false for permission exceptions', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Permission denied'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
            expect(result.error).toContain('Developer or System Admin role');
        });

        it('should return false for unauthorized exceptions', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Unauthorized access'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for forbidden exceptions', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Forbidden resource'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return false for insufficient privileges exceptions', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Insufficient privileges to access'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(false);
        });

        it('should return true for non-permission exceptions (fail-open)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network failure'));

            const result = await validator.testDeveloperPermissions();

            expect(result.hasPermissions).toBe(true);
        });

        it('should provide helpful error message for missing role', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: '',
                stderr: 'Permission error',
                code: 1,
                duration: 100
            });

            const result = await validator.testDeveloperPermissions();

            expect(result.error).toContain('contact your administrator');
            expect(result.error).toContain('App Builder access');
        });
    });

    describe('validateAndClearInvalidOrgContext()', () => {
        it('should validate organization and keep if valid', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({ org: 'org-123' }),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: JSON.stringify([{ id: 'proj1' }]),
                    stderr: '',
                    code: 0,
                    duration: 100
                });

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.setCachedConsoleWhere).toHaveBeenCalled();
            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('org-123', true);
            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully verified'));
        });

        it('should clear invalid organization after retries', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({ org: 'org-123' }),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '403 Forbidden',
                    code: 1,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '403 Forbidden',
                    code: 1,
                    duration: 100
                })
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
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({ org: 'org-123' }),
                stderr: '',
                code: 0,
                duration: 100
            });

            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'org-123',
                isValid: true,
                expiry: Date.now() + 60000
            });

            await validator.validateAndClearInvalidOrgContext();

            // Should not call project list since using cache
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(1);
            expect(mockCacheManager.setValidationCache).not.toHaveBeenCalled();
        });

        it('should clear if cached validation shows invalid', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({ org: 'org-123' }),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
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
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({ org: 'org-123' }),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: JSON.stringify([]),
                    stderr: '',
                    code: 0,
                    duration: 100
                });

            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'org-123',
                isValid: true,
                expiry: Date.now() + 60000
            });

            await validator.validateAndClearInvalidOrgContext(true);

            // Should validate despite cache
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledTimes(2);
        });

        it('should handle missing console.where gracefully', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                stdout: JSON.stringify({}),
                stderr: '',
                code: 0,
                duration: 100
            });

            await validator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });

        it('should handle invalid JSON response', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
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
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Network error'));

            await validator.validateAndClearInvalidOrgContext();

            // Should not throw, just log debug message
            expect(mockDebugLogger.debug).toHaveBeenCalledWith(
                expect.stringContaining('Failed to validate'),
                expect.anything()
            );
        });

        it('should retry validation on first failure', async () => {
            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce({
                    stdout: JSON.stringify({ org: 'org-123' }),
                    stderr: '',
                    code: 0,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: '',
                    stderr: '403 Forbidden',
                    code: 1,
                    duration: 100
                })
                .mockResolvedValueOnce({
                    stdout: JSON.stringify([{ id: 'proj1' }]),
                    stderr: '',
                    code: 0,
                    duration: 100
                });

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await validator.validateAndClearInvalidOrgContext();

            // First validation fails, second succeeds
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Retrying'));
            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('org-123', true);
            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });
    });
});
