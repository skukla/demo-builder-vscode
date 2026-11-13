/**
 * Dashboard Handlers - Action Tests
 *
 * Tests for action handlers that delegate to commands or open external resources:
 * - handleConfigure: opens project configuration UI
 * - handleDeleteFromProjectsList: hands Delete over to the projects list (step-05 S4)
 * - handleOpenBrowser: opens demo in browser
 */

import './dashboardValidatorMocks';

const mockOpenInIncognito = jest.fn().mockResolvedValue(true);
const mockOpenPrivateBrowser = jest.fn().mockResolvedValue(true);
jest.mock('@/core/utils/browserUtils', () => ({
    openInIncognito: (...args: unknown[]) => mockOpenInIncognito(...args),
    openPrivateBrowser: (...args: unknown[]) => mockOpenPrivateBrowser(...args),
}));
import * as vscode from 'vscode';
import {
    handleConfigure,
    handleDeleteFromProjectsList,
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
        workspace: {
            getConfiguration: jest.fn(() => ({ get: jest.fn() })),
        },
        env: {
            openExternal: jest.fn().mockResolvedValue(true),
        },
        Uri: {
            parse: jest.fn((url: string) => ({ toString: () => url })),
        },
    }),
    { virtual: true }
);

// Mock projectStateSync (detectFrontendChanges)
jest.mock('@/core/state/projectStateSync');

// Mock authentication

// Mock ServiceLocator
jest.mock('@/core/di/serviceLocator', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
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
            // AI-15: Configure opens for the screen's own project, named by its path.
            const { mockContext } = setupMocks();
            const result = await handleConfigure(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.configureProject', '/path/to/project');
        });
    });

    // The dashboard's Delete (owner, 2026-11-13, P5-Q2): the projects list opens on its one-row
    // Delete window for this project. Nothing is deleted here; the window asks first.
    describe('handleDeleteFromProjectsList', () => {
        it("opens the projects list on this project's Delete window, landing on the list", async () => {
            const { mockContext, mockProject } = setupMocks();

            const result = await handleDeleteFromProjectsList(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockContext.stateManager.clearProject).toHaveBeenCalledTimes(1);
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.showProjectsList', {
                deleteProject: mockProject.path,
            });
        });

        it('should return error when no project available, opening nothing', async () => {
            const { mockContext } = setupMocks();
            mockContext.stateManager.getCurrentProject = jest.fn().mockResolvedValue(null);

            const result = await handleDeleteFromProjectsList(mockContext);

            expect(result).toEqual({
                success: false,
                error: 'No project found to delete',
                code: ErrorCode.PROJECT_NOT_FOUND,
            });
            expect(mockExecuteCommand).not.toHaveBeenCalled();
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
            expect(extractSettingsFromProject).toHaveBeenCalledWith(mockProject);
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
            // A private window: a normal profile's adobe.com cookies overflow the
            // Admin's header limit.
            expect(mockOpenInIncognito).toHaveBeenCalledWith(adminUrl);
            // A button shows its own spinner, so no notification beside it (owner, 2026-10-31).
            expect(mockOpenPrivateBrowser).not.toHaveBeenCalled();
        });

        // A link with no spinner of its own (the integration card's Open Commerce Admin) asks for
        // the "Opening a private browser" notification while Chrome starts.
        it('opens with the notification when the caller asks for it', async () => {
            const { mockContext } = setupWithAdminUrl();

            const result = await handleOpenAdminPanel(mockContext, { notify: true });

            expect(result).toEqual({ success: true });
            expect(mockOpenPrivateBrowser).toHaveBeenCalledWith(adminUrl);
            expect(mockOpenInIncognito).not.toHaveBeenCalled();
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
            expect(mockOpenInIncognito).not.toHaveBeenCalled();
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
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.configureProject', '/path/to/project');
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
