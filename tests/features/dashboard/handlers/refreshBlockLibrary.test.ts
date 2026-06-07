/**
 * handleRefreshBlockLibrary handler tests
 *
 * Covers the dashboard "Refresh Block Library" kebab action (EDS-only):
 *   1. No current project → PROJECT_NOT_FOUND error
 *   2. Non-EDS (headless) project → INVALID_OPERATION error, no command dispatched
 *   3. EDS project → executes 'demoBuilder.refreshBlockLibrary' and returns success
 */

// IMPORTANT: Mock declarations must precede imports
jest.mock('vscode', () => ({
    window: {
        activeColorTheme: { kind: 1 },
    },
    ColorThemeKind: { Dark: 2, Light: 1 },
    commands: {
        executeCommand: jest.fn().mockResolvedValue(undefined),
    },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn((url: string) => ({ toString: () => url })),
    },
}), { virtual: true });

jest.mock('@/core/di', () => ({
    ServiceLocator: {
        getAuthenticationService: jest.fn(),
    },
}));

jest.mock('@/features/mesh/services/stalenessDetector');
jest.mock('@/features/authentication');

jest.mock('@/core/validation', () => ({
    validateOrgId: jest.fn(),
    validateProjectId: jest.fn(),
    validateWorkspaceId: jest.fn(),
    validateURL: jest.fn(),
}));

import * as vscode from 'vscode';
import { handleRefreshBlockLibrary } from '@/features/dashboard/handlers/dashboardHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { HandlerContext } from '@/types/handlers';
import { Project } from '@/types';

function makeContext(project: Project | undefined): HandlerContext {
    return {
        panel: {
            webview: { postMessage: jest.fn() },
        } as unknown as HandlerContext['panel'],
        stateManager: {
            getCurrentProject: jest.fn().mockResolvedValue(project),
            saveProject: jest.fn().mockResolvedValue(undefined),
        } as unknown as HandlerContext['stateManager'],
        logger: {
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
        } as unknown as HandlerContext['logger'],
        sendMessage: jest.fn(),
    } as unknown as HandlerContext;
}

function makeEdsProject(): Project {
    return {
        name: 'test-eds',
        path: '/path/to/eds',
        status: 'running',
        selectedStack: 'eds-paas',
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
            },
        },
    } as unknown as Project;
}

function makeHeadlessProject(): Project {
    return {
        name: 'test-headless',
        path: '/path/to/headless',
        status: 'running',
        selectedStack: 'headless-paas',
        componentInstances: {
            'headless': {
                id: 'headless',
                name: 'Headless',
                type: 'frontend',
                status: 'ready',
            },
        },
    } as unknown as Project;
}

describe('handleRefreshBlockLibrary', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    });

    it('returns PROJECT_NOT_FOUND when no current project is loaded', async () => {
        const context = makeContext(undefined);

        const result = await handleRefreshBlockLibrary(context);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.PROJECT_NOT_FOUND);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it('returns INVALID_OPERATION for non-EDS (headless) projects', async () => {
        const context = makeContext(makeHeadlessProject());

        const result = await handleRefreshBlockLibrary(context);

        expect(result.success).toBe(false);
        expect(result.code).toBe(ErrorCode.INVALID_OPERATION);
        expect(result.error).toMatch(/EDS/i);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("invokes 'demoBuilder.refreshBlockLibrary' and returns success for EDS projects", async () => {
        const context = makeContext(makeEdsProject());

        const result = await handleRefreshBlockLibrary(context);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.refreshBlockLibrary');
        expect(result.success).toBe(true);
    });
});
