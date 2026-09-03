/**
 * Dashboard Handlers - Action Tests
 *
 * Tests for action handlers that delegate to commands or open external resources:
 * - handleConfigure: opens project configuration UI
 * - handleDeleteProject: triggers project deletion
 * - handleOpenBrowser: opens demo in browser
 */

import './dashboardValidatorMocks';
import * as vscode from 'vscode';
import {
    handleConfigure,
    handleDeleteProject,
    handleEditProject,
    handleOpenAdminPanel,
    handleOpenBrowser,
} from '@/features/dashboard/handlers/dashboardHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { setupMocks, createDashboardProject } from './dashboardHandlers.testUtils';
import { createMockStateManager } from '../../../helpers/stateManagerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';

import { mockWindow } from '../../../helpers/vscodeMockViews';
// Mock vscode
jest.mock(
    'vscode',
    () => ({
        commands: {
            executeCommand: jest.fn().mockResolvedValue(undefined),
        },
        window: {
            activeColorTheme: { kind: 1 },
            showInformationMessage: jest.fn().mockResolvedValue(undefined),
        },
        ColorThemeKind: { Dark: 2, Light: 1 },
        env: {
            openExternal: jest.fn().mockResolvedValue(true),
        },
        Uri: {
            parse: jest.fn((url: string) => ({ toString: () => url })),
        },
    }),
    { virtual: true }
);

// Mock stalenessDetector
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock projectDeletionService to avoid deep dependency chain
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
}));

