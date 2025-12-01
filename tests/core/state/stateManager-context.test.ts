/**
 * StateManager Context Variables Tests
 *
 * Tests for VS Code context variable updates when state changes.
 * Context variables enable automatic view switching via `when` clauses.
 *
 * Step 4 of Projects Navigation Architecture plan.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import { setupMocks, createMockProject, type TestMocks } from './stateManager.testUtils';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - Context Variables', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
        // Clear executeCommand mock
        (vscode.commands.executeCommand as jest.Mock).mockClear();
    });

    describe('saveProject', () => {
        it('should set demoBuilder.projectLoaded context to true when project is saved', async () => {
            // Given: StateManager is initialized
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject() as any;

            // When: saveProject is called successfully
            await stateManager.saveProject(project);

            // Then: setContext should be called with projectLoaded = true
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.projectLoaded',
                true
            );
        });
    });

    describe('clearProject', () => {
        it('should set demoBuilder.projectLoaded context to false when project is cleared', async () => {
            // Given: StateManager has a project loaded
            const { stateManager } = testMocks;
            const project = createMockProject() as any;
            const mockState = {
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // When: clearProject is called
            await stateManager.clearProject();

            // Then: setContext should be called with projectLoaded = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.projectLoaded',
                false
            );
        });
    });

    describe('clearAll', () => {
        it('should set demoBuilder.projectLoaded context to false when all state is cleared', async () => {
            // Given: StateManager has state loaded
            const { stateManager } = testMocks;
            const project = createMockProject() as any;
            const mockState = {
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // When: clearAll is called
            await stateManager.clearAll();

            // Then: setContext should be called with projectLoaded = false
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
                'setContext',
                'demoBuilder.projectLoaded',
                false
            );
        });
    });
});
