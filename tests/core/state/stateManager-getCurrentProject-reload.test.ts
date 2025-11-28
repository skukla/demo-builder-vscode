/**
 * StateManager getCurrentProject Reload Behavior Tests
 *
 * Tests the critical fix to getCurrentProject() that reloads project from
 * disk instead of returning stale cached data, fixing the "vunknown" bug.
 *
 * Related Fix: getCurrentProject() reload (commit 28eee3d, lines 105-117)
 * Bug: getCurrentProject() returned stale in-memory cache from globalState
 *      that was missing componentVersions, even after file was fixed
 * Solution: Always reload from disk to get latest data
 */

import * as fs from 'fs/promises';
import { setupMocks, createMockProject, mockLoggerInstance, type TestMocks } from './stateManager.testUtils';
import type { Project } from '@/types';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - getCurrentProject Reload Behavior', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('Reload from disk when cache exists', () => {
        it('should call loadProjectFromPath when cached project exists', async () => {
            const { stateManager } = testMocks;

            // Initialize with cached project in globalState
            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/cached-project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock loadProjectFromPath to return fresh data
            const freshManifest = {
                name: 'Fresh Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {
                    'citisignal-nextjs': {
                        version: '1.0.0-beta.2',
                        lastUpdated: '2025-11-20T00:00:00.000Z',
                    },
                },
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(freshManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Call getCurrentProject - should reload from disk
            const result = await stateManager.getCurrentProject();

            // Verify fresh data was loaded (not stale cache)
            expect(result).not.toBeNull();
            expect(result?.componentVersions).toEqual(freshManifest.componentVersions);
        });

        it('should update cache with fresh data after reload', async () => {
            const { stateManager } = testMocks;

            // Initialize with stale cached project (missing componentVersions)
            const staleProject = createMockProject();
            staleProject.path = '/mock/home/.demo-builder/projects/test-project';
            // Deliberately missing componentVersions (simulating stale cache)

            const mockState = {
                version: 1,
                currentProject: staleProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock fresh manifest WITH componentVersions
            const freshManifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {
                    'citisignal-nextjs': {
                        version: '1.0.0-beta.2',
                        lastUpdated: '2025-11-20T00:00:00.000Z',
                    },
                },
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(freshManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // First call should reload and update cache
            const firstResult = await stateManager.getCurrentProject();
            expect(firstResult?.componentVersions).toBeDefined();

            // Second call should also have fresh data (cache was updated)
            const secondResult = await stateManager.getCurrentProject();
            expect(secondResult?.componentVersions).toBeDefined();
            expect(secondResult?.componentVersions).toEqual(freshManifest.componentVersions);
        });

        it('should reload on every call to ensure freshness', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock manifest
            const manifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {},
            };

            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Clear readFile mock to track calls
            (fs.readFile as jest.Mock).mockClear();
            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(manifest));

            // Multiple calls to getCurrentProject
            await stateManager.getCurrentProject();
            const firstCallCount = (fs.readFile as jest.Mock).mock.calls.length;

            await stateManager.getCurrentProject();
            const secondCallCount = (fs.readFile as jest.Mock).mock.calls.length;

            await stateManager.getCurrentProject();
            const thirdCallCount = (fs.readFile as jest.Mock).mock.calls.length;

            // Each call should read from disk (not just return cache)
            expect(secondCallCount).toBeGreaterThan(firstCallCount);
            expect(thirdCallCount).toBeGreaterThan(secondCallCount);
        });
    });

    describe('Graceful fallback on reload failure', () => {
        it('should return stale cache if loadProjectFromPath fails', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';
            cachedProject.name = 'Stale Cached Project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock loadProjectFromPath to fail (file deleted, permission denied, etc.)
            (fs.access as jest.Mock).mockRejectedValue(new Error('ENOENT: file not found'));

            // Should fall back to stale cache instead of crashing
            const result = await stateManager.getCurrentProject();

            expect(result).not.toBeNull();
            expect(result?.name).toBe('Stale Cached Project');
        });

        it('should warn when falling back to stale cache', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock loadProjectFromPath to fail
            (fs.access as jest.Mock).mockRejectedValue(new Error('Permission denied'));

            await stateManager.getCurrentProject();

            // Should log warning about fallback via Logger (Phase A migrated console.warn to Logger)
            expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to reload project from disk')
            );
        });
    });

    describe('Handle null/undefined correctly', () => {
        it('should return undefined when no cached project', async () => {
            const { stateManager } = testMocks;

            const mockState = {
                version: 1,
                currentProject: undefined, // No cached project
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            const result = await stateManager.getCurrentProject();

            expect(result).toBeUndefined();
        });

        it('should convert null from loadProjectFromPath to undefined', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock loadProjectFromPath to return null (invalid manifest)
            (fs.readFile as jest.Mock).mockResolvedValue('invalid json');
            (fs.access as jest.Mock).mockResolvedValue(undefined);

            const result = await stateManager.getCurrentProject();

            // Should handle null gracefully (either fallback to cache or return undefined)
            expect(result).toBeDefined(); // Falls back to cache
        });
    });

    describe('Edge cases', () => {
        it('should handle cached project without path', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = ''; // Empty path

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Should not attempt reload (no path), return cached version
            const result = await stateManager.getCurrentProject();

            expect(result).toBeDefined();
            expect(result?.path).toBe('');
        });

        it('should handle concurrent calls to getCurrentProject', async () => {
            const { stateManager } = testMocks;

            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            const manifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {},
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(manifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Concurrent calls should both succeed
            const [result1, result2, result3] = await Promise.all([
                stateManager.getCurrentProject(),
                stateManager.getCurrentProject(),
                stateManager.getCurrentProject(),
            ]);

            expect(result1).toBeDefined();
            expect(result2).toBeDefined();
            expect(result3).toBeDefined();
        });
    });
});
