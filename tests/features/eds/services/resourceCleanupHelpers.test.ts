/**
 * Resource Cleanup Helpers Tests
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { ComponentInstance, Project } from '@/types/base';
import type { StateManager } from '@/types/state';
import {
    extractEdsMetadata,
    getLinkedEdsProjects,
} from '@/features/eds/services/resourceCleanupHelpers';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

// ==========================================================
// Test Helpers
// ==========================================================

function createMockProject(overrides: Partial<Project> = {}): Project {
    return {
        name: 'test-project',
        path: '/path/to/project',
        status: 'ready',
        created: new Date(),
        lastModified: new Date(),
        ...overrides,
    };
}

function createEdsComponentInstance(metadata?: Record<string, unknown>): ComponentInstance {
    return {
        id: COMPONENT_IDS.EDS_STOREFRONT,
        name: 'EDS Storefront',
        status: 'ready',
        metadata,
    };
}

// ==========================================================
// extractEdsMetadata Tests
// ==========================================================

describe('extractEdsMetadata', () => {
    it('should extract full EDS metadata from project', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                    backendType: 'commerce',
                }),
            },
        });

        const metadata = extractEdsMetadata(project);

        expect(metadata).toEqual({
            githubRepo: 'owner/repo',
            daLiveOrg: 'test-org',
            daLiveSite: 'test-site',
            backendType: 'commerce',
        });
    });

    it('should return partial metadata when some fields are missing', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo',
                    daLiveOrg: 'test-org',
                    // daLiveSite is missing
                }),
            },
        });

        const metadata = extractEdsMetadata(project);

        expect(metadata).toEqual({
            githubRepo: 'owner/repo',
            daLiveOrg: 'test-org',
            // Repo-name fallback: the loader strips a daLiveSite equal to the
            // repo name, so an absent field means "same as the repo" — without
            // this, deleting a migrated project skipped the DA site cleanup.
            daLiveSite: 'repo',
            backendType: undefined,
        });
    });

    it('should return null for non-EDS project', () => {
        const project = createMockProject({
            componentInstances: {
                'other-component': {
                    id: 'other-component',
                    name: 'Other Component',
                    status: 'ready',
                },
            },
        });

        const metadata = extractEdsMetadata(project);

        expect(metadata).toBeNull();
    });

    it('should return null for project with no componentInstances', () => {
        const project = createMockProject();
        delete project.componentInstances;

        const metadata = extractEdsMetadata(project);

        expect(metadata).toBeNull();
    });

    it('should handle EDS component with no metadata', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance(undefined),
            },
        });

        const metadata = extractEdsMetadata(project);

        expect(metadata).toEqual({
            githubRepo: undefined,
            daLiveOrg: undefined,
            daLiveSite: undefined,
            backendType: undefined,
        });
    });

    it('should correctly extract ACO backend type', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo',
                    backendType: 'aco',
                }),
            },
        });

        const metadata = extractEdsMetadata(project);

        expect(metadata?.backendType).toBe('aco');
    });
});

// ==========================================================
// getLinkedEdsProjects Tests
// ==========================================================

describe('getLinkedEdsProjects', () => {
    // Renamed from `createMockStateManager` on 2026-09-01: it shadowed the
    // canonical builder it now delegates to, and its real subject is the project
    // list, not the state manager.
    function stateManagerWithProjects(projects: Project[]): StateManager {
        return createMockStateManager({
            getAllProjects: jest.fn().mockResolvedValue(
                projects.map(p => ({ name: p.name, path: p.path, lastModified: new Date() }))
            ),
            loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
                const project = projects.find(p => p.path === path);
                return Promise.resolve(project || null);
            }),
        });
    }

    it('should return all EDS projects with metadata', async () => {
        const edsProject1 = createMockProject({
            name: 'eds-project-1',
            path: '/path/to/eds1',
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo1',
                    daLiveOrg: 'org1',
                    daLiveSite: 'site1',
                }),
            },
        });

        const edsProject2 = createMockProject({
            name: 'eds-project-2',
            path: '/path/to/eds2',
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo2',
                    daLiveOrg: 'org2',
                    daLiveSite: 'site2',
                }),
            },
        });

        const stateManager = stateManagerWithProjects([edsProject1, edsProject2]);

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({
            name: 'eds-project-1',
            path: '/path/to/eds1',
            metadata: {
                githubRepo: 'owner/repo1',
                daLiveOrg: 'org1',
                daLiveSite: 'site1',
                backendType: undefined,
            },
        });
    });

    it('loads each project read-only, with no catalog to resolve against', async () => {
        // A listing must not rewrite state on the way past, and it has no
        // component catalog to hand the loader — both are arguments, and both
        // are invisible to any assertion about what came back.
        const edsProject = createMockProject({
            name: 'eds-project-1',
            path: '/path/to/eds1',
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo1',
                }),
            },
        });
        const stateManager = stateManagerWithProjects([edsProject]);

        await getLinkedEdsProjects(stateManager);

        const call = (stateManager.loadProjectFromPath as jest.Mock).mock.calls[0];
        expect(call[0]).toBe('/path/to/eds1');
        expect(call[1]()).toStrictEqual([]);
        expect(call[2]).toEqual({ persistAfterLoad: false });
    });

    it('should exclude non-EDS projects', async () => {
        const edsProject = createMockProject({
            name: 'eds-project',
            path: '/path/to/eds',
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo',
                }),
            },
        });

        const nonEdsProject = createMockProject({
            name: 'non-eds-project',
            path: '/path/to/non-eds',
            componentInstances: {
                'headless': {
                    id: 'headless',
                    name: 'Headless',
                    status: 'ready',
                },
            },
        });

        const stateManager = stateManagerWithProjects([edsProject, nonEdsProject]);

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('eds-project');
    });

    it('should return empty array when no projects exist', async () => {
        const stateManager = stateManagerWithProjects([]);

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(0);
    });

    it('should handle projects that fail to load', async () => {
        const edsProject = createMockProject({
            name: 'eds-project',
            path: '/path/to/eds',
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance({
                    githubRepo: 'owner/repo',
                }),
            },
        });

        const stateManager = createMockStateManager({
            getAllProjects: jest.fn().mockResolvedValue([
                { name: 'eds-project', path: '/path/to/eds', lastModified: new Date() },
                { name: 'broken-project', path: '/path/to/broken', lastModified: new Date() },
            ]),
            loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
                if (path === '/path/to/eds') return Promise.resolve(edsProject);
                return Promise.resolve(null); // Broken project fails to load
            }),
        });

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('eds-project');
    });
});
