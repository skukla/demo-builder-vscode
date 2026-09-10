/**
 * Security Tests for ResetAllCommand
 *
 * Tests security-critical functionality:
 * - Symlink attack prevention
 * - Error message sanitization
 * - Sensitive data redaction
 * - Path traversal prevention
 *
 * Total tests: 7
 */

import * as os from 'os';
import * as path from 'path';

import {
    ResetAllCommand,
    fs,
    mockValidatePathSafety,
    vscode,
    setupResetAllSuite,
} from './ResetAllCommand.testUtils';

describe('ResetAllCommand - Security Tests', () => {
    let command: ResetAllCommand;
    let mockContext: any;
    let mockStateManager: any;
    let mockLogger: any;
    let mockAuthService: any;

    beforeEach(() => {
        jest.clearAllMocks();
        ({
            command,
            context: mockContext,
            stateManager: mockStateManager,
            logger: mockLogger,
            authService: mockAuthService,
        } = setupResetAllSuite());
    });

    describe('Symlink Attack Prevention', () => {
        it('should detect and refuse to delete symlink directories', async () => {
            // Mock validatePathSafety to report symlink
            mockValidatePathSafety.mockResolvedValue({
                safe: false,
                reason: 'Path is a symbolic link - refusing to delete for security'
            });

            await command.execute();

            // Verify deletion was skipped (rm not called)
            const fsModule = require('fs/promises');
            expect(fsModule.rm).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Skipping directory deletion')
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('symbolic link')
            );
        });

        it('should allow deletion of regular directories', async () => {
            // Mock validatePathSafety to report safe path
            mockValidatePathSafety.mockResolvedValue({ safe: true });
            // Use the module-level fs import for consistent mock reference
            (fs.rm as jest.Mock).mockResolvedValue(undefined);

            await command.execute();

            // Verify deletion proceeded
            const expectedPath = path.join(os.homedir(), '.demo-builder');
            expect(fs.rm).toHaveBeenCalledWith(expectedPath, { recursive: true, force: true });
        });

        it('should validate path is within home directory', async () => {
            // This test verifies validatePathSafety is called with correct arguments
            mockValidatePathSafety.mockResolvedValue({ safe: true });

            await command.execute();

            // Verify validatePathSafety was called with expected arguments
            expect(mockValidatePathSafety).toHaveBeenCalledWith(
                path.join(os.homedir(), '.demo-builder'),
                os.homedir()
            );
        });
    });

    describe('Error Message Sanitization', () => {
        it('should sanitize Adobe logout error messages to prevent token leakage', async () => {
            // Assembled, not pasted: the literal this replaced was the jwt.io
            // sample complete with its real HMAC signature, which secret
            // scanners flag and cannot tell from a live credential. Deriving
            // the header from the same builder also stops the negative
            // assertion below drifting away from the fixture.
            const encode = (v: object): string =>
                Buffer.from(JSON.stringify(v)).toString('base64url');
            const jwtHeader = encode({ alg: 'HS256', typ: 'JWT' });
            const fakeToken = `${jwtHeader}.${encode({ sub: '1234567890' })}.not-a-real-signature`;
            const errorWithToken = new Error(`Adobe CLI error: ${fakeToken}`);
            mockAuthService.logout.mockRejectedValue(errorWithToken);

            await command.execute();

            // Verify token was redacted in logs
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('<redacted>'),
                expect.any(Error)
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining(jwtHeader),
                expect.any(Error)
            );
        });

        it('should sanitize file path errors to prevent information disclosure', async () => {
            const errorWithPath = new Error(
                'Failed to delete /Users/admin/.demo-builder/secret-project'
            );
            // Mock validatePathSafety to return safe (so rm is called)
            mockValidatePathSafety.mockResolvedValue({ safe: true });
            // Use module-level fs import for consistent mock reference
            (fs.rm as jest.Mock).mockRejectedValue(errorWithPath);

            await command.execute();

            // Verify error was logged with sanitized message
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Could not delete .demo-builder')
            );
        });

        it('should sanitize bearer tokens in error messages', async () => {
            const errorWithBearer = new Error(
                'API error: Authorization: Bearer abc123def456ghi789'
            );
            mockAuthService.logout.mockRejectedValue(errorWithBearer);

            await command.execute();

            // Verify bearer token was redacted
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Bearer <redacted>'),
                expect.any(Error)
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('abc123def456ghi789'),
                expect.any(Error)
            );
        });
    });

    describe('Development Mode Authorization', () => {
        it('should block reset in production mode', async () => {
            mockContext.extensionMode = vscode.ExtensionMode.Production;
            const warningStub = jest.fn();
            (vscode.window.showWarningMessage as jest.Mock) = warningStub;

            await command.execute();

            // Verify reset was blocked
            expect(warningStub).toHaveBeenCalledWith(
                expect.stringContaining('only available in development mode')
            );
            expect(mockStateManager.clearAll).not.toHaveBeenCalled();
        });

        it('should allow reset in development mode', async () => {
            mockContext.extensionMode = vscode.ExtensionMode.Development;
            (require('fs/promises').lstat as jest.Mock).mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });
            const fsModule = require('fs/promises');
            (fsModule.rm as jest.Mock).mockResolvedValue(undefined);

            await command.execute();

            // Verify reset proceeded
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });
    });
});
