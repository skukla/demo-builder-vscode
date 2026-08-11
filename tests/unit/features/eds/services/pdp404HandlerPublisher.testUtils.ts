/**
 * Shared fixtures for the smart-404 installer suites.
 *
 * Two suites drive `installSmart404Handler` from the same starting state:
 * `pdp404HandlerPublisher.install.test.ts` (vendoring into `scripts/delayed.js`,
 * plus the stale-SHA retry) and `pdp404HandlerPublisher.eagerRedirect.test.ts`
 * (vendoring into `head.html` and `404.html`). The setup is identical and
 * load-bearing — the nonced `<script>` tags below match the convention in
 * aem-boilerplate-commerce, and a suite that quietly drifted from them would
 * pass while testing a storefront shape that does not exist.
 */

export const repoOwner = 'skukla';
export const repoName = 'citisignal-b2b';
export const daLiveOrg = 'skukla';
export const daLiveSite = 'citisignal-b2b';
export const overlayUrl =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

export interface MockGithub {
    getFileContent: jest.Mock;
    createOrUpdateFile: jest.Mock;
}

/**
 * Default storefront: `head.html` and `404.html` both carry a nonced
 * `<script>`; anything else resolves as an existing `delayed.js`. Suites that
 * exercise the "no nonce" / "file missing" paths override per-test.
 */
export function makeMockGithub(): MockGithub {
    return {
        getFileContent: jest.fn().mockImplementation((_o, _r, path) => {
            if (path === 'head.html') {
                return Promise.resolve({
                    content:
                        '<meta charset="UTF-8">\n<script nonce="aem" type="importmap">{}</script>\n<title>placeholder</title>\n',
                    sha: 'head-sha',
                });
            }
            if (path === '404.html') {
                return Promise.resolve({
                    content:
                        '<!DOCTYPE html><html><head><script nonce="aem">w.x=1;</script></head><body></body></html>',
                    sha: '404-sha',
                });
            }
            return Promise.resolve({
                content: '// Existing delayed.js contents\nexport default {};\n',
                sha: 'existing-file-sha',
            });
        }),
        createOrUpdateFile: jest.fn().mockResolvedValue({
            sha: 'new-file-sha',
            commitSha: 'commit-sha',
        }),
    };
}

export const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};
