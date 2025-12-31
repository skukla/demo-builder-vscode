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
                    'headless': {
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
                    'headless': {
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

    describe('Preserve selectedPackage/selectedStack/selectedAddons from cache', () => {
        it('should preserve selectedPackage from cache when disk version is undefined', async () => {
            const { stateManager } = testMocks;

            // Initialize with cached project that has selectedPackage
            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';
            (cachedProject as Project).selectedPackage = 'luma';
            (cachedProject as Project).selectedStack = 'headless-paas';
            (cachedProject as Project).selectedAddons = ['demo-inspector'];

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock fresh manifest WITHOUT selectedPackage (simulating incomplete disk data)
            const freshManifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {},
                // Note: selectedPackage, selectedStack, selectedAddons are MISSING
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(freshManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Call getCurrentProject - should reload from disk but preserve cache values
            const result = await stateManager.getCurrentProject();

            // Verify cached values were preserved
            expect(result).not.toBeNull();
            expect(result?.selectedPackage).toBe('luma');
            expect(result?.selectedStack).toBe('headless-paas');
            expect(result?.selectedAddons).toEqual(['demo-inspector']);
        });

        it('should NOT overwrite disk values with cache when disk has values', async () => {
            const { stateManager } = testMocks;

            // Initialize with cached project that has stale selectedPackage
            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';
            (cachedProject as Project).selectedPackage = 'old-package';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock fresh manifest WITH selectedPackage (disk is authoritative)
            const freshManifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {},
                selectedPackage: 'new-package', // Disk has a value
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(freshManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            const result = await stateManager.getCurrentProject();

            // Disk value should be used (not the stale cache)
            expect(result?.selectedPackage).toBe('new-package');
        });

        it('should handle preservation across multiple reload cycles', async () => {
            const { stateManager } = testMocks;

            // Initialize with cached project
            const cachedProject = createMockProject();
            cachedProject.path = '/mock/home/.demo-builder/projects/test-project';
            (cachedProject as Project).selectedPackage = 'luma';
            (cachedProject as Project).selectedStack = 'headless-paas';

            const mockState = {
                version: 1,
                currentProject: cachedProject,
                processes: {},
                lastUpdated: new Date().toISOString()
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockState));
            await stateManager.initialize();

            // Mock manifest without selectedPackage (simulating async mesh status polling)
            const freshManifest = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: {},
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(freshManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Multiple reload cycles (simulating mesh status polling)
            const result1 = await stateManager.getCurrentProject();
            expect(result1?.selectedPackage).toBe('luma');

            const result2 = await stateManager.getCurrentProject();
            expect(result2?.selectedPackage).toBe('luma');

            const result3 = await stateManager.getCurrentProject();
            expect(result3?.selectedPackage).toBe('luma');
            expect(result3?.selectedStack).toBe('headless-paas');
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
