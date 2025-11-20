/**
 * StateManager Utilities Tests
 *
 * Tests for StateManager utility operations.
 * Covers loadProjectFromPath, getAllProjects, reload, dispose, and edge cases.
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { setupMocks, mockHomedir, mockStateFile, createMockProject, type TestMocks } from './stateManager.testUtils';
import type { Project } from '@/types';

// Re-declare mocks to ensure proper typing
jest.mock('fs/promises');

describe('StateManager - Utilities', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('loadProjectFromPath', () => {
        it('should load project from valid path', async () => {
            const { stateManager } = testMocks;
            const mockManifest = {
                name: 'Test Project',
                created: '2024-01-01',
                lastModified: '2024-01-02'
            };

            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify(mockManifest));
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/test/project');

            expect(project).toBeDefined();
            expect(project?.name).toBe('Test Project');
        });

        it('should return null for non-existent path', async () => {
            const { stateManager } = testMocks;
            (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/nonexistent');

            expect(project).toBeNull();
        });

        it('should return null for path without manifest', async () => {
            const { stateManager } = testMocks;
            (fs.access as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.reject(new Error('Not found'));
                }
                return Promise.resolve();
            });

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/test/project');

            expect(project).toBeNull();
        });

        it('should reconstruct component instances from directory', async () => {
            const { stateManager } = testMocks;
            const mockManifest = {
                name: 'Test Project',
                created: '2024-01-01'
            };

            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify(mockManifest));
                }
                return Promise.reject(new Error('File not found'));
            });

            (fs.readdir as jest.Mock).mockResolvedValue(['citisignal-nextjs', 'magento-platform']);
            (fs.stat as jest.Mock).mockResolvedValue({ isDirectory: () => true });

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/test/project');

            expect(project?.componentInstances).toBeDefined();
        });

        it('should detect running demo from terminal', async () => {
            const { stateManager } = testMocks;

            // Spy on console.log to verify detection message
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            const mockManifest = {
                name: 'Test Project',
                created: '2024-01-01',
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Next.js',
                        status: 'ready'
                    }
                }
            };

            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify(mockManifest));
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();

            // Create mock terminal with matching name
            const mockTerminal = {
                name: 'Test Project - Frontend'
            } as unknown as vscode.Terminal;

            // Inject terminal provider that returns our mock terminal
            const terminalProvider = () => [mockTerminal];

            // Load project with injected terminal provider
            const project = await stateManager.loadProjectFromPath('/test/project', terminalProvider);

            // Verify detection log was called
            const detectionLog = consoleLogSpy.mock.calls.find((call: any[]) =>
                call[0]?.includes?.('[StateManager] Detected running demo')
            );
            expect(detectionLog).toBeDefined();
            expect(detectionLog![0]).toContain('Test Project');
            expect(detectionLog![0]).toContain('Test Project - Frontend');

            consoleLogSpy.mockRestore();

            // The key assertions: status should be 'running' when terminal is detected
            expect(project?.status).toBe('running');
            expect(project?.componentInstances?.['citisignal-nextjs']?.status).toBe('running');
        });

        it('should set status to stopped when no matching terminal found', async () => {
            const { stateManager } = testMocks;

            const mockManifest = {
                name: 'Test Project',
                created: '2024-01-01',
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Next.js',
                        status: 'ready'
                    }
                }
            };

            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.resolve(JSON.stringify(mockManifest));
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();

            // Create mock terminal with DIFFERENT name
            const mockTerminal = {
                name: 'Other Project - Frontend'
            } as unknown as vscode.Terminal;

            // Inject terminal provider that returns terminal with different name
            const terminalProvider = () => [mockTerminal];

            // Load project with injected terminal provider
            const project = await stateManager.loadProjectFromPath('/test/project', terminalProvider);

            // Status should be 'stopped' when no matching terminal found
            expect(project?.status).toBe('stopped');
            expect(project?.componentInstances?.['citisignal-nextjs']?.status).toBe('ready');
        });

        it('should handle corrupted manifest gracefully', async () => {
            const { stateManager } = testMocks;
            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.endsWith('.demo-builder.json')) {
                    return Promise.resolve('{ invalid json');
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/test/project');

            expect(project).toBeNull();
        });
    });

    describe('getAllProjects', () => {
        it('should return all projects from projects directory', async () => {
            const { stateManager } = testMocks;
            const projectsDir = path.join(mockHomedir, '.demo-builder', 'projects');

            (fs.readdir as jest.Mock).mockImplementation((dir: string) => {
                if (dir === projectsDir) {
                    return Promise.resolve([
                        { name: 'project1', isDirectory: () => true },
                        { name: 'project2', isDirectory: () => true }
                    ]);
                }
                return Promise.resolve([]);
            });

            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects).toHaveLength(2);
        });

        it('should filter out directories without manifest', async () => {
            const { stateManager } = testMocks;
            const projectsDir = path.join(mockHomedir, '.demo-builder', 'projects');

            (fs.readdir as jest.Mock).mockImplementation((dir: string) => {
                if (dir === projectsDir) {
                    return Promise.resolve([
                        { name: 'project1', isDirectory: () => true },
                        { name: 'not-a-project', isDirectory: () => true }
                    ]);
                }
                return Promise.resolve([]);
            });

            (fs.access as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.includes('project1')) {
                    return Promise.resolve();
                }
                return Promise.reject(new Error('Not found'));
            });

            (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe('project1');
        });

        it('should sort projects by last modified date', async () => {
            const { stateManager } = testMocks;
            const projectsDir = path.join(mockHomedir, '.demo-builder', 'projects');

            (fs.readdir as jest.Mock).mockImplementation((dir: string) => {
                if (dir === projectsDir) {
                    return Promise.resolve([
                        { name: 'old-project', isDirectory: () => true },
                        { name: 'new-project', isDirectory: () => true }
                    ]);
                }
                return Promise.resolve([]);
            });

            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.stat as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.includes('old-project')) {
                    return Promise.resolve({ mtime: new Date('2024-01-01') });
                }
                return Promise.resolve({ mtime: new Date('2024-01-02') });
            });

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects[0].name).toBe('new-project');
            expect(projects[1].name).toBe('old-project');
        });

        it('should handle missing projects directory gracefully', async () => {
            const { stateManager } = testMocks;
            (fs.readdir as jest.Mock).mockRejectedValue(new Error('Directory not found'));

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects).toEqual([]);
        });

        it('should exclude non-directory entries', async () => {
            const { stateManager } = testMocks;
            const projectsDir = path.join(mockHomedir, '.demo-builder', 'projects');

            (fs.readdir as jest.Mock).mockImplementation((dir: string) => {
                if (dir === projectsDir) {
                    return Promise.resolve([
                        { name: 'project1', isDirectory: () => true },
                        { name: 'readme.txt', isDirectory: () => false }
                    ]);
                }
                return Promise.resolve([]);
            });

            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects).toHaveLength(1);
            expect(projects[0].name).toBe('project1');
        });
    });

    describe('reload', () => {
        it('should reload state from file', async () => {
            const { stateManager } = testMocks;
            const mockState = {
                version: 1,
                currentProject: createMockProject('reloaded-project'),
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            await stateManager.initialize();

            // Change the mock to return different state
            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));

            await stateManager.reload();

            const project = await stateManager.getCurrentProject();
            expect(project?.name).toBe('Test Project');
        });

        it('should handle missing state file on reload', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            await stateManager.reload();

            const project = await stateManager.getCurrentProject();
            expect(project).toBeUndefined();
        });

        it('should handle corrupted state file on reload', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            (fs.readFile as jest.Mock).mockResolvedValue('corrupted data');

            await stateManager.reload();

            const project = await stateManager.getCurrentProject();
            expect(project).toBeUndefined();
        });

        it('should preserve event handlers after reload', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.reload();

            const project = createMockProject();
            await stateManager.saveProject(project as Project);

            expect(eventHandler).toHaveBeenCalledWith(project);
        });
    });

    // NOTE: dispose() tests removed - StateManager.dispose() only calls
    // this._onProjectChanged.dispose() and does NOT manage a _disposables array.
    // The original tests were checking for non-existent functionality.

    describe('edge cases and error handling', () => {
        it('should handle concurrent save operations', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project1 = createMockProject('project1');
            const project2 = createMockProject('project2');

            await Promise.all([
                stateManager.saveProject(project1 as Project),
                stateManager.saveProject(project2 as Project)
            ]);

            const current = await stateManager.getCurrentProject();
            // One should win, just verify no errors
            expect(current).toBeDefined();
        });

        it('should handle file system errors gracefully', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            // Simulate file system error
            (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Disk full'));

            const project = createMockProject();

            // FIXED: Errors should now be propagated (not swallowed)
            await expect(stateManager.saveProject(project as Project)).rejects.toThrow('Disk full');
        });

        it('should handle invalid project data gracefully', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            // Project with invalid data (invalid date will cause RangeError during JSON.stringify)
            const invalidProject = {
                name: null,
                path: '',
                status: 'invalid'
            } as unknown as Parameters<typeof stateManager.saveProject>[0];

            // FIXED: Errors should now be propagated (not swallowed)
            await expect(stateManager.saveProject(invalidProject)).rejects.toThrow();
        });

        it('should handle race condition in process management', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const processInfo: any = {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            };

            // Concurrent add and remove
            await Promise.all([
                stateManager.addProcess('test', processInfo),
                stateManager.removeProcess('test')
            ]);

            // Should handle gracefully - process may or may not exist
            const result = await stateManager.getProcess('test');
            expect([undefined, processInfo]).toContainEqual(result);
        });
    });
});