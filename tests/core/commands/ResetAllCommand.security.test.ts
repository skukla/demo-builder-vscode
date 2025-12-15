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

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResetAllCommand } from '@/core/commands/ResetAllCommand';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('vscode');
jest.mock('@/core/di');
jest.mock('fs/promises');

// Mock validatePathSafety since it uses dynamic import
const mockValidatePathSafety = jest.fn();
jest.mock('@/core/validation', () => ({
    ...jest.requireActual('@/core/validation'),
    validatePathSafety: (...args: any[]) => mockValidatePathSafety(...args),
}));

describe('ResetAllCommand - Security Tests', () => {
    let command: ResetAllCommand;
    let mockContext: any;
    let mockStateManager: any;
    let mockLogger: any;
    let mockStatusBar: any;
    let mockAuthService: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock AuthenticationService
        mockAuthService = {
            logout: jest.fn().mockResolvedValue(undefined),
        };

        (ServiceLocator.getAuthenticationService as jest.Mock) = jest.fn().mockReturnValue(mockAuthService);

        // Mock VS Code context
        mockContext = {
            extensionMode: vscode.ExtensionMode.Development,
            globalState: {
                update: jest.fn().mockResolvedValue(undefined),
            },
            subscriptions: [],
        };

        // Mock StateManager
        mockStateManager = {
            clearAll: jest.fn().mockResolvedValue(undefined),
        };

        // Mock Logger (must match Logger interface: info, warn, error, debug)
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
        } as any;

        // Mock StatusBar
        mockStatusBar = {
            reset: jest.fn(),
        };

        // Mock VS Code window methods
        (vscode.window.showWarningMessage as jest.Mock) = jest
            .fn()
            .mockResolvedValue('Yes, Reset Everything');
        (vscode.window.setStatusBarMessage as jest.Mock) = jest.fn();

        // Mock VS Code commands
        (vscode.commands.executeCommand as jest.Mock) = jest.fn().mockResolvedValue(undefined);

        // Mock workspace
        (vscode.workspace.workspaceFolders as any) = [];
        (vscode.workspace.updateWorkspaceFolders as jest.Mock) = jest.fn();

        // Mock fs/promises for file operations
        const fsModule = require('fs/promises');
        fsModule.lstat = jest.fn().mockResolvedValue({
            isSymbolicLink: () => false,
            isDirectory: () => true,
            isFile: () => false,
        });
        fsModule.rm = jest.fn().mockResolvedValue(undefined);

        // Default mock for validatePathSafety - safe path
        mockValidatePathSafety.mockResolvedValue({ safe: true });

        // Create command instance
        command = new ResetAllCommand(mockContext, mockStateManager, mockStatusBar, mockLogger);
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
            const errorWithToken = new Error(
                'Adobe CLI error: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'
            );
            mockAuthService.logout.mockRejectedValue(errorWithToken);

            await command.execute();

            // Verify token was redacted in logs
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('<redacted>'),
                expect.any(Error)
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'),
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
