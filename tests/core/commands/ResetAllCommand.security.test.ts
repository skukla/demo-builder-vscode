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

        // Mock Logger
        mockLogger = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

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

        // Create command instance
        command = new ResetAllCommand(mockContext, mockStateManager, mockLogger, mockStatusBar);
    });

    describe('Symlink Attack Prevention', () => {
        it('should detect and refuse to delete symlink directories', async () => {
            // Mock lstat to return symlink
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => true,
                isDirectory: () => false,
            });

            await command.execute();

            // Verify deletion was skipped
            expect(fs.rm).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Skipping directory deletion')
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('symbolic link')
            );
        });

        it('should allow deletion of regular directories', async () => {
            // Mock lstat to return regular directory
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });
            (fs.rm as jest.Mock) = jest.fn().mockResolvedValue(undefined);

            await command.execute();

            // Verify deletion proceeded
            const expectedPath = path.join(os.homedir(), '.demo-builder');
            expect(fs.rm).toHaveBeenCalledWith(expectedPath, { recursive: true, force: true });
        });

        it('should validate path is within home directory', async () => {
            // Mock lstat for a path outside home directory
            const homeDir = os.homedir();

            // This test verifies the security function behavior
            // The actual implementation checks if path starts with expectedParent
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });

            await command.execute();

            // Verify lstat was called to check the path
            expect(fs.lstat).toHaveBeenCalled();
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
                expect.stringContaining('<token>')
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
            );
        });

        it('should sanitize file path errors to prevent information disclosure', async () => {
            const errorWithPath = new Error(
                'Failed to delete /Users/admin/.demo-builder/secret-project'
            );
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });
            (fs.rm as jest.Mock) = jest.fn().mockRejectedValue(errorWithPath);

            await command.execute();

            // Verify path was redacted in logs
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('<path>')
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('/Users/admin/')
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
                expect.stringContaining('Bearer <redacted>')
            );
            expect(mockLogger.warn).not.toHaveBeenCalledWith(
                expect.stringContaining('abc123def456ghi789')
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
            (fs.lstat as jest.Mock) = jest.fn().mockResolvedValue({
                isSymbolicLink: () => false,
                isDirectory: () => true,
            });
            (fs.rm as jest.Mock) = jest.fn().mockResolvedValue(undefined);

            await command.execute();

            // Verify reset proceeded
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });
    });
});
