import { ResetAllCommand } from '@/core/commands/ResetAllCommand';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';

// Mock dependencies
jest.mock('vscode');
jest.mock('@/core/di');
jest.mock('fs/promises');

describe('ResetAllCommand - Adobe CLI cleanup', () => {
    let command: ResetAllCommand;
    let mockContext: any;
    let mockStateManager: any;
    let mockLogger: any;
    let mockStatusBar: any;
    let mockAuthService: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock AuthenticationService
        mockAuthService = {
            logout: jest.fn().mockResolvedValue(undefined),
        };

        // Mock ServiceLocator
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

        // Mock fs/promises for path validation
        const fs = require('fs/promises');
        fs.lstat = jest.fn().mockResolvedValue({
            isSymbolicLink: () => false,
            isDirectory: () => true,
            isFile: () => false,
        });
        fs.rm = jest.fn().mockResolvedValue(undefined);

        // Create command instance
        command = new ResetAllCommand(mockContext, mockStateManager, mockStatusBar, mockLogger);
    });

    describe('Adobe CLI logout integration', () => {
        it('should call logout during reset', async () => {
            await command.execute();

            expect(ServiceLocator.getAuthenticationService).toHaveBeenCalledTimes(1);
            expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
        });

        it('should continue reset when logout fails', async () => {
            mockAuthService.logout.mockRejectedValue(new Error('Adobe CLI error'));

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });

        it('should log warning with manual command on logout failure', async () => {
            mockAuthService.logout.mockRejectedValue(new Error('Adobe CLI error'));

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('aio auth logout')
            );
        });

        it('should call logout after webview cleanup', async () => {
            const callOrder: string[] = [];

            // Track call order
            jest.spyOn(vscode.commands, 'executeCommand').mockImplementation(async (cmd: string) => {
                if (cmd === 'demoBuilder.stopDemo') {
                    callOrder.push('stopDemo');
                }
                if (cmd === 'workbench.action.reloadWindow') {
                    callOrder.push('reloadWindow');
                }
            });

            mockAuthService.logout.mockImplementation(() => {
                callOrder.push('logout');
                return Promise.resolve();
            });

            mockStateManager.clearAll.mockImplementation(() => {
                callOrder.push('clearState');
                return Promise.resolve();
            });

            await command.execute();

            // Logout should happen after stopDemo (step 1) and after clearState (steps 4-5)
            const stopDemoIndex = callOrder.indexOf('stopDemo');
            const logoutIndex = callOrder.indexOf('logout');
            const clearStateIndex = callOrder.indexOf('clearState');

            expect(stopDemoIndex).toBeLessThan(logoutIndex);
            expect(clearStateIndex).toBeLessThan(logoutIndex);
        });

        it('should call logout before file deletion', async () => {
            const callOrder: string[] = [];

            mockAuthService.logout.mockImplementation(() => {
                callOrder.push('logout');
                return Promise.resolve();
            });

            // Track status bar reset (step 7, after logout)
            mockStatusBar.reset.mockImplementation(() => {
                callOrder.push('statusBarReset');
            });

            const fs = require('fs/promises');
            fs.rm = jest.fn().mockImplementation(() => {
                callOrder.push('fileDelete');
                return Promise.resolve();
            });

            await command.execute();

            const logoutIndex = callOrder.indexOf('logout');
            const fileDeleteIndex = callOrder.indexOf('fileDelete');

            // Logout (step 6) should happen before file deletion (step 8)
            expect(logoutIndex).toBeLessThan(fileDeleteIndex);
        });

        it('should handle ServiceLocator error gracefully', async () => {
            (ServiceLocator.getAuthenticationService as jest.Mock).mockImplementation(() => {
                throw new Error('ServiceLocator error');
            });

            await command.execute();

            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Adobe CLI logout failed'),
                expect.any(Error)
            );
            expect(mockStateManager.clearAll).toHaveBeenCalled();
        });
    });
});
