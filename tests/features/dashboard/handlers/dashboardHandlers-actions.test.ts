/**
 * Dashboard Handlers - Action Tests
 *
 * Tests for action handlers that delegate to commands or open external resources:
 * - handleConfigure: opens project configuration UI
 * - handleDeleteProject: triggers project deletion
 * - handleOpenBrowser: opens demo in browser
 */

import * as vscode from 'vscode';
import {
    handleConfigure,
    handleDeleteProject,
    handleOpenBrowser,
} from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks, createMockProject } from './dashboardHandlers.testUtils';

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    env: {
        openExternal: jest.fn().mockResolvedValue(true),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

// Mock stalenessDetector
jest.mock('@/features/mesh/services/stalenessDetector');

// Mock authentication
jest.mock('@/features/authentication');

// Mock ServiceLocator
jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

// Mock validation
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
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
            const result = await handleConfigure({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        });
    });

    describe('handleDeleteProject', () => {
        it('should execute deleteProject command', async () => {
            const result = await handleDeleteProject({} as any);

            expect(result).toEqual({ success: true });
            expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.deleteProject');
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
            const projectWithoutPort = createMockProject({
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
            const mockContext = {
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(projectWithoutPort),
                },
                logger: {
                    debug: jest.fn(),
                },
            } as any;

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });

        it('should not open browser when no project', async () => {
            const mockContext = {
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                },
                logger: {
                    debug: jest.fn(),
                },
            } as any;

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockOpenExternal).not.toHaveBeenCalled();
        });

        it('should use correct port from frontend component', async () => {
            const projectWithCustomPort = createMockProject({
                componentInstances: {
                    'headless': {
                        id: 'headless',
                        name: 'CitiSignal Next.js',
                        type: 'frontend',
                        status: 'running',
                        path: '/path/to/frontend',
                        port: 8080,
                    },
                },
            });
            const mockContext = {
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(projectWithCustomPort),
                },
                logger: {
                    debug: jest.fn(),
                },
            } as any;

            const result = await handleOpenBrowser(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockUriParse).toHaveBeenCalledWith('http://localhost:8080');
        });
    });
});
