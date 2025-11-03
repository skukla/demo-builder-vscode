import { TokenManager } from '@/features/authentication/services/tokenManager';
import { CommandExecutor } from '@/core/shell/commandExecutor';
import type { CommandResult } from '@/core/shell/types';

// Mock the command executor
jest.mock('../../../src/core/shell/commandExecutor');
jest.mock('@/core/logging/debugLogger', () => ({
    getLogger: () => ({
        error: jest.fn(),
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn()
    })
}));

describe('TokenManager', () => {
    let tokenManager: TokenManager;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockCommandExecutor = new CommandExecutor() as jest.Mocked<CommandExecutor>;
        tokenManager = new TokenManager(mockCommandExecutor);
    });

    describe('getAccessToken', () => {
        it('should return valid token when command succeeds', async () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const mockResult: CommandResult = {
                code: 0,
                stdout: JSON.stringify({ token: validToken, expiry: Date.now() + 3600000 }),
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const token = await tokenManager.getAccessToken();

            expect(token).toBe(validToken);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio config get ims.contexts.cli.access_token --json',
                expect.objectContaining({ encoding: 'utf8' })
            );
        });

        it('should return undefined when command fails', async () => {
            const mockResult: CommandResult = {
                code: 1,
                stdout: '',
                stderr: 'Error',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const token = await tokenManager.getAccessToken();

            expect(token).toBeUndefined();
        });

        it('should filter out fnm messages from token output', async () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const tokenData = JSON.stringify({ token: validToken, expiry: Date.now() + 3600000 });
            const mockResult: CommandResult = {
                code: 0,
                stdout: `Using Node v20.11.0\n${tokenData}\n`,
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const token = await tokenManager.getAccessToken();

            expect(token).toBe(validToken);
        });

        it('should return undefined for invalid tokens', async () => {
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'short-token',
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const token = await tokenManager.getAccessToken();

            expect(token).toBeUndefined();
        });

        it('should handle exceptions gracefully', async () => {
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockRejectedValue(new Error('Command failed'));

            const token = await tokenManager.getAccessToken();

            expect(token).toBeUndefined();
        });
    });

    describe('getTokenExpiry', () => {
        it('should return expiry timestamp when valid', async () => {
            const expiry = Date.now() + 7200000; // 2 hours from now
            const mockResult: CommandResult = {
                code: 0,
                stdout: expiry.toString(),
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBe(expiry);
        });

        it('should return undefined when command fails', async () => {
            const mockResult: CommandResult = {
                code: 1,
                stdout: '',
                stderr: 'Error',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBeUndefined();
        });

        it('should filter out fnm messages from expiry output', async () => {
            const expiry = Date.now() + 7200000;
            const mockResult: CommandResult = {
                code: 0,
                stdout: `Using Node v20.11.0\n${expiry}\n`,
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBe(expiry);
        });

        it('should return undefined for invalid expiry values', async () => {
            const mockResult: CommandResult = {
                code: 0,
                stdout: 'not-a-number',
                stderr: '',
                duration: 100
            };
            mockCommandExecutor.executeAdobeCLI = jest.fn().mockResolvedValue(mockResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBeUndefined();
        });
    });

    describe('isTokenValid', () => {
        it('should return true for valid unexpired token', async () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const futureExpiry = Date.now() + 7200000;

            mockCommandExecutor.executeAdobeCLI = jest.fn()
                .mockResolvedValue({
                    code: 0,
                    stdout: JSON.stringify({ token: validToken, expiry: futureExpiry }),
                    stderr: '',
                    duration: 100
                });

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(true);
        });

        it('should return false for expired token', async () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            const pastExpiry = Date.now() - 3600000;

            mockCommandExecutor.executeAdobeCLI = jest.fn()
                .mockResolvedValueOnce({ code: 0, stdout: validToken, stderr: '', duration: 100 })
                .mockResolvedValueOnce({ code: 0, stdout: pastExpiry.toString(), stderr: '', duration: 100 });

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(false);
        });

        it('should return false when no token exists', async () => {
            mockCommandExecutor.executeAdobeCLI = jest.fn()
                .mockResolvedValueOnce({ code: 1, stdout: '', stderr: '', duration: 100 });

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(false);
        });

        it('should return true when token exists but no expiry info', async () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

            mockCommandExecutor.executeAdobeCLI = jest.fn()
                .mockResolvedValue({
                    code: 0,
                    stdout: JSON.stringify({ token: validToken, expiry: Date.now() + 3600000 }),
                    stderr: '',
                    duration: 100
                });

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(true);
        });
    });
});
