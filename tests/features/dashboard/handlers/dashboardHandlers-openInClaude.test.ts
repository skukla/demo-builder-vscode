/**
 * Dashboard Handlers — handleOpenInClaude (Cycle D — Batch D2)
 *
 * Coverage:
 *  - Dispatches the demoBuilder.openInClaude command with the current project
 *  - Returns { success: true }
 *  - Wired into the dashboardHandlers map under the 'openInClaude' key
 */

import * as vscode from 'vscode';

import {
    dashboardHandlers,
    handleOpenInClaude,
} from '@/features/dashboard/handlers/dashboardHandlers';

jest.mock('vscode', () => ({
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');
jest.mock('@/core/di', () => ({
    ServiceLocator: { getAuthenticationService: jest.fn() },
}));
jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));
jest.mock('@/features/projects-dashboard/services/projectDeletionService', () => ({
    deleteProject: jest.fn().mockResolvedValue({ success: true }),
}));

describe('Dashboard handleOpenInClaude', () => {
    const mockExecuteCommand = vscode.commands.executeCommand as jest.Mock;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('dispatches demoBuilder.openInClaude with the current project', async () => {
        const project = { name: 'demo', path: '/projects/demo' };
        const context = {
            stateManager: { getCurrentProject: jest.fn().mockResolvedValue(project) },
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        } as any;

        const result = await handleOpenInClaude(context);

        expect(result).toEqual({ success: true });
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.openInClaude', project);
    });

    it('returns success: true even when there is no current project (lets command surface its own error)', async () => {
        const context = {
            stateManager: { getCurrentProject: jest.fn().mockResolvedValue(null) },
            logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
        } as any;

        const result = await handleOpenInClaude(context);

        expect(result).toEqual({ success: true });
        // We still dispatch — the command itself decides what to do with a missing project.
        expect(mockExecuteCommand).toHaveBeenCalledWith('demoBuilder.openInClaude', null);
    });

    it("is registered in the dashboardHandlers map under 'openInClaude'", () => {
        expect(typeof handleOpenInClaude).toBe('function');
        expect((dashboardHandlers as Record<string, unknown>).openInClaude).toBe(handleOpenInClaude);
    });
});
