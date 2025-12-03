/**
 * Dashboard Handlers - Ready Tests
 *
 * Tests for handleReady which initializes the dashboard with project and theme data.
 */

import * as vscode from 'vscode';
import { handleReady } from '@/features/dashboard/handlers/dashboardHandlers';
import { setupMocks } from './dashboardHandlers.testUtils';
import { ErrorCode } from '@/types/errorCodes';

// Mock vscode
jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 2 }, // Dark theme by default
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    env: {
        openExternal: jest.fn(),
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

describe('Dashboard Ready Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('handleReady', () => {
        it('should send init message with project and theme', async () => {
            const { mockContext, mockProject } = setupMocks();

            const result = await handleReady(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockContext.panel.webview.postMessage).toHaveBeenCalledWith({
                type: 'init',
                payload: {
                    theme: 'dark',
                    project: {
                        name: mockProject.name,
                        path: mockProject.path,
                    },
                },
            });
        });

        it('should detect light theme', async () => {
            // Override theme to light
            (vscode.window.activeColorTheme as any).kind = 1; // Light
            const { mockContext, mockProject } = setupMocks();

            const result = await handleReady(mockContext);

            expect(result).toEqual({ success: true });
            expect(mockContext.panel.webview.postMessage).toHaveBeenCalledWith({
                type: 'init',
                payload: {
                    theme: 'light',
                    project: {
                        name: mockProject.name,
                        path: mockProject.path,
                    },
                },
            });

            // Reset to dark for other tests
            (vscode.window.activeColorTheme as any).kind = 2;
        });

        it('should return error when no project', async () => {
            const mockContext = {
                panel: {
                    webview: {
                        postMessage: jest.fn(),
                    },
                },
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue(null),
                },
            } as any;

            const result = await handleReady(mockContext);

            expect(result).toEqual({
                success: false,
                error: 'No project or panel available',
                code: ErrorCode.PROJECT_NOT_FOUND,
            });
            expect(mockContext.panel.webview.postMessage).not.toHaveBeenCalled();
        });

        it('should return error when no panel', async () => {
            const mockContext = {
                panel: null,
                stateManager: {
                    getCurrentProject: jest.fn().mockResolvedValue({ name: 'test', path: '/test' }),
                },
            } as any;

            const result = await handleReady(mockContext);

            expect(result).toEqual({
                success: false,
                error: 'No project or panel available',
                code: ErrorCode.PROJECT_NOT_FOUND,
            });
        });
    });
});
