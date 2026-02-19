/**
 * Resource Cleanup Helpers Tests
 */

import { COMPONENT_IDS } from '@/core/constants';
import type { Project, ComponentInstance } from '@/types';
import type { StateManager } from '@/types/state';
import type { Logger } from '@/types/logger';
import type { DaLiveContentOperations } from '@/features/eds/services/daLiveContentOperations';
import {
    isEdsProject,
    extractEdsMetadata,
    getLinkedEdsProjects,
    deleteDaLiveSite,
    formatCleanupResults,
    summarizeCleanupResults,
    type EdsProjectMetadata,
    type CleanupResultItem,
} from '@/features/eds/services/resourceCleanupHelpers';

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

function createMockLogger(): Logger {
    return {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

// ==========================================================
// isEdsProject Tests
// ==========================================================

describe('isEdsProject', () => {
    it('should return true for project with eds-storefront component', () => {
        const project = createMockProject({
            componentInstances: {
                [COMPONENT_IDS.EDS_STOREFRONT]: createEdsComponentInstance(),
            },
        });

        expect(isEdsProject(project)).toBe(true);
    });

    it('should return false for project without eds-storefront component', () => {
        const project = createMockProject({
            componentInstances: {
                'other-component': {
                    id: 'other-component',
                    name: 'Other Component',
                    status: 'ready',
                },
            },
        });

        expect(isEdsProject(project)).toBe(false);
    });

    it('should return false for project with no componentInstances', () => {
        const project = createMockProject();
        delete project.componentInstances;

        expect(isEdsProject(project)).toBe(false);
    });

    it('should return false for project with empty componentInstances', () => {
        const project = createMockProject({
            componentInstances: {},
        });

        expect(isEdsProject(project)).toBe(false);
    });
});

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
            daLiveSite: undefined,
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
    function createMockStateManager(projects: Project[]): StateManager {
        return {
            getAllProjects: jest.fn().mockResolvedValue(
                projects.map(p => ({ name: p.name, path: p.path, lastModified: new Date() }))
            ),
            loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
                const project = projects.find(p => p.path === path);
                return Promise.resolve(project || null);
            }),
        } as unknown as StateManager;
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

        const stateManager = createMockStateManager([edsProject1, edsProject2]);

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

        const stateManager = createMockStateManager([edsProject, nonEdsProject]);

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('eds-project');
    });

    it('should return empty array when no projects exist', async () => {
        const stateManager = createMockStateManager([]);

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

        const stateManager = {
            getAllProjects: jest.fn().mockResolvedValue([
                { name: 'eds-project', path: '/path/to/eds', lastModified: new Date() },
                { name: 'broken-project', path: '/path/to/broken', lastModified: new Date() },
            ]),
            loadProjectFromPath: jest.fn().mockImplementation((path: string) => {
                if (path === '/path/to/eds') return Promise.resolve(edsProject);
                return Promise.resolve(null); // Broken project fails to load
            }),
        } as unknown as StateManager;

        const result = await getLinkedEdsProjects(stateManager);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('eds-project');
    });
});

// ==========================================================
// deleteDaLiveSite Tests
// ==========================================================

describe('deleteDaLiveSite', () => {
    function createMockContentOps(
        deleteResult: { success: boolean; deletedCount: number; deletedPaths: string[]; error?: string } | Error,
    ): DaLiveContentOperations {
        return {
            deleteAllSiteContent: jest.fn().mockImplementation(() => {
                if (deleteResult instanceof Error) {
                    return Promise.reject(deleteResult);
                }
                return Promise.resolve(deleteResult);
            }),
        } as unknown as DaLiveContentOperations;
    }

    it('should successfully delete DA.live site content recursively', async () => {
        const contentOps = createMockContentOps({
            success: true, deletedCount: 35, deletedPaths: ['/page1.html', '/page2.html'],
        });
        const logger = createMockLogger();

        const result = await deleteDaLiveSite(
            contentOps,
            'test-org',
            'test-site',
            logger,
        );

        expect(result.success).toBe(true);
        expect(result.daLiveDeleted).toBe(true);
        expect(result.alreadyDeleted).toBe(false);
        expect(contentOps.deleteAllSiteContent).toHaveBeenCalledWith('test-org', 'test-site');
    });

    it('should fail when DA.live deletion fails', async () => {
        const contentOps = createMockContentOps(new Error('Access denied'));
        const logger = createMockLogger();

        const result = await deleteDaLiveSite(
            contentOps,
            'test-org',
            'test-site',
            logger,
        );

        expect(result.success).toBe(false);
        expect(result.daLiveDeleted).toBe(false);
        expect(result.error).toContain('DA.live deletion failed');
    });

    it('should report site as already empty when deletedCount is 0', async () => {
        const contentOps = createMockContentOps({
            success: true, deletedCount: 0, deletedPaths: [],
        });
        const logger = createMockLogger();

        const result = await deleteDaLiveSite(
            contentOps,
            'test-org',
            'test-site',
            logger,
        );

        expect(result.success).toBe(true);
        expect(result.alreadyDeleted).toBe(true);
    });

    it('should handle partial deletion failure', async () => {
        const contentOps = createMockContentOps({
            success: false, deletedCount: 10, deletedPaths: [], error: 'Some files failed',
        });
        const logger = createMockLogger();

        const result = await deleteDaLiveSite(
            contentOps,
            'test-org',
            'test-site',
            logger,
        );

        expect(result.success).toBe(false);
        expect(result.daLiveDeleted).toBe(false);
    });
});

