/**
 * Shared test utilities for UpdateManager tests
 *
 * Provides:
 * - Mock factories
 * - Common setup helpers
 * - Reusable test data
 *
 * NOTE: Jest mocks must be defined in each test file, not here.
 * This file only exports helper functions.
 */

/**
 * Creates a mock context with extension package info
 */
export function createMockContext(version: string = '1.0.0'): any {
    return {
        extensionPath: '/mock/extension/path',
        extension: {
            packageJSON: {
                version,
            },
        },
    };
}

/**
 * Creates a mock logger instance
 */
export function createMockLogger(): any {
    return {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    };
}

/**
 * Creates a mock workspace configuration object
 */
export function createMockWorkspaceConfig(updateChannel: string = 'stable') {
    return {
        get: jest.fn((key: string, defaultValue?: any) => {
            if (key === 'demoBuilder.updateChannel' || key === 'updateChannel') {
                return updateChannel;
            }
            return defaultValue;
        }),
    };
}

/**
 * Creates a mock GitHub release object
 */
export function createMockRelease(options: {
    version: string;
    prerelease?: boolean;
    draft?: boolean;
    hasAssets?: boolean;
    assetType?: 'vsix' | 'zipball';
}): any {
    const { version, prerelease = false, draft = false, hasAssets = true, assetType = 'vsix' } = options;

    const release: any = {
        tag_name: `v${version}`,
        body: `Release notes for ${version}`,
        published_at: '2024-01-01T00:00:00Z',
        prerelease,
        draft,
    };

    if (hasAssets) {
        if (assetType === 'vsix') {
            release.assets = [
                {
                    name: 'extension.vsix',
                    browser_download_url: `https://github.com/test/repo/releases/download/v${version}/extension.vsix`,
                },
            ];
        } else if (assetType === 'zipball') {
            release.assets = [];
            release.zipball_url = `https://api.github.com/repos/test/repo/zipball/v${version}`;
        }
    } else {
        release.assets = [];
    }

    return release;
}

/**
 * Creates a mock project with components
 */
export function createMockProject(components: { id: string; version: string; repoUrl?: string; path?: string; name?: string }[]): any {
    const componentInstances: any = {};
    const componentVersions: any = {};

    components.forEach(comp => {
        componentInstances[comp.id] = {
            id: comp.id,
            ...(comp.repoUrl && { repoUrl: comp.repoUrl }),
            ...(comp.path && { path: comp.path }),
            ...(comp.name && { name: comp.name }),
        };
        componentVersions[comp.id] = { version: comp.version };
    });

    return {
        componentInstances,
        componentVersions,
    };
}

/**
 * Mocks a successful fetch response
 */
export function mockFetchSuccess(data: any): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => data,
    });
}

/**
 * Mocks a fetch error response
 */
export function mockFetchError(status: number): void {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status,
    });
}

/**
 * Mocks a fetch network error
 */
export function mockFetchNetworkError(message: string = 'Network timeout'): void {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error(message));
}

/**
 * Sets up security validation mock to allow all URLs
 */
export function mockSecurityValidationPass(): void {
    const { validateGitHubDownloadURL } = require('@/core/validation');
    validateGitHubDownloadURL.mockReturnValue(true);
}

/**
 * Sets up security validation mock to reject URLs
 */
export function mockSecurityValidationFail(): void {
    const { validateGitHubDownloadURL } = require('@/core/validation');
    validateGitHubDownloadURL.mockReturnValue(false);
}
