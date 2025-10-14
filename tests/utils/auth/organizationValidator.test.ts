import { OrganizationValidator } from '../../../src/utils/auth/organizationValidator';
import { AuthCacheManager } from '../../../src/utils/auth/authCacheManager';
import { Logger } from '../../../src/shared/logging';
import type { CommandExecutor } from '../../../src/utils/commands/commandExecutor';
import type { CommandResult } from '../../../src/utils/commands/types';

jest.mock('../../../src/shared/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

jest.mock('../../../src/utils/logger');

describe('OrganizationValidator', () => {
    let organizationValidator: OrganizationValidator;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;
    let mockCacheManager: jest.Mocked<AuthCacheManager>;
    let mockLogger: jest.Mocked<Logger>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCommandExecutor = {
            executeAdobeCLI: jest.fn()
        } as any;

        mockCacheManager = {
            setCachedConsoleWhere: jest.fn(),
            getValidationCache: jest.fn(),
            setValidationCache: jest.fn(),
            clearAll: jest.fn(),
            clearConsoleWhereCache: jest.fn(),
            setOrgClearedDueToValidation: jest.fn()
        } as any;

        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        } as any;

        organizationValidator = new OrganizationValidator(
            mockCommandExecutor,
            mockCacheManager,
            mockLogger
        );
    });

    describe('validateOrganizationAccess', () => {
        it('should return true when project list succeeds', async () => {
            const mockResult: CommandResult = {
                code: 0,
                stdout: '[]',
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue(mockResult);

            const result = await organizationValidator.validateOrganizationAccess();

            expect(result).toBe(true);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio console project list --json',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should return true when org has no projects', async () => {
            const mockResult: CommandResult = {
                code: 1,
                stdout: '',
                stderr: 'no Project found',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue(mockResult);

            const result = await organizationValidator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false on access denied', async () => {
            const mockResult: CommandResult = {
                code: 1,
                stdout: '',
                stderr: '403 Forbidden',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue(mockResult);

            const result = await organizationValidator.validateOrganizationAccess();

            expect(result).toBe(false);
        });

        it('should return true on timeout (fail-open)', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(
                Object.assign(new Error('ETIMEDOUT'), { code: 'ETIMEDOUT' })
            );

            const result = await organizationValidator.validateOrganizationAccess();

            expect(result).toBe(true);
        });

        it('should return false on other errors', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(
                new Error('Network error')
            );

            const result = await organizationValidator.validateOrganizationAccess();

            expect(result).toBe(false);
        });
    });

    describe('validateAndClearInvalidOrgContext', () => {
        it('should use cached validation result when available', async () => {
            const mockWhereResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({ org: 'test-org' }),
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue(mockWhereResult);
            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'test-org',
                isValid: true,
                expiry: Date.now() + 180000
            });

            await organizationValidator.validateAndClearInvalidOrgContext();

            expect(mockLogger.info).not.toHaveBeenCalled();
        });

        it('should validate and clear when org is invalid', async () => {
            const mockWhereResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({ org: 'test-org' }),
                stderr: '',
                duration: 100
            };

            const mockProjectListResult: CommandResult = {
                code: 1,
                stdout: '',
                stderr: '403 Forbidden',
                duration: 100
            };

            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce(mockWhereResult)
                .mockResolvedValue(mockProjectListResult);

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await organizationValidator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.clearAll).toHaveBeenCalled();
            expect(mockCacheManager.setOrgClearedDueToValidation).toHaveBeenCalledWith(true);
        });

        it('should retry validation once on first failure', async () => {
            const mockWhereResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({ org: 'test-org' }),
                stderr: '',
                duration: 100
            };

            const mockProjectListFail: CommandResult = {
                code: 1,
                stdout: '',
                stderr: '403 Forbidden',
                duration: 100
            };

            const mockProjectListSuccess: CommandResult = {
                code: 0,
                stdout: '[]',
                stderr: '',
                duration: 100
            };

            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce(mockWhereResult)
                .mockResolvedValueOnce(mockProjectListFail)
                .mockResolvedValueOnce(mockProjectListSuccess);

            mockCacheManager.getValidationCache.mockReturnValue(undefined);

            await organizationValidator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.setValidationCache).toHaveBeenCalledWith('test-org', true);
            expect(mockCacheManager.clearAll).not.toHaveBeenCalled();
        });

        it('should not validate if no org context exists', async () => {
            const mockWhereResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({}),
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue(mockWhereResult);

            await organizationValidator.validateAndClearInvalidOrgContext();

            expect(mockCacheManager.setValidationCache).not.toHaveBeenCalled();
        });

        it('should force validation when forceValidation is true', async () => {
            const mockWhereResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({ org: 'test-org' }),
                stderr: '',
                duration: 100
            };

            const mockProjectListResult: CommandResult = {
                code: 0,
                stdout: '[]',
                stderr: '',
                duration: 100
            };

            mockCommandExecutor.executeAdobeCLI
                .mockResolvedValueOnce(mockWhereResult)
                .mockResolvedValueOnce(mockProjectListResult);

            // Even with cached validation, should validate again
            mockCacheManager.getValidationCache.mockReturnValue({
                org: 'test-org',
                isValid: true,
                expiry: Date.now() + 180000
            });

            await organizationValidator.validateAndClearInvalidOrgContext(true);

            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Verifying access'));
        });

        it('should handle errors gracefully', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(
                new Error('Command failed')
            );

            await expect(
                organizationValidator.validateAndClearInvalidOrgContext()
            ).resolves.not.toThrow();
        });
    });
});
