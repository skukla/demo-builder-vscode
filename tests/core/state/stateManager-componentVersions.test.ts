/**
 * StateManager componentVersions Persistence Tests
 *
 * Tests that componentVersions field is properly saved to and loaded from
 * .demo-builder.json manifest, fixing the "vunknown" bug in update checks.
 *
 * Related Fix: componentVersions persistence (commit 28eee3d)
 * Bug: componentVersions was initialized in memory but never persisted,
 *      causing data loss on every save/reload cycle
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { setupMocks, mockStateFile, createMockProject, type TestMocks } from './stateManager.testUtils';
import type { Project } from '@/types';

// Re-declare mocks to ensure proper typing and hoisting
jest.mock('vscode');
jest.mock('fs/promises');
jest.mock('os');

describe('StateManager - componentVersions Persistence', () => {
    let testMocks: TestMocks;

    beforeEach(() => {
        testMocks = setupMocks();
    });

    describe('saveProject - componentVersions persistence', () => {
        it('should include componentVersions in .demo-builder.json manifest', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.componentVersions = {
                'citisignal-nextjs': {
                    version: '1.0.0-beta.2',
                    lastUpdated: '2025-11-20T00:00:00.000Z',
                },
                'commerce-mesh': {
                    version: '1.0.0-beta.1',
                    lastUpdated: '2025-11-20T00:00:00.000Z',
                },
            };

            await stateManager.saveProject(project as Project);

            // Find the .demo-builder.json write call
            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );

            expect(manifestCall).toBeDefined();

            // Verify componentVersions is included in manifest
            const manifestContent = JSON.parse(manifestCall![1] as string);
            expect(manifestContent.componentVersions).toBeDefined();
            expect(manifestContent.componentVersions['citisignal-nextjs']).toEqual({
                version: '1.0.0-beta.2',
                lastUpdated: '2025-11-20T00:00:00.000Z',
            });
            expect(manifestContent.componentVersions['commerce-mesh']).toEqual({
                version: '1.0.0-beta.1',
                lastUpdated: '2025-11-20T00:00:00.000Z',
            });
        });

        it('should persist componentVersions with various version formats', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.componentVersions = {
                'component-with-tag': {
                    version: '2.5.3',
                    lastUpdated: '2025-11-20T00:00:00.000Z',
                },
                'component-with-hash': {
                    version: 'abc123de',
                    lastUpdated: '2025-11-20T00:00:00.000Z',
                },
                'component-with-unknown': {
                    version: 'unknown',
                    lastUpdated: '2025-11-20T00:00:00.000Z',
                },
            };

            await stateManager.saveProject(project as Project);

            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );

            const manifestContent = JSON.parse(manifestCall![1] as string);
            expect(manifestContent.componentVersions['component-with-tag'].version).toBe('2.5.3');
            expect(manifestContent.componentVersions['component-with-hash'].version).toBe('abc123de');
            expect(manifestContent.componentVersions['component-with-unknown'].version).toBe('unknown');
        });

        it('should handle empty componentVersions object', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.componentVersions = {};

            await stateManager.saveProject(project as Project);

            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );

            const manifestContent = JSON.parse(manifestCall![1] as string);
            expect(manifestContent.componentVersions).toEqual({});
        });

        it('should handle undefined componentVersions (backward compatibility)', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const project = createMockProject();
            project.componentVersions = undefined;

            await stateManager.saveProject(project as Project);

            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );

            const manifestContent = JSON.parse(manifestCall![1] as string);
            // JSON.stringify() omits undefined values, which is correct
            // On load, this will default to {} via || operator
            expect('componentVersions' in manifestContent).toBe(false);
        });
    });

    describe('loadProjectFromPath - componentVersions loading', () => {
        it('should load componentVersions from .demo-builder.json', async () => {
            const { stateManager } = testMocks;
            const projectPath = '/mock/home/.demo-builder/projects/test-project';

            // Mock manifest file with componentVersions
            const manifestContent = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {
                    'citisignal-nextjs': {
                        id: 'citisignal-nextjs',
                        name: 'CitiSignal Next.js',
                        type: 'frontend',
                        status: 'ready',
                        lastUpdated: '2025-11-20T00:00:00.000Z',
                        version: '1.0.0-beta.2',
                    },
                },
                componentVersions: {
                    'citisignal-nextjs': {
                        version: '1.0.0-beta.2',
                        lastUpdated: '2025-11-20T00:00:00.000Z',
                    },
                },
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(manifestContent));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            const project = await stateManager.loadProjectFromPath(projectPath);

            expect(project).not.toBeNull();
            expect(project?.componentVersions).toBeDefined();
            expect(project?.componentVersions?.['citisignal-nextjs']).toEqual({
                version: '1.0.0-beta.2',
                lastUpdated: '2025-11-20T00:00:00.000Z',
            });
        });

        it('should default to empty object when componentVersions missing (backward compatibility)', async () => {
            const { stateManager } = testMocks;
            const projectPath = '/mock/home/.demo-builder/projects/old-project';

            // Mock OLD manifest file WITHOUT componentVersions field
            const manifestContent = {
                name: 'Old Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                // componentVersions field is MISSING (old project)
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(manifestContent));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            const project = await stateManager.loadProjectFromPath(projectPath);

            expect(project).not.toBeNull();
            // Should default to empty object (line 401: manifest.componentVersions || {})
            expect(project?.componentVersions).toEqual({});
        });

        it('should handle null componentVersions in manifest', async () => {
            const { stateManager } = testMocks;
            const projectPath = '/mock/home/.demo-builder/projects/test-project';

            const manifestContent = {
                name: 'Test Project',
                version: '1.0.0',
                created: '2025-11-20T00:00:00.000Z',
                lastModified: '2025-11-20T00:00:00.000Z',
                componentInstances: {},
                componentVersions: null, // Explicitly null
            };

            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(manifestContent));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            const project = await stateManager.loadProjectFromPath(projectPath);

            expect(project).not.toBeNull();
            // Should fallback to empty object
            expect(project?.componentVersions).toEqual({});
        });
    });

    describe('componentVersions round-trip (save → load)', () => {
        it('should preserve componentVersions through save and reload cycle', async () => {
            const { stateManager } = testMocks;
            await stateManager.initialize();

            const originalProject = createMockProject();
            originalProject.componentVersions = {
                'comp-a': { version: '1.0.0', lastUpdated: '2025-11-20T00:00:00.000Z' },
                'comp-b': { version: 'abc123de', lastUpdated: '2025-11-20T00:00:00.000Z' },
            };

            // Save project
            await stateManager.saveProject(originalProject as Project);

            // Capture what was written to .demo-builder.json
            const manifestCall = (fs.writeFile as jest.Mock).mock.calls.find(
                call => typeof call[0] === 'string' && call[0].endsWith('.demo-builder.json')
            );
            const savedManifest = JSON.parse(manifestCall![1] as string);

            // Mock loadProjectFromPath to read the saved manifest
            (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(savedManifest));
            (fs.access as jest.Mock).mockResolvedValue(undefined);
            (fs.readdir as jest.Mock).mockResolvedValue([]);

            // Load project back
            expect(originalProject.path).toBeDefined();
            const loadedProject = await stateManager.loadProjectFromPath(originalProject.path!);

            // Verify componentVersions survived the round trip
            expect(loadedProject).not.toBeNull();
            expect(loadedProject?.componentVersions).toEqual(originalProject.componentVersions);
        });
    });
});
