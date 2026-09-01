/**
 * Smart 404 handler installer — vendoring into `scripts/delayed.js`.
 *
 * Covers the orchestrator's core path: deriving the trigger URL, appending the
 * snippet to the storefront's existing `delayed.js`, idempotence, and the
 * stale-SHA retry. The eager-redirect vendoring into `head.html` / `404.html`
 * lives in the sibling `pdp404HandlerPublisher.eagerRedirect.test.ts`; the pure
 * helpers live in `pdp404HandlerPublisher.test.ts`.
 *
 * Phase 1 v2 contract (post-2026-06-09): the handler is vendored into
 * `scripts/delayed.js` rather than published as a DA.live `/404.html` page —
 * EDS strips `<script>` tags from authored content, which silently broke v1.
 *
 * The installer MUST be non-fatal at every step: any genuine failure logs and
 * returns `{ installed: false, reason }`. An already-installed handler is a
 * SUCCESS (`installed: true`) — consumers gate on `!installed` to mean "this
 * storefront is missing PDP recovery". These tests enforce both.
 */

import {
    buildSmart404Snippet,
    installSmart404Handler,
} from '@/features/eds/services/pdp/pdp404HandlerPublisher';

import {
    daLiveOrg,
    daLiveSite,
    makePdp404Github,
    mockLogger,
    overlayUrl,
    repoName,
    repoOwner,
    type GithubFake,
} from './pdp404HandlerPublisher.testUtils';

describe('installSmart404Handler', () => {
    let mockGithub: GithubFake;

    beforeEach(() => {
        jest.clearAllMocks();
        mockGithub = makePdp404Github();
    });

    it('installs the snippet on the happy path', async () => {
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result).toEqual({ installed: true });
        expect(mockGithub.getFileContent).toHaveBeenCalledWith(
            repoOwner,
            repoName,
            'scripts/delayed.js'
        );
        expect(mockGithub.createOrUpdateFile).toHaveBeenCalledWith(
            repoOwner,
            repoName,
            'scripts/delayed.js',
            expect.stringContaining('Smart 404 PDP rebuild'),
            expect.any(String),
            'existing-file-sha'
        );
    });
    it('appends the snippet to the existing delayed.js content (preserves prior content)', async () => {
        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('// Existing delayed.js contents');
        expect(writtenContent).toContain('export default {};');
        expect(writtenContent).toContain('Smart 404 PDP rebuild');
    });
    it('skips when BYOM is disabled (overlayUrl is undefined)', async () => {
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            undefined,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result).toEqual({ installed: false, reason: 'BYOM disabled' });
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });
    it('skips when the overlay URL cannot be parsed', async () => {
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            'not-a-url',
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
    });
    it('skips when the overlay URL is the wrong shape', async () => {
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            'https://example.com/api/v1/web/accs-discovery/discover-stores',
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
    });
    it('skips gracefully when delayed.js is missing from the storefront', async () => {
        mockGithub.getFileContent.mockResolvedValue(null);
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('delayed.js missing');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });
    it('idempotent: skips when the snippet marker is already present', async () => {
        // Lets the step run safely on every create/edit/reset without
        // piling up duplicate snippets in delayed.js.
        mockGithub.getFileContent.mockResolvedValue({
            content:
                'existing stuff\n// === Smart 404 PDP rebuild (Demo Builder) ===\n// snippet body...\n',
            sha: 'sha-already-installed',
        });
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        // Idempotent AND successful: nothing was written, and the handler is in
        // place — which is what `installed` reports.
        expect(result.installed).toBe(true);
        expect(result.reason).toBe('already installed');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });
    it('re-vendors in place when a stale (full-marker) block is present, so behavior fixes ship on reset', async () => {
        // A storefront vendored an OLDER snippet (both markers, outdated body).
        // The installer must REPLACE the block between the markers with the
        // current snippet — not skip — so behavior changes like the
        // missing-SKU → native /404 redirect reach existing storefronts on reset.
        mockGithub.getFileContent.mockResolvedValue({
            content:
                'prior stuff\n' +
                '// === Smart 404 PDP rebuild (Demo Builder) ===\n' +
                '// OUTDATED snippet body that must be replaced\n' +
                '// === end Smart 404 PDP rebuild ===\n' +
                'trailing stuff\n',
            sha: 'stale-sha',
        });

        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result).toEqual({ installed: true });
        const delayedCall = mockGithub.createOrUpdateFile.mock.calls.find(
            (c) => c[2] === 'scripts/delayed.js'
        );
        expect(delayedCall).toBeDefined();
        const written = delayedCall![3] as string;
        // Stale body gone; current snippet (with the /404 redirect) in place.
        expect(written).not.toContain('OUTDATED snippet body');
        expect(written).toContain("window.location.replace('/404')");
        // Surrounding content preserved, single block (not duplicated).
        expect(written).toContain('prior stuff');
        expect(written).toContain('trailing stuff');
        expect(written.match(/=== Smart 404 PDP rebuild \(Demo Builder\) ===/g)).toHaveLength(1);
    });
    it('skips the commit when the vendored block is already byte-identical (no churn)', async () => {
        // A no-op reset (snippet unchanged) must not rewrite delayed.js.
        const currentBlock = buildSmart404Snippet(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
            daLiveOrg,
            daLiveSite
        );
        mockGithub.getFileContent.mockResolvedValue({
            content: `// existing\n${currentBlock}`,
            sha: 'current-sha',
        });

        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        // installed: TRUE — the handler IS in place. Reporting false made a
        // healthy storefront report "was not installed (already installed)"
        // and finish WITH ERRORS.
        expect(result).toEqual({ installed: true, reason: 'already installed' });
        const delayedCommits = mockGithub.createOrUpdateFile.mock.calls.filter(
            (c) => c[2] === 'scripts/delayed.js'
        );
        expect(delayedCommits).toHaveLength(0);
    });
    it('skips gracefully when the GitHub commit fails', async () => {
        mockGithub.createOrUpdateFile.mockRejectedValue(new Error('GitHub 422 conflict'));
        const result = await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            daLiveOrg,
            daLiveSite
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toContain('GitHub commit failed');
        expect(result.reason).toContain('GitHub 422 conflict');
    });
    it('passes the storefront org and site through to the vendored snippet', async () => {
        await installSmart404Handler(
            mockGithub,
            repoOwner,
            repoName,
            overlayUrl,
            mockLogger as never,
            'custom-org',
            'custom-site'
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('org=custom-org');
        expect(writtenContent).toContain('site=custom-site');
    });
});

