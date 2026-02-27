/**
 * UpdateManager Test Suite - Component Updates
 *
 * Tests component update checking functionality:
 * - Multi-component update checking
 * - Version detection for components
 * - Handling unknown components
 * - Unknown version handling
 * - Zipball URL usage
 * - Missing component instances
 * - repoUrl fallback for components without resolver entry
 * - Multi-project repoUrl fallback (checkAllProjectsForUpdates)
 *
 * Total tests: 13
 */

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
    },
}), { virtual: true });

// Mock Logger
jest.mock('@/core/logging', () => ({
    Logger: jest.fn().mockImplementation(() => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })),
}));

// Mock timeoutConfig - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000, // Fast operations (replaces UPDATE_CHECK)
    },
}));

// Mock security validation
jest.mock('@/core/validation', () => ({
    validateGitHubDownloadURL: jest.fn().mockReturnValue(true),
    sanitizeErrorForLogging: jest.fn((msg: string) => msg),
}));

// Mock fs/promises for checkAllProjectsForUpdates (which checks component paths)
jest.mock('fs/promises', () => ({
    access: jest.fn().mockResolvedValue(undefined),
}));

// Mock ComponentRepositoryResolver to avoid loading actual components.json
jest.mock('@/features/updates/services/componentRepositoryResolver', () => ({
    ComponentRepositoryResolver: jest.fn().mockImplementation(() => ({
        getRepositoryInfo: jest.fn((componentId: string) => {
            const knownComponents: Record<string, any> = {
                'headless': {
                    id: 'headless',
                    repository: 'skukla/citisignal-nextjs',
                    name: 'Headless Commerce',
                },
                'commerce-mesh': {
                    id: 'commerce-mesh',
                    repository: 'skukla/headless-citisignal-mesh',
                    name: 'Commerce Mesh',
                },
            };
            return Promise.resolve(knownComponents[componentId] || null);
        }),
        getAllRepositories: jest.fn(() => Promise.resolve(new Map())),
        clearCache: jest.fn(),
        extractRepositoryFromUrl: jest.fn((url: string) => {
            const cleanUrl = url.replace(/\.git$/, '');
            const match = cleanUrl.match(/github\.com\/([a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+)/);
            return match?.[1] || null;
        }),
    })),
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

import { UpdateManager } from '@/features/updates/services/updateManager';
import * as vscode from 'vscode';
import {
    createMockContext,
    createMockLogger,
    createMockWorkspaceConfig,
    createMockProject,
    createMockRelease,
    mockSecurityValidationPass,
} from './updateManager.testUtils';

describe('UpdateManager - Component Updates', () => {
    let updateManager: UpdateManager;
    let mockContext: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = createMockContext('1.0.0');
        mockLogger = createMockLogger();

        // Setup workspace config
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
            createMockWorkspaceConfig('stable')
        );

        updateManager = new UpdateManager(mockContext, mockLogger);
    });

    describe('component update checking', () => {
        it('should check updates for all components', async () => {
            // NOTE: Component IDs must match keys in components.json (e.g., 'headless', not 'citisignal-nextjs')
            const mockProject = createMockProject([
                { id: 'headless', version: '1.0.0' },
                { id: 'commerce-mesh', version: '1.0.0' },
            ]);

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(2);
            expect(results.get('headless')?.hasUpdate).toBe(true);
            expect(results.get('commerce-mesh')?.hasUpdate).toBe(true);
        });

        it('should handle components without repos', async () => {
            const mockProject = createMockProject([
                { id: 'unknown-component', version: '1.0.0' },
            ]);

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(0);
        });

        it('should treat unknown version as needing update', async () => {
            const mockProject = createMockProject([
                { id: 'headless', version: 'unknown' },
            ]);

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.get('headless')?.hasUpdate).toBe(true);
        });

        it('should use zipball_url for component downloads', async () => {
            const mockProject = createMockProject([
                { id: 'headless', version: '1.0.0' },
            ]);

            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                zipball_url: 'https://api.github.com/repos/test/repo/zipball/v1.1.0',
                assets: [],
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            const releaseInfo = results.get('headless')?.releaseInfo;
            expect(releaseInfo?.downloadUrl).toBe('https://api.github.com/repos/test/repo/zipball/v1.1.0');
        });

        it('should return empty map for project without components', async () => {
            const mockProject = {
                componentInstances: undefined,
            };

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(0);
        });

        it('should handle components with missing version info', async () => {
            const mockProject = {
                componentInstances: {
                    'headless': { id: 'headless' },
                },
                componentVersions: {
                    // Missing version for headless
                },
            };

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            // Should still check for update even without version info
            expect(results.size).toBe(1);
        });
    });

    describe('repoUrl fallback for components without resolver entry', () => {
        it('should use componentInstance.repoUrl when resolver returns null', async () => {
            // Given: A component not in the resolver (no source in components.json)
            // but with repoUrl stored on the component instance from installation
            const mockProject = createMockProject([
                { id: 'eds-storefront', version: '1.0.0', repoUrl: 'https://github.com/skukla/citisignal-eds' },
            ]);

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            // When: checking for component updates
            const results = await updateManager.checkComponentUpdates(mockProject as any);

            // Then: should detect the update via repoUrl fallback
            expect(results.size).toBe(1);
            expect(results.get('eds-storefront')?.hasUpdate).toBe(true);
            expect(results.get('eds-storefront')?.latest).toBe('1.1.0');
        });

        it('should still skip components with no resolver entry and no repoUrl', async () => {
            // Given: A component with neither resolver entry nor repoUrl
            const mockProject = createMockProject([
                { id: 'unknown-component', version: '1.0.0' },
            ]);

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            // Then: should skip (no fallback available)
            expect(results.size).toBe(0);
        });

        it('should use repoUrl fallback alongside resolver-known components', async () => {
            // Given: Mix of resolver-known and repoUrl-only components
            const mockProject = createMockProject([
                { id: 'commerce-mesh', version: '1.0.0' },
                { id: 'eds-storefront', version: '1.0.0', repoUrl: 'https://github.com/skukla/citisignal-eds' },
            ]);

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            // Then: both components should get update checks
            expect(results.size).toBe(2);
            expect(results.get('commerce-mesh')?.hasUpdate).toBe(true);
            expect(results.get('eds-storefront')?.hasUpdate).toBe(true);
        });

        it('should skip repoUrl fallback when URL is not a GitHub URL', async () => {
            // Given: A component with a non-GitHub repoUrl
            const mockProject = createMockProject([
                { id: 'custom-component', version: '1.0.0', repoUrl: 'https://gitlab.com/org/repo' },
            ]);

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            // Then: should skip (URL parsing returns null for non-GitHub URLs)
            expect(results.size).toBe(0);
        });
    });

    describe('multi-project repoUrl fallback (checkAllProjectsForUpdates)', () => {
        it('should use repoUrl fallback when checking across multiple projects', async () => {
            // Given: Two projects with a repoUrl-only component
            const project1 = {
                name: 'Project 1',
                ...createMockProject([
                    { id: 'eds-storefront', version: '1.0.0', repoUrl: 'https://github.com/skukla/citisignal-eds', path: '/mock/path/eds' },
                ]),
            };
            const project2 = {
                name: 'Project 2',
                ...createMockProject([
                    { id: 'eds-storefront', version: '0.9.0', repoUrl: 'https://github.com/skukla/citisignal-eds', path: '/mock/path/eds2' },
                ]),
            };

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            // When: checking all projects for updates
            const results = await updateManager.checkAllProjectsForUpdates([project1, project2] as any);

            // Then: should detect update for the repoUrl-only component
            expect(results.length).toBe(1);
            expect(results[0].componentId).toBe('eds-storefront');
            expect(results[0].latestVersion).toBe('1.1.0');
            expect(results[0].outdatedProjects.length).toBe(2);
        });

        it('should skip repoUrl-only components without paths in multi-project check', async () => {
            // Given: A component with repoUrl but no path (should be skipped by resilience check)
            const project = {
                name: 'Project 1',
                ...createMockProject([
                    { id: 'eds-storefront', version: '1.0.0', repoUrl: 'https://github.com/skukla/citisignal-eds' },
                ]),
            };

            const results = await updateManager.checkAllProjectsForUpdates([project] as any);

            // Then: should skip (no path registered)
            expect(results.length).toBe(0);
        });

        it('should handle mix of resolver-known and repoUrl-only in multi-project', async () => {
            // Given: A project with both resolver-known and repoUrl-only components
            const project = {
                name: 'Project 1',
                ...createMockProject([
                    { id: 'commerce-mesh', version: '1.0.0', path: '/mock/path/mesh' },
                    { id: 'eds-storefront', version: '1.0.0', repoUrl: 'https://github.com/skukla/citisignal-eds', path: '/mock/path/eds' },
                ]),
            };

            const mockRelease = createMockRelease({
                version: '1.1.0',
                assetType: 'zipball',
            });

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            const results = await updateManager.checkAllProjectsForUpdates([project] as any);

            // Then: both components should have updates detected
            expect(results.length).toBe(2);
            const componentIds = results.map(r => r.componentId);
            expect(componentIds).toContain('commerce-mesh');
            expect(componentIds).toContain('eds-storefront');
        });
    });
});
