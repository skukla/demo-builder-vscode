/**
 * Shared fixtures + mocks for the brandAssetPublisher suites
 * (`brandAssetPublisher.test.ts`, `brandAssetPublisher-policy.test.ts`).
 *
 * NOTE: `jest.mock('@/core/utils/timeoutConfig')` cannot live here (mock
 * hoisting is per test file) — each suite declares it in its own preamble.
 */

import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import type { BrandAssetsConfig } from '@/types/demoPackages';
import type { Logger } from '@/types/logger';

export const repoOwner = 'test-owner';
export const repoName = 'test-repo';

export const THEME_CSS = ':root { --brand: #123456; }\n';
export const GROUP_JS = 'export function customerGroup() { return "vip"; }\n';
export const HEAD_HTML = '<meta charset="UTF-8">\n<script nonce="aem" type="importmap">{}</script>\n';

export const CONFIG: BrandAssetsConfig = {
    source: { owner: 'skukla', repo: 'bodea-source', branch: 'main' },
    files: [
        { from: 'styles/bodea-theme.css', to: 'styles/bodea-theme.css' },
        { from: 'scripts/bodea-customer-group.js', to: 'scripts/bodea-customer-group.js' },
    ],
    headSnippet:
        '<link rel="stylesheet" href="/styles/bodea-theme.css">\n'
        + '<script type="module" src="/scripts/bodea-customer-group.js"></script>',
};

export interface MockGithub {
    getFileContent: jest.Mock;
    createOrUpdateFile: jest.Mock;
}

/** Default target repo: head.html exists, brand files absent (fresh create). */
export function makeMockGithub(): MockGithub {
    return {
        getFileContent: jest.fn().mockImplementation((_o, _r, path: string) => {
            if (path === 'head.html') {
                return Promise.resolve({ content: HEAD_HTML, sha: 'head-sha' });
            }
            return Promise.resolve(null);
        }),
        createOrUpdateFile: jest.fn().mockResolvedValue({
            sha: 'new-file-sha',
            commitSha: 'commit-sha',
        }),
    };
}

/** Route raw.githubusercontent fetches to per-path source contents. */
export function mockSourceFetch(files: Record<string, string> = {
    'styles/bodea-theme.css': THEME_CSS,
    'scripts/bodea-customer-group.js': GROUP_JS,
}): jest.Mock {
    const mock = jest.fn().mockImplementation((url: string) => {
        for (const [path, content] of Object.entries(files)) {
            if (url.endsWith(`/${path}`)) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    text: () => Promise.resolve(content),
                });
            }
        }
        return Promise.resolve({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: () => Promise.resolve('404: Not Found'),
        });
    });
    global.fetch = mock as unknown as typeof fetch;
    return mock;
}

export const logger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    trace: jest.fn(),
} as unknown as Logger;

export function asOps(mock: MockGithub): GitHubFileOperations {
    return mock as unknown as GitHubFileOperations;
}

/** Calls to createOrUpdateFile targeting the given path. */
export function writesTo(mock: MockGithub, path: string): unknown[][] {
    return mock.createOrUpdateFile.mock.calls.filter((c) => c[2] === path);
}
