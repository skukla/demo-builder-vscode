import { UpdateManager } from '@/features/updates/services/updateManager';
import * as vscode from 'vscode';

/**
 * UpdateManager Test Suite
 *
 * Tests update checking via GitHub Releases API:
 * - Extension update checking
 * - Component update checking
 * - Version comparison
 * - Channel selection (stable/beta)
 * - GitHub API error handling
 * - Rate limiting
 * - Security validation
 *
 * Total tests: 22
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
jest.mock('@/core/validation/securityValidation', () => ({
    validateGitHubDownloadURL: jest.fn(),
}));

// Mock global fetch
global.fetch = jest.fn() as jest.Mock;

describe('UpdateManager', () => {
    let updateManager: UpdateManager;
    let mockContext: any;
    let mockLogger: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock context
        mockContext = {
            extension: {
                packageJSON: {
                    version: '1.0.0',
                },
            },
        };

        // Mock logger
        mockLogger = {
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        };

        // Mock workspace config
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((key: string, defaultValue: any) => {
                if (key === 'demoBuilder.updateChannel') return 'stable';
                return defaultValue;
            }),
        });

        updateManager = new UpdateManager(mockContext, mockLogger);
    });

    describe('extension update checking', () => {
        it('should detect available extension update', async () => {
            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://github.com/test/repo/releases/download/v1.1.0/extension.vsix',
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(true);
            expect(result.latest).toBe('1.1.0');
            expect(result.current).toBe('1.0.0');
            expect(result.releaseInfo).toBeDefined();
        });

        it('should detect no update when versions match', async () => {
            const mockRelease = {
                tag_name: 'v1.0.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://github.com/test/repo/releases/download/v1.0.0/extension.vsix',
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
            expect(result.latest).toBe('1.0.0');
        });

        it('should handle GitHub API 404', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 404,
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
            expect(result.current).toBe('1.0.0');
            expect(result.latest).toBe('1.0.0');
        });

        it('should handle GitHub rate limit (403)', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 403,
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle GitHub server errors (5xx)', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: false,
                status: 500,
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle network timeouts', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network timeout'));

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
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

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {
                throw new Error('Invalid URL');
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });
    });

    describe('component update checking', () => {
        it('should check updates for all components', async () => {
            const mockProject = {
                componentInstances: {
                    'citisignal-nextjs': { id: 'citisignal-nextjs' },
                    'commerce-mesh': { id: 'commerce-mesh' },
                },
                componentVersions: {
                    'citisignal-nextjs': { version: '1.0.0' },
                    'commerce-mesh': { version: '1.0.0' },
                },
            };

            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                zipball_url: 'https://api.github.com/repos/test/repo/zipball/v1.1.0',
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(2);
            expect(results.get('citisignal-nextjs')?.hasUpdate).toBe(true);
            expect(results.get('commerce-mesh')?.hasUpdate).toBe(true);
        });

        it('should handle components without repos', async () => {
            const mockProject = {
                componentInstances: {
                    'unknown-component': { id: 'unknown-component' },
                },
                componentVersions: {
                    'unknown-component': { version: '1.0.0' },
                },
            };

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(0);
        });

        it('should treat unknown version as needing update', async () => {
            const mockProject = {
                componentInstances: {
                    'citisignal-nextjs': { id: 'citisignal-nextjs' },
                },
                componentVersions: {
                    'citisignal-nextjs': { version: 'unknown' },
                },
            };

            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                zipball_url: 'https://api.github.com/repos/test/repo/zipball/v1.1.0',
            };

            (global.fetch as jest.Mock).mockResolvedValue({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.get('citisignal-nextjs')?.hasUpdate).toBe(true);
        });

        it('should use zipball_url for component downloads', async () => {
            const mockProject = {
                componentInstances: {
                    'citisignal-nextjs': { id: 'citisignal-nextjs' },
                },
                componentVersions: {
                    'citisignal-nextjs': { version: '1.0.0' },
                },
            };

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

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            const releaseInfo = results.get('citisignal-nextjs')?.releaseInfo;
            expect(releaseInfo?.downloadUrl).toBe('https://api.github.com/repos/test/repo/zipball/v1.1.0');
        });
    });

    describe('channel selection', () => {
        it('should use stable channel by default', async () => {
            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://github.com/test/repo/releases/download/v1.1.0/extension.vsix',
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            await updateManager.checkExtensionUpdate();

            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('/releases/latest'),
                expect.any(Object)
            );
        });

        it('should use beta channel when configured', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn((key: string) => {
                    if (key === 'updateChannel') return 'beta';
                    return 'stable';
                }),
            });

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

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const betaManager = new UpdateManager(mockContext, mockLogger);
            const result = await betaManager.checkExtensionUpdate();

            expect(result.latest).toBe('1.2.0-beta.1');
            expect(result.releaseInfo?.isPrerelease).toBe(true);
        });

        it('should filter out draft releases in beta channel', async () => {
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
                get: jest.fn(() => 'beta'),
            });

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

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const betaManager = new UpdateManager(mockContext, mockLogger);
            const result = await betaManager.checkExtensionUpdate();

            expect(result.latest).toBe('1.2.0-beta.1');
        });
    });

    describe('version comparison', () => {
        it('should compare semantic versions correctly', async () => {
            mockContext.extension.packageJSON.version = '1.0.0';

            const mockRelease = {
                tag_name: 'v1.0.1',
                body: 'Patch release',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://github.com/test/repo/releases/download/v1.0.1/extension.vsix',
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(true);
        });

        it('should handle beta version comparison', async () => {
            mockContext.extension.packageJSON.version = '1.0.0-beta.5';

            const mockRelease = {
                tag_name: 'v1.0.0-beta.6',
                body: 'Beta release',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: true,
                assets: [
                    {
                        name: 'extension.vsix',
                        browser_download_url: 'https://github.com/test/repo/releases/download/v1.0.0-beta.6/extension.vsix',
                    },
                ],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const { validateGitHubDownloadURL } = require('@/core/validation/securityValidation');
            validateGitHubDownloadURL.mockImplementation(() => {});

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

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const result = await updateManager.checkExtensionUpdate();

            // Should not crash, should return no update
            expect(result.hasUpdate).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle missing assets in release', async () => {
            const mockRelease = {
                tag_name: 'v1.1.0',
                body: 'Release notes',
                published_at: '2024-01-01T00:00:00Z',
                prerelease: false,
                assets: [],
            };

            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => mockRelease,
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should handle "Not Found" message in response', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Not Found' }),
            });

            const result = await updateManager.checkExtensionUpdate();

            expect(result.hasUpdate).toBe(false);
        });

        it('should return empty map for project without components', async () => {
            const mockProject = {
                componentInstances: undefined,
            };

            const results = await updateManager.checkComponentUpdates(mockProject as any);

            expect(results.size).toBe(0);
        });
    });
});
