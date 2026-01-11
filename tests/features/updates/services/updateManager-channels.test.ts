/**
 * UpdateManager Test Suite - Update Channels
 *
 * Tests stable vs beta channel functionality:
 * - Stable channel (default)
 * - Beta channel configuration
 * - Draft release filtering
 * - Prerelease handling
 * - Channel-specific API endpoints
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
    validateGitHubDownloadURL: jest.fn(),
    sanitizeErrorForLogging: jest.fn((msg: string) => msg),
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
    mockSecurityValidationPass,
} from './updateManager.testUtils';

describe('UpdateManager - Update Channels', () => {
    let mockContext: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockContext = createMockContext('1.0.0');
        mockLogger = createMockLogger();
    });

    describe('channel selection', () => {
        it('should use stable channel by default', async () => {
            // Setup stable channel config
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('stable')()
            );

            const updateManager = new UpdateManager(mockContext, mockLogger);

            const mockRelease = createMockRelease({ version: '1.1.0' });
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            mockSecurityValidationPass();

            await updateManager.checkExtensionUpdate();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/releases/latest'),
                expect.any(Object)
            );
        });

        it('should use beta channel when configured', async () => {
            // Setup beta channel config
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('beta')()
            );

            const mockReleases = [
                {
                    tag_name: 'v1.2.0-beta.1',
                    body: 'Beta release',
                    published_at: '2024-01-02T00:00:00Z',
                    prerelease: true,
                    draft: false,
                    assets: [
                        {
                            name: 'extension.vsix',
                            browser_download_url: 'https://github.com/test/repo/releases/download/v1.2.0-beta.1/extension.vsix',
                        },
                    ],
                },
                {
                    tag_name: 'v1.1.0',
                    body: 'Stable release',
                    published_at: '2024-01-01T00:00:00Z',
                    prerelease: false,
                    draft: false,
                    assets: [
                        {
                            name: 'extension.vsix',
                            browser_download_url: 'https://github.com/test/repo/releases/download/v1.1.0/extension.vsix',
                        },
                    ],
                },
            ];

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockReleases,
            });

            mockSecurityValidationPass();

            const betaManager = new UpdateManager(mockContext, mockLogger);
            const result = await betaManager.checkExtensionUpdate();

            expect(result.latest).toBe('1.2.0-beta.1');
            expect(result.releaseInfo?.isPrerelease).toBe(true);
        });

        it('should filter out draft releases in beta channel', async () => {
            // Setup beta channel config
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
                createMockWorkspaceConfig('beta')()
            );

            const mockReleases = [
                {
                    tag_name: 'v1.3.0-draft',
                    draft: true,
                    prerelease: true,
                },
                {
                    tag_name: 'v1.2.0-beta.1',
                    draft: false,
                    prerelease: true,
                    body: 'Beta release',
                    published_at: '2024-01-02T00:00:00Z',
                    assets: [
                        {
                            name: 'extension.vsix',
                            browser_download_url: 'https://github.com/test/repo/releases/download/v1.2.0-beta.1/extension.vsix',
                        },
                    ],
                },
            ];

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockReleases,
            });

            mockSecurityValidationPass();

            const betaManager = new UpdateManager(mockContext, mockLogger);
            const result = await betaManager.checkExtensionUpdate();

            expect(result.latest).toBe('1.2.0-beta.1');
        });
    });
});
