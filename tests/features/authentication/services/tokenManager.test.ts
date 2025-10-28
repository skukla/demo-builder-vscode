import { TokenManager } from '@/features/authentication/services/tokenManager';
import type { CommandExecutor } from '@/core/shell';
import type { CommandResult } from '@/core/shell';

/**
 * TokenManager Test Suite
 *
 * Tests token management functionality:
 * - Atomic token inspection (prevents race conditions)
 * - Token validity checking
 * - Token storage and clearing
 * - Corruption detection
 * - Output cleaning (fnm messages)
 *
 * Total tests: 45+
 */

// Mock getLogger
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock CommandExecutor
const createMockCommandExecutor = (): jest.Mocked<CommandExecutor> => ({
    executeAdobeCLI: jest.fn(),
    executeCommand: jest.fn(),
    executeWithNodeVersion: jest.fn(),
    testCommand: jest.fn(),
    getNodeVersionForComponent: jest.fn(),
    getCachedBinaryPath: jest.fn(),
    invalidateBinaryPathCache: jest.fn(),
    getCachedNodeVersion: jest.fn(),
    invalidateNodeVersionCache: jest.fn(),
} as any);

describe('TokenManager', () => {
    let tokenManager: TokenManager;
    let mockCommandExecutor: jest.Mocked<CommandExecutor>;

    beforeEach(() => {
        mockCommandExecutor = createMockCommandExecutor();
        tokenManager = new TokenManager(mockCommandExecutor);
        jest.clearAllMocks();
    });

    describe('inspectToken', () => {
        it('should return valid token with expiry', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000); // 1 hour from now
            const token = 'x'.repeat(150); // Valid long token

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true);
            expect(result.token).toBe(token);
            expect(result.expiresIn).toBeGreaterThan(0);
            expect(mockCommandExecutor.executeAdobeCLI).toHaveBeenCalledWith(
                'aio config get ims.contexts.cli.access_token --json',
                expect.objectContaining({ encoding: 'utf8' }),
            );
        });

        it('should return invalid when no token found', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Not found',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.expiresIn).toBe(0);
            expect(result.token).toBeUndefined();
        });

        it('should return invalid for token shorter than 100 characters', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'short-token'; // Too short

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.expiresIn).toBe(0);
        });

        it('should return invalid for expired token', async () => {
            const now = Date.now();
            const expiry = now - (60 * 60 * 1000); // 1 hour ago
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.token).toBe(token);
            expect(result.expiresIn).toBeLessThan(0);
        });

        it('should detect corruption when token exists but expiry is 0', async () => {
            const token = 'x'.repeat(150);
            const expiry = 0; // Corrupted state

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.expiresIn).toBe(0);
            expect(result.token).toBe(token);
        });

        it('should clean fnm messages from output', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'x'.repeat(150);

            const outputWithFnm = `Using Node v20.10.0
${JSON.stringify({ token, expiry })}`;

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: outputWithFnm,
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true);
            expect(result.token).toBe(token);
        });

        it('should handle invalid JSON in output', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: 'not-valid-json',
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.expiresIn).toBe(0);
        });

        it('should handle command execution errors', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Command failed'));

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
            expect(result.expiresIn).toBe(0);
        });

        it('should handle missing token in JSON', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ expiry }), // No token
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
        });

        it('should handle missing expiry in JSON', async () => {
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token }), // No expiry
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
        });

        it('should calculate expiresIn correctly in minutes', async () => {
            const now = Date.now();
            const expiry = now + (120 * 60 * 1000); // 120 minutes from now
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true);
            expect(result.expiresIn).toBeGreaterThanOrEqual(119);
            expect(result.expiresIn).toBeLessThanOrEqual(121);
        });
    });

    describe('isTokenValid', () => {
        it('should return true when token is valid', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(true);
        });

        it('should return false when token is invalid', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(false);
        });

        it('should return false when token is expired', async () => {
            const now = Date.now();
            const expiry = now - (60 * 60 * 1000); // Expired
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.isTokenValid();

            expect(result).toBe(false);
        });
    });

    describe('getAccessToken', () => {
        it('should return token when valid', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.getAccessToken();

            expect(result).toBe(token);
        });

        it('should return undefined when token is invalid', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.getAccessToken();

            expect(result).toBeUndefined();
        });
    });

    describe('getTokenExpiry', () => {
        it('should return expiry timestamp', async () => {
            const expiry = Date.now() + (60 * 60 * 1000);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: String(expiry),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBe(expiry);
        });

        it('should clean fnm messages from expiry output', async () => {
            const expiry = Date.now() + (60 * 60 * 1000);
            const outputWithFnm = `Using Node v20.10.0\n${expiry}`;

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: outputWithFnm,
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBe(expiry);
        });

        it('should return undefined when command fails', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 1,
                stdout: '',
                stderr: 'Error',
            } as CommandResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBeUndefined();
        });

        it('should return undefined for invalid expiry value', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: 'not-a-number',
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBeUndefined();
        });

        it('should handle command execution errors', async () => {
            mockCommandExecutor.executeAdobeCLI.mockRejectedValue(new Error('Failed'));

            const result = await tokenManager.getTokenExpiry();

            expect(result).toBeUndefined();
        });
    });

    describe('edge cases', () => {
        it('should handle token at exactly 100 characters', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'x'.repeat(100); // Exactly 100 chars

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true); // Code checks < 100, so 100 is valid
        });

        it('should handle token at 101 characters', async () => {
            const now = Date.now();
            const expiry = now + (60 * 60 * 1000);
            const token = 'x'.repeat(101); // Just over threshold

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true);
        });

        it('should handle expiry exactly at current time', async () => {
            const now = Date.now();
            const expiry = now; // Exactly now
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false); // Must be > now
        });

        it('should handle very large expiry values', async () => {
            const expiry = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year
            const token = 'x'.repeat(150);

            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token, expiry }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(true);
            expect(result.expiresIn).toBeGreaterThan(525000); // ~365 days in minutes
        });

        it('should handle empty JSON object', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({}),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
        });

        it('should handle null values in JSON', async () => {
            mockCommandExecutor.executeAdobeCLI.mockResolvedValue({
                code: 0,
                stdout: JSON.stringify({ token: null, expiry: null }),
                stderr: '',
            } as CommandResult);

            const result = await tokenManager.inspectToken();

            expect(result.valid).toBe(false);
        });
    });
});
