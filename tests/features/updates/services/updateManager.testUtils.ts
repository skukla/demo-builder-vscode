/**
 * Shared setup for the updateManager suites — THE AGREED PART ONLY.
 *
 * This family does NOT agree about how to fake all of its dependencies, and
 * picking a winner would change what some suites exercise while every one of
 * them stayed green. So only the mocks that EVERY spec already declared
 * IDENTICALLY were moved here. Each spec keeps its own disputed mocks inline,
 * and therefore ends up with exactly the set it started with.
 *
 * Moved here (all specs agreed): @/core/logging, @/core/utils/timeoutConfig, @/core/validation, vscode
 * Left inline (specs disagree):  @/features/updates/services/componentRepositoryResolver, fs/promises
 *
 * Extracted 2026-08-30 (lane C2). Resolving the disputed ones is a separate
 * decision, deliberately not taken here.
 */

import { UpdateManager } from '@/features/updates/services/updateManager';

// Mock vscode
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
    },
}), { virtual: true });
// Mock Logger
// Mock timeoutConfig - uses semantic categories
jest.mock('@/core/utils/timeoutConfig', () => ({
    TIMEOUTS: {
        QUICK: 5000, // Fast operations (replaces UPDATE_CHECK)
    },
}));
// Mock security validation
jest.mock('@/core/validation/SensitiveDataRedactor', () => ({
    sanitizeErrorForLogging: jest.fn((msg: string) => msg),
}));

jest.mock('@/core/validation/URLValidator', () => ({
    validateGitHubDownloadURL: jest.fn().mockReturnValue(true),
}));

export { UpdateManager };
export * as vscode from 'vscode';

import { createMockExtensionContext } from '../../../helpers/extensionContextFake';
import { createMockProject as createMockProjectBase } from '../../../helpers/projectFake';
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

/** Base from the canonical fake (ADR-016); the specifics below are this suite's. */
export function createUpdateManagerContext(version: string = '1.0.0'): any {
    return createMockExtensionContext({
        extensionPath: '/mock/extension/path',
        extension: { packageJSON: { version } },
        // This suite's own: the GitHub token must resolve, or update checks
        // take the unauthenticated path and the assertions change.
        secrets: {
            get: jest.fn().mockResolvedValue('mock-github-token'),
            store: jest.fn(),
            delete: jest.fn(),
            onDidChange: jest.fn(),
        },
    } as never);
}

/** Canonical logger fake (ADR-016). Re-exported so existing imports keep working. */
export { createMockLogger } from '../../../helpers/loggerFake';

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
 * Builds a release object (array form) with a .vsix asset for the given tag.
 */
function mockArrayRelease(tag: string, prerelease: boolean): any {
    return {
        tag_name: tag,
        body: `Release notes for ${tag}`,
        published_at: '2024-01-01T00:00:00Z',
        prerelease,
        draft: false,
        assets: [
            {
                name: 'extension.vsix',
                browser_download_url: `https://github.com/test/repo/releases/download/${tag}/extension.vsix`,
            },
        ],
    };
}

/**
 * Creates a mixed releases array (final + beta + alpha) for channel-filtering tests.
 * Defaults: final 1.1.0, beta 1.2.0-beta.1, alpha 2.0.0-alpha.1.
 */
export function createMockReleasesArray(options?: {
    final?: string;
    beta?: string;
    alpha?: string;
}): any[] {
    const { final = '1.1.0', beta = '1.2.0-beta.1', alpha = '2.0.0-alpha.1' } = options ?? {};
    return [
        mockArrayRelease(`v${alpha}`, true),
        mockArrayRelease(`v${beta}`, true),
        mockArrayRelease(`v${final}`, false),
    ];
}

/**
 * Creates a mock project with components
 */
export function createUpdateManagerProject(components: { id: string; version: string; repoUrl?: string; path?: string; name?: string }[]): any {
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

    return createMockProjectBase({
        componentInstances,
        componentVersions,
    } as never)
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
    const { validateGitHubDownloadURL } = require('@/core/validation/URLValidator');
    validateGitHubDownloadURL.mockReturnValue(true);
}

/**
 * Sets up security validation mock to reject URLs
 */
export function mockSecurityValidationFail(): void {
    const { validateGitHubDownloadURL } = require('@/core/validation/URLValidator');
    validateGitHubDownloadURL.mockReturnValue(false);
}