// ==========================================================
// formatCleanupResults Tests
// ==========================================================

describe('formatCleanupResults', () => {
    it('should format all successful results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'daLive', name: 'org/site', success: true },
            { type: 'helix', name: 'owner/repo', success: true },
        ];

        const formatted = formatCleanupResults(results);

        expect(formatted).toContain('✓ Cleaned up:');
        expect(formatted).toContain('GitHub repo');
        expect(formatted).toContain('DA.live site');
        expect(formatted).toContain('Helix CDN');
    });

    it('should format mixed results (success and failure)', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'daLive', name: 'org/site', success: false, error: 'Access denied' },
        ];

        const formatted = formatCleanupResults(results);

        expect(formatted).toContain('✓ Cleaned up:');
        expect(formatted).toContain('GitHub repo');
        expect(formatted).toContain('✗ Failed:');
        expect(formatted).toContain('DA.live site');
        expect(formatted).toContain('Access denied');
    });

    it('should format skipped results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'backend', name: 'commerce', success: false, skipped: true },
        ];

        const formatted = formatCleanupResults(results);

        expect(formatted).toContain('✓ Cleaned up:');
        expect(formatted).toContain('○ Skipped:');
        expect(formatted).toContain('Backend data');
    });

    it('should handle empty results', () => {
        const results: CleanupResultItem[] = [];

        const formatted = formatCleanupResults(results);

        expect(formatted).toBe('No cleanup operations performed.');
    });

    it('should format all failed results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: false, error: 'Token missing' },
            { type: 'daLive', name: 'org/site', success: false, error: 'Access denied' },
        ];

        const formatted = formatCleanupResults(results);

        expect(formatted).not.toContain('✓ Cleaned up:');
        expect(formatted).toContain('✗ Failed:');
        expect(formatted).toContain('Token missing');
        expect(formatted).toContain('Access denied');
    });
});

// ==========================================================
// summarizeCleanupResults Tests
// ==========================================================

describe('summarizeCleanupResults', () => {
    it('should summarize all successful results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'daLive', name: 'org/site', success: true },
        ];

        const summary = summarizeCleanupResults(results);

        expect(summary.total).toBe(2);
        expect(summary.succeeded).toBe(2);
        expect(summary.failed).toBe(0);
        expect(summary.skipped).toBe(0);
        expect(summary.message).toBe('Successfully cleaned up 2 resources.');
    });

    it('should summarize single successful result', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
        ];

        const summary = summarizeCleanupResults(results);

        expect(summary.succeeded).toBe(1);
        expect(summary.message).toBe('Successfully cleaned up 1 resource.');
    });

    it('should summarize mixed results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'daLive', name: 'org/site', success: false, error: 'Access denied' },
        ];

        const summary = summarizeCleanupResults(results);

        expect(summary.succeeded).toBe(1);
        expect(summary.failed).toBe(1);
        expect(summary.message).toBe('Cleaned up 1 resource, 1 failed.');
    });

    it('should summarize all failed results', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: false },
            { type: 'daLive', name: 'org/site', success: false },
        ];

        const summary = summarizeCleanupResults(results);

        expect(summary.succeeded).toBe(0);
        expect(summary.failed).toBe(2);
        expect(summary.message).toBe('Failed to clean up 2 resources.');
    });

    it('should count skipped separately from failures', () => {
        const results: CleanupResultItem[] = [
            { type: 'github', name: 'owner/repo', success: true },
            { type: 'backend', name: 'commerce', success: false, skipped: true },
        ];

        const summary = summarizeCleanupResults(results);

        expect(summary.succeeded).toBe(1);
        expect(summary.failed).toBe(0);
        expect(summary.skipped).toBe(1);
        expect(summary.message).toBe('Successfully cleaned up 1 resource.');
    });

    it('should handle empty results', () => {
        const results: CleanupResultItem[] = [];

        const summary = summarizeCleanupResults(results);

        expect(summary.total).toBe(0);
        expect(summary.message).toBe('No resources were cleaned up.');
    });
});
