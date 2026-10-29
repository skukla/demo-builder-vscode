/**
 * Shared fixtures for the smart-404 installer suites.
 *
 * Two suites drive the publisher from the same starting state:
 * `pdp404HandlerPublisher.install.test.ts` (building the script, and retiring its
 * old copy in `scripts/delayed.js` with the stale-SHA retry) and
 * `pdp404HandlerPublisher.eagerRedirect.test.ts` (the eager script in `head.html`). The setup is identical and
 * load-bearing — the nonced `<script>` tags below match the convention in
 * aem-boilerplate-commerce, and a suite that quietly drifted from them would
 * pass while testing a storefront shape that does not exist.
 */

export const repoOwner = 'skukla';
import type { GithubFake } from '../../../../helpers/githubFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
export type { GithubFake, MockGithub } from '../../../../helpers/githubFake';
export const repoName = 'citisignal-b2b';
export const daLiveOrg = 'skukla';
export const daLiveSite = 'citisignal-b2b';
export const overlayUrl =
    'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

/**
 * Default storefront: `head.html` and `404.html` both carry a nonced
 * `<script>`; anything else resolves as a `delayed.js` without Demo Builder's copy. Suites that
 * exercise the "no nonce" / "file missing" paths override per-test.
 */
export function makePdp404Github(): GithubFake {
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
    } as GithubFake;
}

export const mockLogger = createMockLogger();
