/**
 * Tests for Projects Dashboard handlers — handleOpenAdminPanel.
 *
 * Split out of dashboardHandlers.test.ts to keep each test file under the
 * repo's file-size limit (see docs/testing/test-file-splitting-playbook.md).
 */

import { handleOpenAdminPanel } from '@/features/projects-dashboard/handlers/dashboardHandlers';
import { createMockProject, createMockHandlerContext } from '../testUtils';

// Mock mesh staleness detection (module-eval safety; unused by these tests).
jest.mock('@/features/dashboard/handlers/meshStatusHelpers', () => ({
    hasMeshDeploymentRecord: jest.fn().mockReturnValue(false),
    determineMeshStatus: jest.fn().mockResolvedValue('deployed'),
}));

// Make filesystem path-safety checks deterministic and independent of the host.
// validateProjectPath() canonicalizes via fs.realpathSync; identity realpathSync
// keeps the security prefix check intact while letting valid in-tree project
// paths through regardless of what exists on disk.
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    realpathSync: jest.fn((p: string) => p),
}));

jest.mock('@/features/mesh/services/stalenessDetector', () => ({
    detectMeshChanges: jest.fn().mockResolvedValue({ hasChanges: false }),
}));

// Mock vscode
jest.mock(
    'vscode',
    () => ({
        commands: {
            executeCommand: jest.fn(),
        },
        workspace: {
            getConfiguration: jest.fn().mockReturnValue({
                get: jest.fn().mockReturnValue('cards'),
            }),
        },
        Uri: {
            file: jest.fn((p: string) => ({ fsPath: p, path: p })),
            parse: jest.fn((s: string) => ({ toString: () => s, url: s })),
        },
        env: {
            clipboard: {
                writeText: jest.fn(),
            },
            openExternal: jest.fn(),
        },
        window: {
            showInformationMessage: jest.fn(),
        },
    }),
    { virtual: true }
);

describe('dashboardHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Reset vscode mocks to defaults
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockReturnValue({
            get: jest.fn().mockReturnValue('cards'),
        });
        vscode.commands.executeCommand.mockResolvedValue(undefined);
    });

    describe('handleOpenAdminPanel', () => {
        const ADMIN_URL = 'https://example.com/admin_ui';

        /** Project whose componentConfigs carry the optional admin-panel env var. */
        function projectWithAdminUrl(url: string) {
            return createMockProject({
                name: 'Admin Target',
                componentConfigs: {
                    'citisignal-nextjs': { ADOBE_COMMERCE_ADMIN_URL: url },
                },
            } as any);
        }

        /** Flush the fire-and-forget notification .then chain. */
        const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

        beforeEach(() => {
            const vscode = require('vscode');
            // The handler chains .then on the toast — must return a promise.
            vscode.window.showInformationMessage.mockResolvedValue(undefined);
        });

        it('returns error when projectPath is missing', async () => {
            const context = createMockHandlerContext([]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, undefined);

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/path is required/i);
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('rejects a path outside the projects directory before loading', async () => {
            const context = createMockHandlerContext([]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: '/nonexistent/path',
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid project path/i);
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('returns error when the project cannot be loaded', async () => {
            const context = createMockHandlerContext([]);
            const vscode = require('vscode');
            const os = require('os');
            const path = require('path');
            const validButEmptyPath = path.join(
                os.homedir(),
                '.demo-builder',
                'projects',
                'nonexistent'
            );

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: validButEmptyPath,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/not found/i);
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('opens the configured admin URL externally when set', async () => {
            const project = projectWithAdminUrl(ADMIN_URL);
            const context = createMockHandlerContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: project.path,
            });

            expect(result.success).toBe(true);
            expect(vscode.Uri.parse).toHaveBeenCalledWith(ADMIN_URL);
            expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
            // No configure prompt when the URL exists.
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('rejects an invalid admin URL without opening it', async () => {
            // localhost fails validateURL's SSRF guard even though http is an
            // allowed protocol (the Configure field accepts http and https).
            const project = projectWithAdminUrl('http://localhost:8080/admin');
            const context = createMockHandlerContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: project.path,
            });

            expect(result.success).toBe(false);
            expect(result.error).toMatch(/invalid/i);
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
        });

        it('opens an http admin URL (Configure accepts http, so open-time must too)', async () => {
            const httpUrl = 'http://my-instance.example.com/admin';
            const project = projectWithAdminUrl(httpUrl);
            const context = createMockHandlerContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: project.path,
            });

            expect(result.success).toBe(true);
            expect(vscode.Uri.parse).toHaveBeenCalledWith(httpUrl);
            expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        });

        it('shows a notification with an Open Configure action when no URL is set', async () => {
            const project = createMockProject({ name: 'No Admin URL' });
            const context = createMockHandlerContext([project]);
            const vscode = require('vscode');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: project.path,
            });
            await flushPromises();

            expect(result.success).toBe(true);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'No Admin Panel URL is set for this project.',
                'Open Configure'
            );
            expect(vscode.env.openExternal).not.toHaveBeenCalled();
            // Toast dismissed (no selection) — no pointer write, no navigation.
            expect(context.stateManager.saveProject).not.toHaveBeenCalled();
            expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        });

        it('sets the current-project pointer then opens Configure when the action is selected', async () => {
            const project = createMockProject({ name: 'No Admin URL' });
            const context = createMockHandlerContext([project]);
            const vscode = require('vscode');
            vscode.window.showInformationMessage.mockResolvedValue('Open Configure');

            const result = await handleOpenAdminPanel(context as any, {
                projectPath: project.path,
            });
            await flushPromises();

            expect(result.success).toBe(true);
            // saveProject sets the pointer configureProject resolves from.
            expect(context.stateManager.saveProject).toHaveBeenCalledWith(project);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'demoBuilder.configureProject'
            );
            // Pointer write happens before the command dispatch.
            const saveOrder = context.stateManager.saveProject.mock.invocationCallOrder[0];
            const execOrder = vscode.commands.executeCommand.mock.invocationCallOrder[0];
            expect(saveOrder).toBeLessThan(execOrder);
        });
    });
});
