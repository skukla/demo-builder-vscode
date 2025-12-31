/**
 * UpdateManager Test Suite - Update Checking
 *
 * Tests extension update checking functionality:
 * - Version detection and comparison
 * - GitHub API error handling
 * - Rate limiting (403)
 * - Network timeouts
 * - Security validation
 * - Edge cases (missing assets, invalid versions)
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
    createMockRelease,
    mockFetchSuccess,
    mockFetchError,
    mockFetchNetworkError,
    mockSecurityValidationPass,
    mockSecurityValidationFail,
} from './updateManager.testUtils';

describe('UpdateManager - Update Checking', () => {
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

    describe('extension update detection', () => {
        it('should detect available extension update', async () => {
            const mockRelease = createMockRelease({ version: '1.1.0' });
            mockFetchSuccess(mockRelease);
            mockSecurityValidationPass();

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(true);
            expect(result.latest).toBe('1.1.0');
            expect(result.current).toBe('1.0.0');
            expect(result.releaseInfo).toBeDefined();
        });

        it('should detect no update when versions match', async () => {
            const mockRelease = createMockRelease({ version: '1.0.0' });
            mockFetchSuccess(mockRelease);
            mockSecurityValidationPass();

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
            expect(result.latest).toBe('1.0.0');
        });

        it('should validate download URL before returning', async () => {
            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://malicious-site.com/extension.vsix',
                    },
                ],
            };

            mockFetchSuccess(mockRelease);
            mockSecurityValidationFail();

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });
    });

    describe('GitHub API error handling', () => {
        it('should handle GitHub API 404', async () => {
            mockFetchError(404);

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
            expect(result.current).toBe('1.0.0');
            expect(result.latest).toBe('1.0.0');
        });

        it('should handle GitHub rate limit (403)', async () => {
            mockFetchError(403);

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle GitHub server errors (5xx)', async () => {
            mockFetchError(500);

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle network timeouts', async () => {
            mockFetchNetworkError('Network timeout');

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle "Not Found" message in response', async () => {
            mockFetchSuccess({ message: 'Not Found' });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });
    });

    describe('version comparison', () => {
        it('should compare semantic versions correctly', async () => {
            mockContext.extension.packageJSON.version = '1.0.0';

            const mockRelease = createMockRelease({ version: '1.0.1' });
            mockFetchSuccess(mockRelease);
            mockSecurityValidationPass();

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(true);
        });

        it('should handle beta version comparison', async () => {
            mockContext.extension.packageJSON.version = '1.0.0-beta.5';

            const mockRelease = createMockRelease({
                version: '1.0.0-beta.6',
                prerelease: true,
            });
            mockFetchSuccess(mockRelease);
            mockSecurityValidationPass();

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(true);
        });

        it('should handle invalid version formats', async () => {
            const mockRelease = {
                tag_name: 'invalid-version',
                body: 'Invalid release',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [],
            };

            mockFetchSuccess(mockRelease);

            const result = await updateManager.checkExtensionUpdate();

            // Should not crash, should return no update
            expect(result.hasUpdate).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle missing assets in release', async () => {
            const mockRelease = createMockRelease({
                version: '1.1.0',
                hasAssets: false,
            });
            mockFetchSuccess(mockRelease);

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });
    });
});
