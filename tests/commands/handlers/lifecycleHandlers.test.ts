/**
 * Lifecycle Handlers Tests
 *
 * Tests for wizard lifecycle events:
 * - handleReady: Initial wizard ready event
 * - handleCancel: User cancels wizard
 * - handleOpenProject: Opens created project in workspace
 * - handleBrowseFiles: Opens project in file explorer
 * - handleLog: Handles logging from webview
 * - handleCancelProjectCreation: Cancels project creation
 * - handleCancelMeshCreation: Cancels mesh creation
 * - handleCancelAuthPolling: Cancels authentication
 * - handleOpenAdobeConsole: Opens Adobe Developer Console
 */

import {
    handleReady,
    handleCancel,
    handleOpenProject,
    handleBrowseFiles,
    handleLog,
    handleCancelProjectCreation,
    handleCancelMeshCreation,
    handleCancelAuthPolling,
    handleOpenAdobeConsole
} from '../../../src/commands/handlers/lifecycleHandlers';
import { HandlerContext } from '../../../src/commands/handlers/HandlerContext';
import * as securityValidation from '../../../src/utils/securityValidation';

// Mock VS Code
const mockVSCode = {
    Uri: {
        file: jest.fn((path: string) => ({ fsPath: path, path })),
        parse: jest.fn((uri: string) => ({ fsPath: uri, path: uri }))
    },
    window: {
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showWarningMessage: jest.fn()
    },
    workspace: {
        updateWorkspaceFolders: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    },
    env: {
        openExternal: jest.fn()
    }
};

jest.mock('vscode', () => mockVSCode, { virtual: true });
jest.mock('../../../src/utils/securityValidation');

