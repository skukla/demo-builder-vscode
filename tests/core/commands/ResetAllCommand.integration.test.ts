import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { ResetAllCommand } from '@/core/commands/ResetAllCommand';
import { ServiceLocator } from '@/core/di';
import * as vscode from 'vscode';

// Mock vscode but allow real fs operations for integration testing
jest.mock('vscode');
jest.mock('@/core/di');

describe('ResetAllCommand - Integration Tests', () => {
    let command: ResetAllCommand;
    let mockContext: any;
    let mockStateManager: any;
    let mockLogger: any;
    let mockStatusBar: any;
    let mockAuthService: any;
    let testDir: string;
    let aioConfigPath: string;

    beforeEach(async () => {
        // Reset mocks
        jest.clearAllMocks();

        // Create temporary test directory
        testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reset-test-'));
        aioConfigPath = path.join(testDir, '.aio', 'config.json');

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

    afterEach(async () => {
        // Clean up test directory
        try {
            await fs.rm(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }
    });

    it('should clear Adobe token file during reset', async () => {
        // Simulate Adobe CLI token file
        await fs.mkdir(path.dirname(aioConfigPath), { recursive: true });
        await fs.writeFile(
            aioConfigPath,
            JSON.stringify({
                access_token: 'fake-token',
                refresh_token: 'fake-refresh',
            })
        );

        // Mock logout to simulate token file clearing
        mockAuthService.logout.mockImplementation(async () => {
            // Simulate Adobe CLI clearing the token file
            try {
                await fs.unlink(aioConfigPath);
            } catch {
                // File might not exist
            }
        });

        await command.execute();

        // Verify logout was called
        expect(mockAuthService.logout).toHaveBeenCalled();

        // Verify token file was cleared
        await expect(fs.access(aioConfigPath)).rejects.toThrow();
    });

    it('should complete reset even when logout fails', async () => {
        // Mock logout failure
        mockAuthService.logout.mockRejectedValue(new Error('Adobe CLI not available'));

        await command.execute();

        // Verify reset completed despite logout failure
        expect(mockStateManager.clearAll).toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Adobe CLI logout failed'),
            expect.any(Error)
        );
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('workbench.action.reloadWindow');
    });

    it('should clear Adobe console context during reset', async () => {
        // Simulate console.org and console.project in Adobe config
        await fs.mkdir(path.dirname(aioConfigPath), { recursive: true });
        await fs.writeFile(
            aioConfigPath,
            JSON.stringify({
                'console.org': 'test-org',
                'console.project': 'test-project',
                access_token: 'fake-token',
            })
        );

        // Mock logout to simulate config clearing
        mockAuthService.logout.mockImplementation(async () => {
            // Simulate Adobe CLI clearing console context
            await fs.writeFile(aioConfigPath, JSON.stringify({}));
        });

        await command.execute();

        // Verify logout was called
        expect(mockAuthService.logout).toHaveBeenCalled();

        // Verify console context was cleared
        const config = JSON.parse(await fs.readFile(aioConfigPath, 'utf-8'));
        expect(config['console.org']).toBeUndefined();
        expect(config['console.project']).toBeUndefined();
        expect(config.access_token).toBeUndefined();
    });
});
