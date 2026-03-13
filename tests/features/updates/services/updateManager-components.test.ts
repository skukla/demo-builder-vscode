/**
 * UpdateManager Test Suite - Component Updates
 *
 * Tests multi-project component update checking functionality:
 * - repoUrl fallback for components without resolver entry
 * - Multi-project repoUrl fallback (checkAllProjectsForUpdates)
 * - Resilience checks for missing paths
 * - Mixed resolver-known and repoUrl-only components
 *
 * Total tests: 3
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

    describe('multi-project component updates (checkAllProjectsForUpdates)', () => {
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