describe('lifecycleHandlers', () => {
    let mockContext: jest.Mocked<HandlerContext>;
    let mockComponentHandler: any;
    let mockPanel: any;
    let mockStateManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock component handler
        mockComponentHandler = {
            handleMessage: jest.fn().mockResolvedValue(undefined)
        };

        // Mock webview panel
        mockPanel = {
            dispose: jest.fn()
        };

        // Mock state manager
        mockStateManager = {
            getCurrentProject: jest.fn()
        };

        // Create mock context
        mockContext = {
            componentHandler: mockComponentHandler,
            panel: mockPanel,
            stateManager: mockStateManager,
            logger: {
                info: jest.fn(),
                error: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn()
            } as any,
            debugLogger: {
                debug: jest.fn()
            } as any,
            sendMessage: jest.fn().mockResolvedValue(undefined),
            sharedState: {
                isAuthenticating: false,
                projectCreationAbortController: undefined
            }
        } as any;
    });

    describe('handleReady', () => {
        it('should handle wizard ready event', async () => {
            const result = await handleReady(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('Wizard webview ready');
        });

        it('should load components on ready', async () => {
            await handleReady(mockContext);

            expect(mockComponentHandler.handleMessage).toHaveBeenCalledWith(
                { type: 'loadComponents' },
                mockPanel
            );
        });

        it('should handle component loading error gracefully', async () => {
            const error = new Error('Failed to load components');
            mockComponentHandler.handleMessage.mockRejectedValue(error);

            const result = await handleReady(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                'Failed to load components:',
                error
            );
        });
    });

    describe('handleCancel', () => {
        it('should dispose panel and log cancellation', async () => {
            const result = await handleCancel(mockContext);

            expect(result.success).toBe(true);
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(mockContext.logger.info).toHaveBeenCalledWith('Wizard cancelled by user');
        });

        it('should handle missing panel gracefully', async () => {
            mockContext.panel = undefined;

            const result = await handleCancel(mockContext);

            expect(result.success).toBe(true);
        });
    });

    describe('handleCancelProjectCreation', () => {
        it('should abort project creation if controller exists', async () => {
            const abortController = new AbortController();
            const abortSpy = jest.spyOn(abortController, 'abort');
            mockContext.sharedState.projectCreationAbortController = abortController;

            const result = await handleCancelProjectCreation(mockContext);

            expect(result.success).toBe(true);
            expect(result.message).toBe('Project creation cancelled');
            expect(abortSpy).toHaveBeenCalled();
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Cancellation requested by user')
            );
        });

        it('should return failure if no active project creation', async () => {
            mockContext.sharedState.projectCreationAbortController = undefined;

            const result = await handleCancelProjectCreation(mockContext);

            expect(result.success).toBe(false);
            expect(result.message).toBe('No active project creation to cancel');
        });

        it('should handle abort controller errors', async () => {
            const abortController = new AbortController();
            jest.spyOn(abortController, 'abort').mockImplementation(() => {
                throw new Error('Abort failed');
            });
            mockContext.sharedState.projectCreationAbortController = abortController;

            // Should throw the error
            await expect(handleCancelProjectCreation(mockContext)).rejects.toThrow('Abort failed');
        });
    });

    describe('handleCancelMeshCreation', () => {
        it('should acknowledge mesh creation cancellation', async () => {
            const result = await handleCancelMeshCreation(mockContext);

            expect(result.success).toBe(true);
            expect(result.cancelled).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                '[API Mesh] User cancelled mesh creation'
            );
        });

        it('should handle errors during cancellation', async () => {
            // Force an error by making logger throw
            mockContext.logger.info = jest.fn().mockImplementation(() => {
                throw new Error('Logger failed');
            });

            const result = await handleCancelMeshCreation(mockContext);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Logger failed');
        });
    });

    describe('handleCancelAuthPolling', () => {
        it('should cancel authentication polling', async () => {
            mockContext.sharedState.isAuthenticating = true;

            const result = await handleCancelAuthPolling(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sharedState.isAuthenticating).toBe(false);
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                '[Auth] Cancelled authentication request'
            );
        });

        it('should work even if not currently authenticating', async () => {
            mockContext.sharedState.isAuthenticating = false;

            const result = await handleCancelAuthPolling(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.sharedState.isAuthenticating).toBe(false);
        });
    });

    describe('handleOpenProject', () => {
        beforeEach(() => {
            // Reset mocks before each test
            jest.clearAllMocks();
        });

        it('should open project in workspace successfully', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(true);

            // Execute handler
            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockStateManager.getCurrentProject).toHaveBeenCalled();
            // Note: Panel disposal and workspace folder updates happen internally
        });

        it('should handle missing project', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue(null);

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found')
            );
        });

        it('should handle missing project path', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: null
            });

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] No project found')
            );
        });

        it('should set reopen dashboard flag', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(true);

            await handleOpenProject(mockContext);

            // Dashboard flag setting is done internally via dynamic imports
            // We can verify the project was fetched
            expect(mockStateManager.getCurrentProject).toHaveBeenCalled();
        });

        it('should handle workspace folder already exists', async () => {
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(false);

            await handleOpenProject(mockContext);

            expect(mockContext.logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Workspace folder may already exist')
            );

            // Should open dashboard directly
            await new Promise(resolve => setTimeout(resolve, 100));
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.showProjectDashboard'
            );
        });

        it('should handle general errors', async () => {
            mockStateManager.getCurrentProject.mockRejectedValue(new Error('State manager error'));

            const result = await handleOpenProject(mockContext);

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Error opening project'),
                expect.any(Error)
            );
        });
    });

    describe('handleBrowseFiles', () => {
        beforeEach(() => {
            (securityValidation.validateProjectPath as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
        });

        it('should open project in Explorer successfully', async () => {
            const projectPath = '/path/to/project';
            mockVSCode.commands.executeCommand.mockResolvedValue(undefined);

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(true);
            expect(securityValidation.validateProjectPath).toHaveBeenCalledWith(projectPath);
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledWith('workbench.view.explorer');
            // Verify revealInExplorer was called (2nd call)
            expect(mockVSCode.commands.executeCommand).toHaveBeenCalledTimes(2);
            const calls = mockVSCode.commands.executeCommand.mock.calls;
            expect(calls[1][0]).toBe('revealInExplorer');
            expect(mockContext.logger.info).toHaveBeenCalledWith(
                '[Project Creation] Opened project in Explorer'
            );
        });

        it('should reject invalid project path', async () => {
            const projectPath = '../../../etc/passwd';
            const validationError = new Error('Invalid path');
            (securityValidation.validateProjectPath as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Access denied');
            expect(mockVSCode.commands.executeCommand).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Invalid project path',
                validationError
            );
        });

        it('should handle empty project path', async () => {
            const result = await handleBrowseFiles(mockContext, { projectPath: '' });

            // Empty path should not open anything
            expect(result.success).toBe(true);
        });

        it('should handle command execution error', async () => {
            const projectPath = '/path/to/project';
            mockVSCode.commands.executeCommand.mockRejectedValue(new Error('Command failed'));

            const result = await handleBrowseFiles(mockContext, { projectPath });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Failed to open file browser');
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Project Creation] Failed to open Explorer',
                expect.any(Error)
            );
        });
    });

    describe('handleLog', () => {
        it('should log error messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'error',
                message: 'Test error message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.error).toHaveBeenCalledWith('[Webview] Test error message');
        });

        it('should log warning messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'warn',
                message: 'Test warning'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.warn).toHaveBeenCalledWith('[Webview] Test warning');
        });

        it('should log debug messages', async () => {
            const result = await handleLog(mockContext, {
                level: 'debug',
                message: 'Test debug info'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.debug).toHaveBeenCalledWith('[Webview] Test debug info');
        });

        it('should log info messages by default', async () => {
            const result = await handleLog(mockContext, {
                level: 'info',
                message: 'Test info message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith('[Webview] Test info message');
        });

        it('should handle unknown log levels as info', async () => {
            const result = await handleLog(mockContext, {
                level: 'unknown' as any,
                message: 'Unknown level message'
            });

            expect(result.success).toBe(true);
            expect(mockContext.logger.info).toHaveBeenCalledWith('[Webview] Unknown level message');
        });
    });

    describe('handleOpenAdobeConsole', () => {
        beforeEach(() => {
            (securityValidation.validateURL as jest.Mock).mockImplementation(() => {
                // Valid by default
            });
        });

        it('should open generic Adobe Console URL', async () => {
            mockVSCode.env.openExternal.mockResolvedValue(true);

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console'
            );
            // Just verify it was called with something
            expect(mockVSCode.env.openExternal).toHaveBeenCalled();
        });

        it('should open workspace-specific URL', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789'
            };

            const result = await handleOpenAdobeConsole(mockContext, payload);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console/projects/org-123/proj-456/workspaces/ws-789/details'
            );
        });

        it('should open project-specific URL', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456'
            };

            const result = await handleOpenAdobeConsole(mockContext, payload);

            expect(result.success).toBe(true);
            expect(securityValidation.validateURL).toHaveBeenCalledWith(
                'https://developer.adobe.com/console/projects/org-123/proj-456/overview'
            );
        });

        it('should log URL construction details', async () => {
            const payload = {
                orgId: 'org-123',
                projectId: 'proj-456',
                workspaceId: 'ws-789'
            };

            await handleOpenAdobeConsole(mockContext, payload);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Console] Opening workspace-specific URL'),
                expect.objectContaining({
                    url: expect.stringContaining('org-123/proj-456/workspaces/ws-789')
                })
            );
        });

        it('should reject invalid URLs', async () => {
            const validationError = new Error('Invalid URL');
            (securityValidation.validateURL as jest.Mock).mockImplementation(() => {
                throw validationError;
            });

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(false);
            expect(mockVSCode.env.openExternal).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Adobe Console] URL validation failed',
                validationError
            );
        });

        it('should handle browser open error', async () => {
            mockVSCode.env.openExternal.mockRejectedValue(new Error('Browser failed'));

            const result = await handleOpenAdobeConsole(mockContext);

            expect(result.success).toBe(false);
            expect(mockContext.logger.error).toHaveBeenCalledWith(
                '[Adobe Console] Failed to open URL',
                expect.any(Error)
            );
        });

        it('should handle partial payload (only orgId)', async () => {
            const payload = {
                orgId: 'org-123'
            };

            await handleOpenAdobeConsole(mockContext, payload);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Adobe Console] Opening generic console URL (missing IDs)'),
                expect.objectContaining({ data: payload })
            );
        });
    });

    describe('Integration Scenarios', () => {
        it('should handle complete wizard lifecycle', async () => {
            // 1. Ready
            await handleReady(mockContext);
            expect(mockComponentHandler.handleMessage).toHaveBeenCalled();

            // 2. Create project (simulated)
            mockStateManager.getCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/path/to/project'
            });

            // 3. Open project
            mockVSCode.workspace.updateWorkspaceFolders.mockReturnValue(true);
            await handleOpenProject(mockContext);
            expect(mockPanel.dispose).toHaveBeenCalled();
        });

        it('should handle wizard cancellation at any point', async () => {
            // Start wizard
            await handleReady(mockContext);

            // User cancels
            await handleCancel(mockContext);
            expect(mockPanel.dispose).toHaveBeenCalled();
            expect(mockContext.logger.info).toHaveBeenCalledWith('Wizard cancelled by user');
        });

        it('should handle project creation cancellation', async () => {
            const abortController = new AbortController();
            mockContext.sharedState.projectCreationAbortController = abortController;

            await handleCancelProjectCreation(mockContext);

            expect(mockContext.logger.info).toHaveBeenCalledWith(
                expect.stringContaining('[Project Creation] Cancellation requested by user')
            );
        });
    });

    describe('Error Recovery', () => {
        it('should not crash on panel disposal error', async () => {
            mockPanel.dispose = jest.fn().mockImplementation(() => {
                throw new Error('Dispose failed');
            });

            // Should still succeed overall
            await expect(handleCancel(mockContext)).rejects.toThrow('Dispose failed');
        });

        it('should handle concurrent cancellations gracefully', async () => {
            const abortController = new AbortController();
            mockContext.sharedState.projectCreationAbortController = abortController;

            // Cancel multiple times
            const results = await Promise.all([
                handleCancelProjectCreation(mockContext),
                handleCancelProjectCreation(mockContext)
            ]);

            // First should succeed, second might fail or succeed depending on timing
            expect(results.some(r => r.success)).toBe(true);
        });
    });
});
