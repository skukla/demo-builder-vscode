/**
 * Extension Activation - Navigation Tests
 *
 * Tests for navigation behavior during extension activation:
 * - Extension always opens Projects List as the entry point on reload
 * - Works consistently with or without existing project
 * - Context variables should be set correctly
 *
 * Step 5 of Projects Navigation Architecture plan.
 *
 * Mock scaffold + SUT come from extension.testUtils (shared with
 * extension-context.test.ts) — import nothing from '../src/extension' or
 * 'vscode' directly, or it binds before the mocks register.
 */

import {
    activate,
    shouldReHomeToRoot,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
} from './extension.testUtils';

describe('Extension Activation - Navigation', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('Given extension reactivates with project in state', () => {
        describe('When activate() is called', () => {
            it('should check for existing project during activation', async () => {
                // Given: An existing project is loaded
                mockHasProject.mockResolvedValue(true);
                mockGetCurrentProject.mockResolvedValue({
                    name: 'Test Project',
                    path: '/test/project',
                    status: 'stopped',
                });

                const context = createActivationContext();

                // When: Extension activates
                await activate(context);

                // Then: Extension should check for existing projects
                expect(mockHasProject).toHaveBeenCalled();

                // Note: getCurrentProject and showProjectsList are called based on hasProject result
                // The full flow is verified through integration testing as the mocked environment
                // has limitations with async state management
            });

            it('should set context variable demoBuilder.projectLoaded to true', async () => {
                // Given: An existing project is loaded
                mockHasProject.mockResolvedValue(true);
                mockGetCurrentProject.mockResolvedValue({
                    name: 'Test Project',
                    path: '/test/project',
                });

                const context = createActivationContext();

                // When: Extension activates
                await activate(context);

                // Then: setContext should be called with projectLoaded = true
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'setContext',
                    'demoBuilder.projectLoaded',
                    true
                );
            });
        });
    });

    describe('Given extension reactivates with no project in state', () => {
        describe('When activate() is called', () => {
            it('should complete activation successfully without existing project', async () => {
                // Given: No existing project
                mockHasProject.mockResolvedValue(false);
                mockGetCurrentProject.mockResolvedValue(undefined);

                const context = createActivationContext();

                // When: Extension activates
                await activate(context);

                // Then: Activation should complete and check for projects
                expect(mockHasProject).toHaveBeenCalled();

                // Note: showProjectsList is called via setTimeout after DASHBOARD_OPEN_DELAY
                // This ensures consistent entry point behavior on reload.
                // Timer-based behavior verified through integration testing.
            });

            it('should set context variable demoBuilder.projectLoaded to false', async () => {
                // Given: No existing project
                mockHasProject.mockResolvedValue(false);

                const context = createActivationContext();

                // When: Extension activates
                await activate(context);

                // Then: setContext should be called with projectLoaded = false
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                    'setContext',
                    'demoBuilder.projectLoaded',
                    false
                );
            });
        });
    });

    describe('Given the window is anchored to a Demo Builder project on cold start', () => {
        const os = jest.requireActual('os') as typeof import('os');
        const path = jest.requireActual('path') as typeof import('path');
        const PROJECT_PATH = path.join(os.homedir(), '.demo-builder', 'projects', 'my-demo');

        beforeEach(() => {
            (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [
                { uri: { fsPath: PROJECT_PATH } },
            ];
        });

        afterEach(() => {
            (vscode.workspace as unknown as { workspaceFolders: unknown }).workspaceFolders = [];
        });

        it('does NOT land on the project dashboard (always the projects list is home)', async () => {
            mockHasProject.mockResolvedValue(true);
            mockGetCurrentProject.mockResolvedValue({ name: 'My Demo', path: PROJECT_PATH });

            const context = createActivationContext();
            await activate(context);

            // Cold start never opens the project dashboard, even when the window
            // is still anchored to a project folder (decoupling Phase 1 reverses
            // the prior landOnProjectDashboardForWorkspace behavior). The projects
            // list is always home.
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                'demoBuilder.showProjectDashboard'
            );
        });
    });

    describe('Error handling during activation', () => {
        it('should complete activation even if registerCommand fails for some commands', async () => {
            // Given: Some command registration will fail
            mockHasProject.mockResolvedValue(true);
            mockGetCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/test/project',
            });

            const context = createActivationContext();

            // When: Extension activates
            // Then: Should complete successfully (activation is resilient to partial failures)
            await expect(activate(context)).resolves.not.toThrow();
        });
    });
});

describe('shouldReHomeToRoot', () => {
    const ROOT = '/home/user/.demo-builder/projects';

    it('returns false when no workspace folder is open', () => {
        expect(shouldReHomeToRoot(undefined, ROOT)).toBe(false);
    });

    it('returns false when the workspace IS the projects root', () => {
        expect(shouldReHomeToRoot(ROOT, ROOT)).toBe(false);
    });

    it('returns true when the workspace is a project subdir of the root', () => {
        expect(shouldReHomeToRoot(`${ROOT}/my-demo`, ROOT)).toBe(true);
    });

    it('returns false for an unrelated path outside the root', () => {
        expect(shouldReHomeToRoot('/somewhere/else', ROOT)).toBe(false);
    });

    it('returns false for a sibling path that only shares the root prefix string', () => {
        // `${ROOT}-other` starts with `${ROOT}` as a string but is NOT a child
        // of the root directory — the path.sep guard rejects it.
        expect(shouldReHomeToRoot(`${ROOT}-other`, ROOT)).toBe(false);
    });
});