/**
 * Stale-SHA retry.
 *
 * Inspector Tagging writes `scripts/delayed.js` through the Git Tree API during
 * block installation; this publisher reads it back through the Contents API,
 * which serves from a different path and can lag behind a tree commit. A live
 * run on 2026-07-29 lost that race 18 seconds after the tree commit:
 *
 *   [PDP404] GitHub commit failed: scripts/delayed.js does not match
 *            15be5fb9e97773471ea4124c259d6d1e2eeb2626 — skipping smart 404 install
 *
 * The step is non-fatal, so setup reported Complete with no PDP handling at all.
 * Re-reading and retrying once covers both the staleness and genuine interleaving.
 */
describe('installSmart404Handler — stale SHA', () => {
    const SHA_MISMATCH = 'scripts/delayed.js does not match 15be5fb9e97773471ea4124c259d6d1e2eeb2626';

    /** Contents API hands back `sha` on each successive read of delayed.js. */
    function makeGithub(delayedShas: string[]) {
        let read = 0;
        return {
            getFileContent: jest.fn().mockImplementation((_o: string, _r: string, path: string) => {
                if (path === 'head.html') {
                    return Promise.resolve({
                        content: '<meta charset="UTF-8">\n<script nonce="aem" type="importmap">{}</script>\n',
                        sha: 'head-sha',
                    });
                }
                if (path === '404.html') {
                    return Promise.resolve({
                        content: '<!DOCTYPE html><html><head><script nonce="aem">w.x=1;</script></head></html>',
                        sha: '404-sha',
                    });
                }
                const sha = delayedShas[Math.min(read, delayedShas.length - 1)];
                read += 1;
                return Promise.resolve({ content: '// Existing delayed.js\n', sha });
            }),
            createOrUpdateFile: jest.fn(),
        };
    }

    beforeEach(() => jest.clearAllMocks());

    it('re-reads and retries once when the write is rejected for a stale SHA', async () => {
        const gh = makeGithub(['stale-sha', 'fresh-sha']);
        gh.createOrUpdateFile
            .mockRejectedValueOnce(new Error(SHA_MISMATCH))
            .mockResolvedValue({ sha: 'new', commitSha: 'c' });

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(2);
        expect(delayedWrites[1][5]).toBe('fresh-sha');
    });

    it('retries only once — a second stale rejection gives up', async () => {
        const gh = makeGithub(['stale-1', 'stale-2']);
        gh.createOrUpdateFile.mockRejectedValue(new Error(SHA_MISMATCH));

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(2);
    });

    it('does NOT retry a failure that is not a SHA mismatch', async () => {
        // Permissions and missing-file failures are not transient. Retrying
        // them just doubles the latency of a certain failure.
        const gh = makeGithub(['sha-1']);
        gh.createOrUpdateFile.mockRejectedValue(new Error('Resource not accessible by integration'));

        const result = await installSmart404Handler(
            gh as never, repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        const delayedWrites = gh.createOrUpdateFile.mock.calls.filter(
            c => c[2] === 'scripts/delayed.js',
        );
        expect(delayedWrites).toHaveLength(1);
    });
});