// Mock the projects-dashboard services barrel (dynamic-imported by the edit/
// rename/export handlers) to avoid its deep dependency chain
jest.mock('@/features/projects-dashboard/services/projectRenameService', () => ({
    renameProjectCore: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('@/features/projects-dashboard/services/settingsSerializer', () => ({
    extractSettingsFromProject: jest.fn(() => ({ selectedPackage: 'citisignal' })),
}));

jest.mock('@/features/projects-dashboard/services/settingsTransferService', () => ({
    exportProjectSettings: jest.fn().mockResolvedValue({ success: true }),
}));

describe('Dashboard Action Handlers', () => {
    const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;
    const mockOpenExternal = vscode.env.openExternal as jest.Mock;
    const mockUriParse = vscode.Uri.parse as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleConfigure', () => {
        it('should execute configureProject command', async () => {
            const result = await handleConfigure(createMockHandlerContext());

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        });
    });

    describe('handleDeleteProject', () => {
        it('should delegate to deleteProject service with current project', async () => {
            const { mockContext, mockProject } = setupMocks();
            const {
                deleteProject,
            } = require('@/features/projects-dashboard/services/projectDeletionService');

            const result = await handleDeleteProject(mockContext);

            expect(result).toEqual({ success: true });
            expect(deleteProject).toHaveBeenCalledWith(mockContext, mockProject);
        });

        it('should return error when no project available', async () => {
            const { mockContext } = setupMocks();
            mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleDeleteProject(mockContext);

            expect(result).toEqual({
                success: false,
                error: 'No project found to delete',
            });
        });
    });

    describe('handleOpenBrowser', () => {
        it('should open browser with frontend port URL', async () => {
            const { mockContext } = setupMocks();

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockUriParse).toHaveBeenCalledWith('http://localhost:3000');
            expect(mockOpenExternal).toHaveBeenCalled();
        });

        it('should not open browser when no frontend port', async () => {
            const projectWithoutPort = createDashboardProject({
                componentInstances: {
                    'commerce-mesh': {
                        id: 'commerce-mesh',
                        name: 'API Mesh',
                        status: 'deployed',
                        path: '/path/to/mesh',
                        // No port
                    },
                },
            });
            const mockContext = createMockHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(projectWithoutPort),
                }),
            });

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });

        it('should not open browser when no project', async () => {
            const mockContext = createMockHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                }),
            });

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });

        it('should use correct port from frontend component', async () => {
            const projectWithCustomPort = createDashboardProject({
                componentInstances: {
                    headless: {
                        id: 'headless',
                        name: 'CitiSignal Next.js',
                        type: 'frontend',
                        status: 'running',
                        path: '/path/to/frontend',
                        port: 8080,
                    },
                },
            });
            const mockContext = createMockHandlerContext({
                stateManager: createMockStateManager({
                    getCurrentProject: jest.fn().mockResolvedValue(projectWithCustomPort),
                }),
            });

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockUriParse).toHaveBeenCalledWith('http://localhost:8080');
        });
    });

    describe('handleEditProject', () => {
        it('should open the wizard in edit mode for the current project', async () => {
            const { mockContext, mockProject } = setupMocks();
            const {
                extractSettingsFromProject,
            } = require('@/features/projects-dashboard/services/settingsSerializer');

            const result = await handleEditProject(mockContext);

            expect(result).toEqual({ success: true });
            expect(extractSettingsFromProject).toHaveBeenCalledWith(mockProject, true);
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.createProject', {
                editProject: {
                    projectPath: mockProject.path,
                    projectName: mockProject.name,
                    settings: { selectedPackage: 'citisignal' },
                },
            });
        });

        it('should return error when no project available', async () => {
            const { mockContext } = setupMocks();
            mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleEditProject(mockContext);

            expect(result.success).toBe(false);
            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });
    });

    describe('handleOpenAdminPanel', () => {
        const mockShowInformationMessage = mockWindow
            .showInformationMessage as jest.Mock;
        const { validateURL } = require('@/core/validation/URLValidator');

        /** Flush the fire-and-forget notification .then chain. */
        const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

        const adminUrl = 'https://example.com/admin';

        const setupWithAdminUrl = () =>
            setupMocks({
                componentConfigs: {
                    'commerce-backend': {
                        ADOBE_COMMERCE_ADMIN_URL: adminUrl,
                    },
                },
            });

        it('should open the configured admin URL in the browser', async () => {
            const { mockContext } = setupWithAdminUrl();

            const result = await handleOpenAdminPanel(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockUriParse).toHaveBeenCalledWith(adminUrl);
            expect(mockOpenExternal).toHaveBeenCalled();
        });

        it('should return an error and not open the browser when the URL is invalid', async () => {
            const { mockContext } = setupWithAdminUrl();
            (validateURL as jest.Mock).mockImplementationOnce(() => {
                throw new Error('Invalid URL format');
            });

            const result = await handleOpenAdminPanel(mockContext);

            expect(result).toEqual({
                success: false,
                error: 'Invalid URL',
                code: ErrorCode.CONFIG_INVALID,
            });
            expect(mockOpenExternal).not.toHaveBeenCalled();
            expect(mockContext.logger.error).toHaveBeenCalled();
        });

        it('should show a notification when no admin URL is configured', async () => {
            const { mockContext } = setupMocks({ componentConfigs: {} });

            const result = await handleOpenAdminPanel(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockShowInformationMessage).toHaveBeenCalledWith(
                'No Admin Panel URL is set for this project.',
                'Open Configure'
            );
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });

        it('should open Configure when "Open Configure" is selected from the notification', async () => {
            const { mockContext } = setupMocks({ componentConfigs: {} });
            mockShowInformationMessage.mockResolvedValueOnce('Open Configure');

            const result = await handleOpenAdminPanel(mockContext);
            await flushPromises();

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        });

        it('should not open Configure when the notification is dismissed', async () => {
            const { mockContext } = setupMocks({ componentConfigs: {} });
            mockShowInformationMessage.mockResolvedValueOnce(undefined);

            await handleOpenAdminPanel(mockContext);
            await flushPromises();

            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });

        it('should treat a missing project as a missing URL (notification path)', async () => {
            const { mockContext } = setupMocks();
            mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleOpenAdminPanel(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockShowInformationMessage).toHaveBeenCalled();
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });
    });
});
