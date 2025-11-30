/**
 * StateManager Recent Projects Tests
 *
 * Tests for StateManager recent projects management.
 * Covers getRecentProjects, addToRecentProjects, removeFromRecentProjects functionality.
 */

import * as fs from 'fs/promises';
import { setupMocks, mockRecentProjectsFile, createMockProject, type TestMocks } from './stateManager.testUtils';
import type { Project } from '@/types';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - Recent Projects', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('getRecentProjects', () => {
        it('should return empty array when no recent projects', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const result = await stateManager.getRecentProjects();

            expect(result).toEqual([]);
        });

        it('should load and return recent projects', async () => {
            const { stateManager } = testMocks;
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
            const { stateManager } = testMocks;
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
            const { stateManager } = testMocks;
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

        it('should handle corrupted recent projects file', async () => {
            const { stateManager } = testMocks;
            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath === mockRecentProjectsFile) {
                    return Promise.resolve('invalid json{');
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();
            const result = await stateManager.getRecentProjects();

            expect(result).toEqual([]);
        });
    });

    describe('addToRecentProjects', () => {
        it('should add project to recent projects', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.organization = 'Test Org';

            await stateManager.addToRecentProjects(project as Project);

            expect(fs.writeFile).toHaveBeenCalled();
            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockRecentProjectsFile
            );
            expect(writeCall).toBeDefined();
        });

        it('should move existing project to top', async () => {
            const { stateManager } = testMocks;
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

            const project = createMockProject();
            project.path = '/test/project1';
            project.name = 'Project 1';

            await stateManager.addToRecentProjects(project as Project);

            const recent = await stateManager.getRecentProjects();
            expect(recent[0].path).toBe('/test/project1');
        });

        it('should limit recent projects to 10', async () => {
            const { stateManager } = testMocks;
            let mockRecentProjects = Array.from({ length: 10 }, (_, i) => ({
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

            (fs.writeFile as jest.Mock).mockImplementation((filepath: string, content: string) => {
                if (filepath === mockRecentProjectsFile) {
                    // Update mock state when written
                    mockRecentProjects = JSON.parse(content);
                }
                return Promise.resolve();
            });

            await stateManager.initialize();

            const newProject = createMockProject();
            newProject.path = '/test/new-project';
            newProject.name = 'New Project';

            await stateManager.addToRecentProjects(newProject as Project);

            const recent = await stateManager.getRecentProjects();
            expect(recent).toHaveLength(10);
            expect(recent[0].path).toBe('/test/new-project');
        });

        it('should include organization info in recent project', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.organization = 'My Organization';
            project.adobe = {
                projectId: 'proj123',
                projectName: 'Adobe Project',
                organization: 'Adobe Org',
                workspace: 'workspace123',
                authenticated: true
            };

            await stateManager.addToRecentProjects(project as Project);

            const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => call[0] === mockRecentProjectsFile
            );
            expect(writeCall).toBeDefined();
            const written = JSON.parse(writeCall[1]);
            expect(written[0].organization).toBe('My Organization');
        });
    });

    describe('removeFromRecentProjects', () => {
        it('should remove project from recent projects', async () => {
            const { stateManager } = testMocks;
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

        it('should handle removing non-existent project gracefully', async () => {
            const { stateManager } = testMocks;
            const mockRecentProjects = [
                { path: '/test/project1', name: 'Project 1', lastOpened: '2024-01-01' }
            ];

            (fs.readFile as jest.Mock).mockImplementation((filepath: string) => {
                if (filepath === mockRecentProjectsFile) {
                    return Promise.resolve(JSON.stringify(mockRecentProjects));
                }
                return Promise.reject(new Error('File not found'));
            });

            await stateManager.initialize();

            await expect(stateManager.removeFromRecentProjects('/test/nonexistent')).resolves.not.toThrow();

            const recent = await stateManager.getRecentProjects();
            expect(recent).toHaveLength(1);
        });

        it('should persist removal to file', async () => {
            const { stateManager } = testMocks;
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
            (fs.writeFile as jest.Mock).mockClear();

            await stateManager.removeFromRecentProjects('/test/project1');

            expect(fs.writeFile).toHaveBeenCalledWith(
                mockRecentProjectsFile,
                expect.any(String),
                'utf-8'
            );
        });
    });
});