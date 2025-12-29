/**
 * Tests for StateManager error handling
 *
 * These tests verify that file operation errors are properly propagated
 * instead of being silently swallowed, fixing the critical bug where
 * projects appeared to save successfully but no files were written.
 *
 * Related Bug Fix: Project not being saved to file system
 * Root Cause: Try-catch blocks that logged errors but didn't re-throw
 */

import { StateManager } from '@/core/state/stateManager';
import { Project } from '@/types/base';
import * as os from 'os';
import * as path from 'path';

// Mock fs/promises module (matches StateManager's import)
jest.mock('fs/promises', () => ({
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
}));

// Mock os.homedir
jest.mock('os', () => ({
    homedir: jest.fn(() => '/mock/home'),
}));

// Mock logger - StateManager uses getLogger() internally
jest.mock('@/core/logging', () => ({
    getLogger: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        trace: jest.fn(),
    })),
}));

// Import mocked fs/promises after jest.mock
import * as fs from 'fs/promises';

describe('StateManager - Error Handling', () => {
    let stateManager: StateManager;
    let mockContext: any;
    let mockProject: Project;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock VS Code context
        mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn(),
            },
            globalStorageUri: {
                fsPath: '/mock/storage',
            },
            workspaceState: {
                get: jest.fn(),
                update: jest.fn(),
            },
        };

        // Mock all fs operations with success by default
        (fs.readFile as jest.Mock).mockResolvedValue('{"version":"1.0.0","processes":{}}');
        (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
        (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
        (fs.readdir as jest.Mock).mockResolvedValue([]);
        (fs.access as jest.Mock).mockResolvedValue(undefined);
        (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

        // Create StateManager instance
        stateManager = new StateManager(mockContext);

        // Create mock project
        mockProject = {
            name: 'test-project',
            path: '/mock/home/.demo-builder/projects/test-project',
            created: new Date(),
            lastModified: new Date(),
            status: 'ready',
        } as Project;
    });

    describe('saveProject() - Error Propagation', () => {
        describe('saveState() errors', () => {
            it('should throw error when state file write fails with permission denied', async () => {
                const permissionError = new Error('EACCES: permission denied');
                (permissionError as any).code = 'EACCES';
                (fs.writeFile as jest.Mock).mockRejectedValue(permissionError);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('permission denied');
            });

            it('should throw error when state file write fails with disk full', async () => {
                const diskFullError = new Error('ENOSPC: no space left on device');
                (diskFullError as any).code = 'ENOSPC';
                (fs.writeFile as jest.Mock).mockRejectedValue(diskFullError);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('no space left on device');
            });
        });

        describe('saveProjectConfig() errors - mkdir failures', () => {
            it('should throw error when project directory creation fails', async () => {
                // State save succeeds, but mkdir fails
                (fs.writeFile as jest.Mock).mockResolvedValueOnce(undefined); // saveState succeeds

                const mkdirError = new Error('EACCES: permission denied, mkdir');
                (mkdirError as any).code = 'EACCES';
                (fs.mkdir as jest.Mock).mockRejectedValue(mkdirError);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('permission denied');
            });

            it('should throw error when path is too long (Windows 260-char limit)', async () => {
                (fs.writeFile as jest.Mock).mockResolvedValueOnce(undefined); // saveState succeeds

                const pathTooLongError = new Error('ENAMETOOLONG: name too long');
                (pathTooLongError as any).code = 'ENAMETOOLONG';
                (fs.mkdir as jest.Mock).mockRejectedValue(pathTooLongError);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('name too long');
            });
        });

        describe('saveProjectConfig() errors - manifest write failures', () => {
            it('should throw error when manifest file write fails', async () => {
                (fs.writeFile as jest.Mock)
                    .mockResolvedValueOnce(undefined) // saveState succeeds
                    .mockRejectedValueOnce(new Error('ENOSPC: no space left on device')); // manifest fails

                (fs.mkdir as jest.Mock).mockResolvedValue(undefined); // mkdir succeeds

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('no space left on device');
            });

            it('should throw error when manifest path is invalid', async () => {
                (fs.writeFile as jest.Mock)
                    .mockResolvedValueOnce(undefined) // saveState succeeds
                    .mockRejectedValueOnce(new Error('ENOENT: no such file or directory')); // manifest fails

                (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('no such file or directory');
            });
        });

        describe('createEnvFile() errors', () => {
            it('should throw error when .env file write fails', async () => {
                (fs.writeFile as jest.Mock)
                    .mockResolvedValueOnce(undefined) // saveState succeeds
                    .mockResolvedValueOnce(undefined) // manifest succeeds
                    .mockRejectedValueOnce(new Error('EACCES: permission denied')); // .env fails

                (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('permission denied');
            });

            it('should throw error when .env path is read-only', async () => {
                (fs.writeFile as jest.Mock)
                    .mockResolvedValueOnce(undefined) // saveState succeeds
                    .mockResolvedValueOnce(undefined) // manifest succeeds
                    .mockRejectedValueOnce(new Error('EROFS: read-only file system')); // .env fails

                (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

                await expect(stateManager.saveProject(mockProject)).rejects.toThrow('read-only file system');
            });
        });
    });

    describe('getAllProjects() - Error Handling', () => {
        it('should return empty array when projects directory does not exist (ENOENT)', async () => {
            const enoentError = new Error('ENOENT: no such file or directory');
            (enoentError as any).code = 'ENOENT';
            (fs.readdir as jest.Mock).mockRejectedValue(enoentError);

            const result = await stateManager.getAllProjects();

            expect(result).toEqual([]);
            // Should log debug message (not error) for ENOENT
        });

        it('should return empty array when projects directory is not readable (EACCES)', async () => {
            const permissionError = new Error('EACCES: permission denied');
            (permissionError as any).code = 'EACCES';
            (fs.readdir as jest.Mock).mockRejectedValue(permissionError);

            const result = await stateManager.getAllProjects();

            expect(result).toEqual([]);
            // Should log error for permission issues
        });

        it('should skip directories without manifest files', async () => {
            const mockEntries = [
                { name: 'valid-project', isDirectory: () => true },
                { name: 'invalid-dir', isDirectory: () => true },
                { name: 'some-file.txt', isDirectory: () => false },
            ];

            (fs.readdir as jest.Mock).mockResolvedValue(mockEntries);
            (fs.access as jest.Mock)
                .mockResolvedValueOnce(undefined) // valid-project has manifest
                .mockRejectedValueOnce(new Error('ENOENT')); // invalid-dir missing manifest

            (fs.stat as jest.Mock).mockResolvedValue({ mtime: new Date() });

            const result = await stateManager.getAllProjects();

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('valid-project');
        });
    });

    describe('Real-world scenarios', () => {
        it('should fail gracefully when disk is full during project creation', async () => {
            // Simulates: User creates project, disk fills up during .env creation
            (fs.writeFile as jest.Mock)
                .mockResolvedValueOnce(undefined) // state.json succeeds
                .mockResolvedValueOnce(undefined) // .demo-builder.json succeeds
                .mockRejectedValueOnce(new Error('ENOSPC: no space left on device')); // .env fails

            (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

            await expect(stateManager.saveProject(mockProject)).rejects.toThrow('no space left on device');
        });

        it('should fail when home directory has restrictive permissions', async () => {
            // Simulates: ~/.demo-builder exists but user can't write to projects/
            const permissionError = new Error('EACCES: permission denied, mkdir');
            (permissionError as any).code = 'EACCES';

            (fs.writeFile as jest.Mock).mockResolvedValueOnce(undefined); // state.json succeeds
            (fs.mkdir as jest.Mock).mockRejectedValue(permissionError); // mkdir fails

            await expect(stateManager.saveProject(mockProject)).rejects.toThrow('permission denied');
        });

        it('should fail when network home directory becomes unavailable', async () => {
            // Simulates: Network mounted home directory disconnects mid-operation
            const networkError = new Error('EIO: i/o error');
            (networkError as any).code = 'EIO';

            (fs.writeFile as jest.Mock)
                .mockResolvedValueOnce(undefined) // state.json succeeds
                .mockRejectedValueOnce(networkError); // manifest fails (network issue)

            (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

            await expect(stateManager.saveProject(mockProject)).rejects.toThrow('i/o error');
        });
    });

    describe('Successful operations (no errors)', () => {
        it('should successfully save project when all operations succeed', async () => {
            (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
            (fs.mkdir as jest.Mock).mockResolvedValue(undefined);

            await expect(stateManager.saveProject(mockProject)).resolves.not.toThrow();
        });

        it('should successfully get projects when directory exists and is readable', async () => {
            const mockEntries = [
                { name: 'project-1', isDirectory: () => true },
                { name: 'project-2', isDirectory: () => true },
            ];

            (fs.readdir as jest.Mock).mockResolvedValue(mockEntries);
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.stat as jest.Mock).mockResolvedValue({
                mtime: new Date('2025-01-01'),
            });

            const result = await stateManager.getAllProjects();

            expect(result).toHaveLength(2);
            expect(result[0].name).toBe('project-1');
            expect(result[1].name).toBe('project-2');
        });
    });
});
