/**
 * StateManager Basic Operations Tests
 *
 * Tests for StateManager initialization and basic query operations.
 * Covers initialization, getCurrentProject, hasProject functionality.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { setupMocks, mockStateFile, createMockProject, type TestMocks } from './stateManager.testUtils';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - Basic Operations', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('initialize', () => {
        it('should create state directory on initialization', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            expect(fs.mkdir).toHaveBeenCalledWith(
                path.dirname(mockStateFile),
                { recursive: true }
            );
        });

        it('should load existing state file on initialization', async () => {
            const { stateManager } = testMocks;
            const mockState = {
                version: 1,
                currentProject: {
                    name: 'test-project',
                    path: '/test/project',
                    status: 'ready',
                    created: new Date('2024-01-01'),
                    lastModified: new Date('2024-01-02')
                },
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));

            await stateManager.initialize();

            expect(fs.readFile).toHaveBeenCalledWith(mockStateFile, 'utf-8');
        });

        it('should handle missing state file gracefully', async () => {
            const { stateManager } = testMocks;
            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            await stateManager.initialize();

            // Should not throw, should continue with defaults
            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should handle corrupted state file gracefully', async () => {
            const { stateManager } = testMocks;
            (fs.readFile as jest.Mock).mockResolvedValue('{ invalid json');

            await stateManager.initialize();

            // Should not throw, should continue with defaults
            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should clear project if path does not exist', async () => {
            const { stateManager } = testMocks;
            const mockState = {
                version: 1,
                currentProject: {
                    name: 'test-project',
                    path: '/nonexistent/project',
                    status: 'ready',
                    created: new Date('2024-01-01'),
                    lastModified: new Date('2024-01-02')
                },
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT'));

            await stateManager.initialize();

            const project = await stateManager.getCurrentProject();
            expect(project).toBeUndefined();
        });

        it('should handle directory creation failure', async () => {
            const { stateManager } = testMocks;
            (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            // Should not throw
            await expect(stateManager.initialize()).resolves.not.toThrow();
        });
    });

    describe('getCurrentProject', () => {
        it('should return current project when exists', async () => {
            const { stateManager } = testMocks;
            const project = createMockProject();
            const mockState = {
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            // Mock manifest data for project path
            const mockManifest = {
                name: project.name,
                created: project.created?.toISOString(),
                lastModified: project.lastModified?.toISOString()
            };

            // Mock fs.readFile to return correct data based on file path
            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.includes('state.json')) {
                    return Promise.resolve(JSON.stringify(mockState));
                }
                if (filepath.includes('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify(mockManifest));
                }
                if (filepath.includes('recent-projects.json')) {
                    return Promise.resolve('[]');
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();
            const result = await stateManager.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.name).toBe('Test Project');
            expect(result?.path).toBe('/test/project');
        });

        it('should return undefined when no project exists', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();
            const result = await stateManager.getCurrentProject();

            expect(result).toBeUndefined();
        });
    });

    describe('hasProject', () => {
        it('should return true when project exists', async () => {
            const { stateManager } = testMocks;
            const project = createMockProject();
            const mockState = {
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));

            await stateManager.initialize();
            const result = await stateManager.hasProject();

            expect(result).toBe(true);
        });

        it('should return false when no project exists', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();
            const result = await stateManager.hasProject();

            expect(result).toBe(false);
        });
    });
});