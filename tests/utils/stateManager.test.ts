/**
 * StateManager Tests
 *
 * Comprehensive test suite for StateManager utility.
 * Tests state persistence, project management, process tracking, and error handling.
 *
 * Target Coverage: 75%+
 */

import { StateManager } from '../../src/utils/stateManager';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Project, ProcessInfo } from '../../src/types';

// Mock VS Code API
jest.mock('vscode');

// Mock fs/promises
jest.mock('fs/promises');

// Mock os
jest.mock('os');

describe('StateManager', () => {
    let stateManager: StateManager;
    let mockContext: vscode.ExtensionContext;
    let mockGlobalState: vscode.Memento;
    let mockWorkspaceState: vscode.Memento;
    const mockHomedir = '/mock/home';
    const mockStateFile = path.join(mockHomedir, '.demo-builder', 'state.json');
    const mockRecentProjectsFile = path.join(mockHomedir, '.demo-builder', 'recent-projects.json');

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock os.homedir
        (os.homedir as jest.Mock).mockReturnValue(mockHomedir);

        // Create mock global state
        mockGlobalState = {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([]),
            setKeysForSync: jest.fn()
        } as any;

        // Create mock workspace state
        mockWorkspaceState = {
            get: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            keys: jest.fn().mockReturnValue([]),
            setKeysForSync: jest.fn()
        } as any;

        // Create mock context
        mockContext = {
            globalState: mockGlobalState,
            workspaceState: mockWorkspaceState,
            subscriptions: [],
            extensionPath: '/test/path',
            storagePath: '/test/storage',
            globalStoragePath: '/test/global-storage',
            logPath: '/test/log',
            extensionUri: vscode.Uri.file('/test/path'),
            storageUri: vscode.Uri.file('/test/storage'),
            globalStorageUri: vscode.Uri.file('/test/global-storage'),
            logUri: vscode.Uri.file('/test/log'),
            extensionMode: vscode.ExtensionMode.Production,
            asAbsolutePath: (relativePath: string) => `/test/path/${relativePath}`,
            secrets: {} as any,
            environmentVariableCollection: {} as any,
            extension: {} as any
        } as any;

        // Mock fs functions
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.unlink as jest.Mock).mockResolvedValue(undefined);
        (fs.readdir as jest.Mock).mockResolvedValue([]);
        (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

        // Create StateManager instance
        stateManager = new StateManager(mockContext);
    });

    describe('initialize', () => {
        it('should create state directory on initialization', async () => {
            await stateManager.initialize();

            expect(fs.mkdir).toHaveBeenCalledWith(
                path.dirname(mockStateFile),
                { recursive: true }
            );
        });

        it('should load existing state file on initialization', async () => {
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
            (fs.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));

            await stateManager.initialize();

            // Should not throw, should continue with defaults
            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should handle corrupted state file gracefully', async () => {
            (fs.readFile as jest.Mock).mockResolvedValue('{ invalid json');

            await stateManager.initialize();

            // Should not throw, should continue with defaults
            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should clear project if path does not exist', async () => {
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
            (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            // Should not throw
            await expect(stateManager.initialize()).resolves.not.toThrow();
        });
    });

    describe('getCurrentProject', () => {
        it('should return current project when exists', async () => {
            const project: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date('2024-01-01'),
                lastModified: new Date('2024-01-02')
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            }));

            await stateManager.initialize();
            const result = await stateManager.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.name).toBe('test-project');
            expect(result?.path).toBe('/test/project');
        });

        it('should return undefined when no project exists', async () => {
            await stateManager.initialize();
            const result = await stateManager.getCurrentProject();

            expect(result).toBeUndefined();
        });
    });

    describe('hasProject', () => {
        it('should return true when project exists', async () => {
            const project: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
                version: 1,
                currentProject: project,
                processes: {},
                lastUpdated: new Date().toISOString()
            }));

            await stateManager.initialize();
            const result = await stateManager.hasProject();

            expect(result).toBe(true);
        });

        it('should return false when no project exists', async () => {
            await stateManager.initialize();
            const result = await stateManager.hasProject();

            expect(result).toBe(false);
        });
    });

    describe('saveProject', () => {
        it('should save project and write to file', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date(),
                componentSelections: {
                    frontend: 'citisignal-nextjs',
                    backend: 'magento-platform'
                },
                componentInstances: {},
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default'
                    },
                    services: {}
                }
            };

            await stateManager.saveProject(project);

            // Verify state file was written
            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockStateFile
            );
            expect(writeCall).toBeDefined();

            // Verify project was saved
            const savedProject = await stateManager.getCurrentProject();
            expect(savedProject?.name).toBe('new-project');
        });

        it('should create project directory if missing', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date()
            };

            await stateManager.saveProject(project);

            expect(fs.mkdir).toHaveBeenCalledWith(project.path, { recursive: true });
        });

        it('should create .demo-builder.json manifest', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date(),
                adobe: {
                    projectId: 'proj123',
                    projectName: 'Test Project',
                    organization: 'Org Name',
                    workspace: 'workspace123',
                    authenticated: true
                }
            };

            await stateManager.saveProject(project);

            const manifestPath = path.join(project.path, '.demo-builder.json');
            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === manifestPath
            );
            expect(manifestCall).toBeDefined();
        });

        it('should create .env file with project configuration', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date(),
                commerce: {
                    type: 'platform-as-a-service',
                    instance: {
                        url: 'https://example.com',
                        environmentId: 'env123',
                        storeView: 'default',
                        websiteCode: 'base',
                        storeCode: 'default'
                    },
                    services: {
                        catalog: {
                            enabled: true,
                            endpoint: 'https://catalog.api',
                            apiKey: 'catalog-key'
                        }
                    }
                }
            };

            await stateManager.saveProject(project);

            const envPath = path.join(project.path, '.env');
            const envCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === envPath
            );
            expect(envCall).toBeDefined();
            expect(envCall[1]).toContain('PROJECT_NAME=new-project');
            expect(envCall[1]).toContain('COMMERCE_URL=https://example.com');
        });

        it('should fire project changed event', async () => {
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date()
            };

            await stateManager.saveProject(project);

            expect(eventHandler).toHaveBeenCalledWith(project);
        });

        it('should handle manifest write failure gracefully', async () => {
            await stateManager.initialize();

            (fs.writeFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath.includes('.demo-builder.json')) {
                    return Promise.reject(new Error('Permission denied'));
                }
                return Promise.resolve();
            });

            const project: Project = {
                name: 'new-project',
                path: '/test/new-project',
                status: 'created',
                created: new Date(),
                lastModified: new Date()
            };

            // Should not throw
            await expect(stateManager.saveProject(project)).resolves.not.toThrow();
        });
    });

    describe('clearProject', () => {
        it('should clear current project', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            await stateManager.saveProject(project);
            expect(await stateManager.getCurrentProject()).toBeDefined();

            await stateManager.clearProject();

            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should clear all processes', async () => {
            await stateManager.initialize();

            await stateManager.addProcess('test-process', {
                pid: 12345,
                port: 3000,
                startTime: new Date(),
                command: 'npm start',
                status: 'running'
            });

            await stateManager.clearProject();

            const process = await stateManager.getProcess('test-process');
            expect(process).toBeUndefined();
        });

        it('should fire project changed event with undefined', async () => {
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.clearProject();

            expect(eventHandler).toHaveBeenCalledWith(undefined);
        });

        it('should persist cleared state to file', async () => {
            await stateManager.initialize();

            await stateManager.clearProject();

            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockStateFile
            );
            expect(writeCall).toBeDefined();
        });
    });

    describe('clearAll', () => {
        it('should clear all state including workspace state', async () => {
            await stateManager.initialize();

            const project: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            await stateManager.saveProject(project);
            await stateManager.clearAll();

            expect(mockWorkspaceState.update).toHaveBeenCalledWith('demoBuilder.state', undefined);
        });

        it('should delete state file', async () => {
            await stateManager.initialize();

            await stateManager.clearAll();

            expect(fs.unlink).toHaveBeenCalledWith(mockStateFile);
        });

        it('should handle missing state file gracefully', async () => {
            await stateManager.initialize();

            (fs.unlink as jest.Mock).mockRejectedValue(new Error('File not found'));

            await expect(stateManager.clearAll()).resolves.not.toThrow();
        });

        it('should fire project changed event with undefined', async () => {
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.clearAll();

            expect(eventHandler).toHaveBeenCalledWith(undefined);
        });
    });

    describe('process management', () => {
        describe('addProcess', () => {
            it('should add process to state', async () => {
                await stateManager.initialize();

                const processInfo: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };

                await stateManager.addProcess('test-process', processInfo);

                const retrieved = await stateManager.getProcess('test-process');
                expect(retrieved).toEqual(processInfo);
            });

            it('should persist process to file', async () => {
                await stateManager.initialize();

                const processInfo: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };

                await stateManager.addProcess('test-process', processInfo);

                expect(fs.writeFile).toHaveBeenCalled();
            });

            it('should update existing process', async () => {
                await stateManager.initialize();

                const processInfo1: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };

                const processInfo2: ProcessInfo = {
                    pid: 54321,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'stopped'
                };

                await stateManager.addProcess('test-process', processInfo1);
                await stateManager.addProcess('test-process', processInfo2);

                const retrieved = await stateManager.getProcess('test-process');
                expect(retrieved?.pid).toBe(54321);
                expect(retrieved?.status).toBe('stopped');
            });
        });

        describe('removeProcess', () => {
            it('should remove process from state', async () => {
                await stateManager.initialize();

                const processInfo: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };

                await stateManager.addProcess('test-process', processInfo);
                expect(await stateManager.getProcess('test-process')).toBeDefined();

                await stateManager.removeProcess('test-process');

                expect(await stateManager.getProcess('test-process')).toBeUndefined();
            });

            it('should persist removal to file', async () => {
                await stateManager.initialize();

                const processInfo: ProcessInfo = {
                    pid: 12345,
                    port: 3000,
                    startTime: new Date(),
                    command: 'npm start',
                    status: 'running'
                };

                await stateManager.addProcess('test-process', processInfo);
                (fs.writeFile as jest.Mock).mockClear();

                await stateManager.removeProcess('test-process');

                expect(fs.writeFile).toHaveBeenCalled();
            });

            it('should handle removing non-existent process gracefully', async () => {
                await stateManager.initialize();

                await expect(stateManager.removeProcess('nonexistent')).resolves.not.toThrow();
            });
        });

        describe('getProcess', () => {
            it('should return undefined for non-existent process', async () => {
                await stateManager.initialize();

                const result = await stateManager.getProcess('nonexistent');

                expect(result).toBeUndefined();
            });
        });
    });

    describe('recent projects', () => {
        describe('getRecentProjects', () => {
            it('should return empty array when no recent projects', async () => {
                await stateManager.initialize();

                const result = await stateManager.getRecentProjects();

                expect(result).toEqual([]);
            });

            it('should load and return recent projects', async () => {
                const mockRecentProjects = [
                    { path: '/test/project1', name: 'Project 1', lastOpened: '2024-01-01' },
                    { path: '/test/project2', name: 'Project 2', lastOpened: '2024-01-02' }
                ];

                (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        return Promise.resolve(JSON.stringify(mockRecentProjects));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                await stateManager.initialize();
                const result = await stateManager.getRecentProjects();

                expect(result).toHaveLength(2);
                expect(result[0].name).toBe('Project 1');
            });

            it('should filter out projects with non-existent paths', async () => {
                const mockRecentProjects = [
                    { path: '/test/exists', name: 'Exists', lastOpened: '2024-01-01' },
                    { path: '/test/missing', name: 'Missing', lastOpened: '2024-01-02' }
                ];

                (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        return Promise.resolve(JSON.stringify(mockRecentProjects));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                (fs.access as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === '/test/exists') {
                        return Promise.resolve();
                    }
                    return Promise.reject(new Error('Not found'));
                });

                await stateManager.initialize();
                const result = await stateManager.getRecentProjects();

                expect(result).toHaveLength(1);
                expect(result[0].name).toBe('Exists');
            });

            it('should limit to 10 recent projects', async () => {
                const mockRecentProjects = Array.from({ length: 15 }, (_, i) => ({
                    path: `/test/project${i}`,
                    name: `Project ${i}`,
                    lastOpened: new Date(2024, 0, i + 1).toISOString()
                }));

                (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        return Promise.resolve(JSON.stringify(mockRecentProjects));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                await stateManager.initialize();
                const result = await stateManager.getRecentProjects();

                expect(result).toHaveLength(10);
            });
        });

        describe('addToRecentProjects', () => {
            it('should add project to recent projects', async () => {
                await stateManager.initialize();

                const project: Project = {
                    name: 'New Project',
                    path: '/test/new-project',
                    status: 'ready',
                    created: new Date(),
                    lastModified: new Date(),
                    organization: 'Test Org'
                };

                await stateManager.addToRecentProjects(project);

                expect(fs.writeFile).toHaveBeenCalled();
                const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                    call => call[0] === mockRecentProjectsFile
                );
                expect(writeCall).toBeDefined();
            });

            it('should move existing project to top', async () => {
                const mockRecentProjects = [
                    { path: '/test/project1', name: 'Project 1', lastOpened: '2024-01-01' },
                    { path: '/test/project2', name: 'Project 2', lastOpened: '2024-01-02' }
                ];

                (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        return Promise.resolve(JSON.stringify(mockRecentProjects));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                await stateManager.initialize();

                const project: Project = {
                    name: 'Project 1',
                    path: '/test/project1',
                    status: 'ready',
                    created: new Date(),
                    lastModified: new Date()
                };

                await stateManager.addToRecentProjects(project);

                const recent = await stateManager.getRecentProjects();
                expect(recent[0].path).toBe('/test/project1');
            });
        });

        describe('removeFromRecentProjects', () => {
            it('should remove project from recent projects', async () => {
                let mockRecentProjects = [
                    { path: '/test/project1', name: 'Project 1', lastOpened: '2024-01-01' },
                    { path: '/test/project2', name: 'Project 2', lastOpened: '2024-01-02' }
                ];

                (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        return Promise.resolve(JSON.stringify(mockRecentProjects));
                    }
                    return Promise.reject(new Error('File not found'));
                });

                (fs.writeFile as jest.Mock).mockImplementation((filepath: string, content: string) => {
                    if (filepath === mockRecentProjectsFile) {
                        // Update mock state when written
                        mockRecentProjects = JSON.parse(content);
                    }
                    return Promise.resolve();
                });

                await stateManager.initialize();
                await stateManager.removeFromRecentProjects('/test/project1');

                const recent = await stateManager.getRecentProjects();
                expect(recent).toHaveLength(1);
                expect(recent[0].path).toBe('/test/project2');
            });
        });
    });

    describe('loadProjectFromPath', () => {
        it('should load project from valid path', async () => {
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
            (fs.access as jest.Mock).mockRejectedValue(new Error('Not found'));

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/nonexistent');

            expect(project).toBeNull();
        });

        it('should return null for path without manifest', async () => {
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

            // Mock vscode.window.terminals
            const mockTerminal = { name: 'Test Project - Frontend' };
            (vscode.window as any).terminals = [mockTerminal];

            await stateManager.initialize();
            const project = await stateManager.loadProjectFromPath('/test/project');

            expect(project?.status).toBe('running');
        });
    });

    describe('getAllProjects', () => {
        it('should return all projects from projects directory', async () => {
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
            (fs.readdir as jest.Mock).mockRejectedValue(new Error('Directory not found'));

            await stateManager.initialize();
            const projects = await stateManager.getAllProjects();

            expect(projects).toEqual([]);
        });
    });

    describe('reload', () => {
        it('should reload state from file', async () => {
            const mockState = {
                version: 1,
                currentProject: {
                    name: 'reloaded-project',
                    path: '/test/reloaded',
                    status: 'ready',
                    created: new Date('2024-01-01'),
                    lastModified: new Date('2024-01-02')
                },
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            await stateManager.initialize();

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));

            await stateManager.reload();

            const project = await stateManager.getCurrentProject();
            expect(project?.name).toBe('reloaded-project');
        });

        it('should fire project changed event', async () => {
            await stateManager.initialize();

            const eventHandler = jest.fn();
            stateManager.onProjectChanged(eventHandler);

            await stateManager.reload();

            expect(eventHandler).toHaveBeenCalled();
        });
    });

    describe('dispose', () => {
        it('should dispose event emitter', () => {
            const mockEventEmitter = vscode.EventEmitter as jest.MockedClass<typeof vscode.EventEmitter>;

            stateManager.dispose();

            // Event emitter dispose is called by the instance
            // We just verify it doesn't throw
            expect(() => stateManager.dispose()).not.toThrow();
        });
    });

    describe('edge cases and error handling', () => {
        it('should handle concurrent saveProject calls', async () => {
            await stateManager.initialize();

            const project1: Project = {
                name: 'project1',
                path: '/test/project1',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            const project2: Project = {
                name: 'project2',
                path: '/test/project2',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            const project3: Project = {
                name: 'project3',
                path: '/test/project3',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            // Execute concurrent saves
            await Promise.all([
                stateManager.saveProject(project1),
                stateManager.saveProject(project2),
                stateManager.saveProject(project3)
            ]);

            // Last save should win
            const current = await stateManager.getCurrentProject();
            expect(current?.name).toBe('project3');
        });

        it('should handle null/undefined in state gracefully', async () => {
            const mockState = {
                version: 1,
                currentProject: null,
                processes: null,
                lastUpdated: null
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));

            await stateManager.initialize();

            // Should not throw
            expect(await stateManager.getCurrentProject()).toBeUndefined();
        });

        it('should handle malformed manifest gracefully', async () => {
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

        it('should handle file system errors during save', async () => {
            await stateManager.initialize();

            (fs.writeFile as jest.Mock).mockRejectedValue(new Error('Disk full'));

            const project: Project = {
                name: 'test-project',
                path: '/test/project',
                status: 'ready',
                created: new Date(),
                lastModified: new Date()
            };

            // Should not throw, error logged internally
            await expect(stateManager.saveProject(project)).resolves.not.toThrow();
        });
    });
});
