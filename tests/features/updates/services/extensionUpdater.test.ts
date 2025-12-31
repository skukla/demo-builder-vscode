/**
 * Unit tests for ExtensionUpdater
 * Tests extension update application, version validation, backup/rollback
 */

import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { ExtensionUpdater } from '@/features/updates/services/extensionUpdater';
import { Logger } from '@/core/logging';

// Mock modules
jest.mock('fs/promises');
jest.mock('vscode', () => ({
    window: {},
    commands: {},
    Uri: {},
    ProgressLocation: {
        Notification: 15,
    },
}));
jest.mock('@/core/validation');
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        AUTH: {
            BROWSER: 60000, // Browser auth flows (UPDATE_DOWNLOAD maps to AUTH.BROWSER)
        },
    },
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('ExtensionUpdater', () => {
    let updater: ExtensionUpdater;
    let mockLogger: Logger;
    let mockProgress: any;
    let mockWithProgress: jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
        } as any;

        updater = new ExtensionUpdater(mockLogger);

        // Mock progress API
        mockProgress = {
            report: jest.fn(),
        };

        mockWithProgress = jest.fn().mockImplementation(
            async (config, callback) => callback(mockProgress),
        );
        (vscode.window as any).withProgress = mockWithProgress;
        (vscode.window as any).showInformationMessage = jest.fn();
        (vscode.commands as any).executeCommand = jest.fn();
        (vscode.Uri as any).file = jest.fn((path) => ({ path }));
    });

    describe('updateExtension', () => {
        const downloadUrl = 'https://github.com/user/repo/releases/download/v1.0.0/extension.vsix';
        const newVersion = '1.0.0';

        beforeEach(() => {
            // Mock security validation
            const { validateGitHubDownloadURL } = require('@/core/validation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            // Mock fetch
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                arrayBuffer: async () => new ArrayBuffer(100),
            });

            // Mock fs.writeFile
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
            (fs.unlink as jest.Mock).mockResolvedValue(undefined);
        });

        it('should download and install extension update', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Reload Now');

            await updater.updateExtension(downloadUrl, newVersion);

            expect(mockLogger.debug).toHaveBeenCalledWith(
                `[Updates] Starting extension update to v${newVersion}`,
            );
            expect(global.fetch).toHaveBeenCalledWith(
                downloadUrl,
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.extensions.installExtension',
                expect.objectContaining({ path: expect.stringContaining('.vsix') }),
            );
        });

        it('should show progress during update', async () => {
            await updater.updateExtension(downloadUrl, newVersion);

            expect(mockWithProgress).toHaveBeenCalledWith(
                expect.objectContaining({
                    location: vscode.ProgressLocation.Notification,
                    title: `Updating Demo Builder to v${newVersion}`,
                    cancellable: false,
                }),
                expect.any(Function),
            );
            expect(mockProgress.report).toHaveBeenCalledWith({ message: 'Downloading update...' });
            expect(mockProgress.report).toHaveBeenCalledWith({ message: 'Installing...' });
        });

        it('should validate GitHub URL before downloading', async () => {
            const { validateGitHubDownloadURL } = require('@/core/validation');

            await updater.updateExtension(downloadUrl, newVersion);

            expect(validateGitHubDownloadURL).toHaveBeenCalledWith(downloadUrl);
        });

        it('should throw error if URL validation fails', async () => {
            const { validateGitHubDownloadURL } = require('@/core/validation');
            validateGitHubDownloadURL.mockImplementation(() => {
                throw new Error('Invalid URL');
            });

            await expect(updater.updateExtension(downloadUrl, newVersion)).rejects.toThrow(
                'Security check failed: Invalid URL',
            );

            expect(mockLogger.error).toHaveBeenCalledWith(
                '[Updates] Download URL validation failed',
                expect.any(Error),
            );
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it('should handle download failure', async () => {
            (global.fetch as jest.Mock).mockResolvedValue({
                ok: false,
                status: 404,
            });

            await expect(updater.updateExtension(downloadUrl, newVersion)).rejects.toThrow(
                'Download failed: HTTP 404',
            );
        });

        it('should handle network errors', async () => {
            (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

            await expect(updater.updateExtension(downloadUrl, newVersion)).rejects.toThrow(
                'Network error',
            );
        });

        it('should clean up temp file after installation', async () => {
            await updater.updateExtension(downloadUrl, newVersion);

            expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('.vsix'));
        });

        it('should ignore cleanup errors', async () => {
            (fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));

            // Should not throw
            await expect(updater.updateExtension(downloadUrl, newVersion)).resolves.not.toThrow();
        });

        it('should prompt user to reload after installation', async () => {
            await updater.updateExtension(downloadUrl, newVersion);

            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                `Demo Builder updated to v${newVersion}. Reload window to apply changes?`,
                'Reload Now',
                'Later',
            );
        });

        it('should reload window if user chooses "Reload Now"', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Reload Now');

            await updater.updateExtension(downloadUrl, newVersion);

            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'workbench.action.reloadWindow',
            );
            expect(mockLogger.debug).toHaveBeenCalledWith(
                '[Updates] Reloading window to apply extension update',
            );
        });

        it('should not reload window if user chooses "Later"', async () => {
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Later');

            await updater.updateExtension(downloadUrl, newVersion);

            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'workbench.action.reloadWindow',
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('[Updates] User chose to reload later');
        });

        it('should write VSIX to temp directory', async () => {
            await updater.updateExtension(downloadUrl, newVersion);

            expect(fs.writeFile).toHaveBeenCalledWith(
                expect.stringContaining(`demo-builder-${newVersion}.vsix`),
                expect.any(Buffer),
            );
        });

        it('should log successful installation', async () => {
            await updater.updateExtension(downloadUrl, newVersion);

            expect(mockLogger.info).toHaveBeenCalledWith('[Updates] ✓ Extension installed successfully');
        });

        it('should handle download timeout', async () => {
            // Mock fetch to simulate timeout
            (global.fetch as jest.Mock).mockImplementation(() =>
                Promise.reject(new Error('Download timeout exceeded'))
            );

            await expect(updater.updateExtension(downloadUrl, newVersion)).rejects.toThrow();
        });

        it('should handle installation command failure', async () => {
            (vscode.commands.executeCommand as jest.Mock).mockRejectedValue(
                new Error('Installation failed'),
            );

            await expect(updater.updateExtension(downloadUrl, newVersion)).rejects.toThrow(
                'Installation failed',
            );
        });
    });
});
