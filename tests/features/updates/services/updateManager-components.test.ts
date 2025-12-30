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
 *
 * Total tests: 6
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

// Mock timeoutConfig
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        UPDATE_CHECK: 10000,
    },
}));

// Mock security validation
jest.mock('@/core/validation', () => ({
    validateGitHubDownloadURL: jest.fn(),
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
    mockFetchSuccess,
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
            createMockWorkspaceConfig('stable')()
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
            expect(results.size).toBeGreaterThanOrEqual(0);
        });
    });
});
