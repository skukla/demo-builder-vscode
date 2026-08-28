/**
 * Extension Context Variables Tests
 *
 * Tests for VS Code context variable initialization during extension activation.
 * Context variables enable automatic view switching via `when` clauses.
 *
 * Step 4 of Projects Navigation Architecture plan.
 *
 * Mock scaffold + SUT come from extension.testUtils (shared with
 * extension-activation-navigation.test.ts) — import nothing from
 * '../src/extension' or 'vscode' directly, or it binds before the mocks
 * register.
 */

import {
    activate,
    deactivate,
    vscode,
    createMockExtensionContext,
    mockHasProject,
    mockGetCurrentProject,
} from './extension.testUtils';

describe('Extension - Context Variables Initialization', () => {
    // These tests call the REAL activate(), which starts the in-extension MCP server
    // (a live socket), the state manager, and the command manager. Without the
    // matching teardown those outlive the suite and hold the jest worker open —
    // "A worker process has failed to exit gracefully", 2/2 runs on this file alone.
    // deactivate() is what production calls; the test owes the same courtesy.
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
    });

    describe('activate()', () => {
        it('should set demoBuilder.projectLoaded context based on existing project state (no project)', async () => {
            // Given: No existing project
            mockHasProject.mockResolvedValue(false);

            const context = createMockExtensionContext();

            // When: Extension activates
            await activate(context);

            // Then: setContext should be called with projectLoaded = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.projectLoaded',
                false
            );
        });

        it('should set demoBuilder.projectLoaded context based on existing project state (with project)', async () => {
            // Given: An existing project is loaded
            mockHasProject.mockResolvedValue(true);
            mockGetCurrentProject.mockResolvedValue({
                name: 'Test Project',
                path: '/test/project',
            });

            const context = createMockExtensionContext();

            // When: Extension activates
            await activate(context);

            // Then: setContext should be called with projectLoaded = true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.projectLoaded',
                true
            );
        });

        it('should set demoBuilder.wizardActive context to false on activation', async () => {
            // Given: Extension is starting up (no wizard active yet)
            mockHasProject.mockResolvedValue(false);

            const context = createMockExtensionContext();

            // When: Extension activates
            await activate(context);

            // Then: setContext should be called with wizardActive = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.wizardActive',
                false
            );
        });
    });
});
