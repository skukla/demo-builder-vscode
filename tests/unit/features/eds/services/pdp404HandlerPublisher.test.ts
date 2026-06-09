/**
 * Smart 404 handler installer tests — Phase 1 of BYOM PDP routing.
 *
 * Covers the two pure helpers (buildSmart404Snippet, derivePrepublishUrl)
 * and the orchestrator (installSmart404Handler) end-to-end.
 *
 * Phase 1 v2 contract (post-2026-06-09): the smart 404 handler is
 * vendored into `scripts/delayed.js` rather than published as a DA.live
 * `/404.html` page. EDS strips `<script>` tags from authored content,
 * which silently broke the v1 page-publish approach. Tests pin the new
 * delayed-vendor contract.
 *
 * The installer MUST be non-fatal at every step: any failure logs and
 * returns `{ installed: false, reason }`. These tests enforce that.
 */

import {
    buildSmart404Snippet,
    derivePrepublishUrl,
    installSmart404Handler,
} from '@/features/eds/services/pdp404HandlerPublisher';

const mockLogger = {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
};

describe('derivePrepublishUrl', () => {
    it('rewrites /render-pdp to /prepublish-pdp at the end of the path', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('strips the ?org=&site= query the overlay URL carries', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp?org=skukla&site=citisignal-b2b';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('handles a trailing slash on /render-pdp/', () => {
        const overlay = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp/';
        expect(derivePrepublishUrl(overlay)).toBe(
            'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp',
        );
    });

    it('returns undefined for an unparseable URL', () => {
        expect(derivePrepublishUrl('not-a-url')).toBeUndefined();
        expect(derivePrepublishUrl('')).toBeUndefined();
    });

    it('returns undefined when the path does not end with /render-pdp', () => {
        expect(derivePrepublishUrl('https://example.com/api/v1/web/accs-discovery/discover-stores')).toBeUndefined();
        expect(derivePrepublishUrl('https://example.com/render-pdp/extra-segment')).toBeUndefined();
    });

    it('rejects pathologically long URLs', () => {
        const longUrl = 'https://example.com/' + 'a'.repeat(2500) + '/render-pdp';
        expect(derivePrepublishUrl(longUrl)).toBeUndefined();
    });
});

describe('buildSmart404Snippet', () => {
    const triggerUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/prepublish-pdp';

    it('substitutes the trigger URL, org, and site into the template', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain(triggerUrl);
        expect(snippet).toContain('org=skukla');
        expect(snippet).toContain('site=citisignal-b2b');
    });

    it('URL-encodes org and site values that contain special characters', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'my org', 'site-with/slash');
        expect(snippet).toContain('org=my%20org');
        expect(snippet).toContain('site=site-with%2Fslash');
    });

    it('gates on window.isErrorPage so the snippet is inert on non-404 pages', () => {
        // Critical: the snippet rides delayed.js, which runs on every page.
        // Without this gate it would try to redirect on the home page.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('window.isErrorPage');
    });

    it('matches the PDP-shape pattern /products/{urlKey}/{sku}', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('/products/');
    });

    it('embeds the infinite-loop guard using the pdpRetry sentinel', () => {
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('pdpRetry');
    });

    it('produces a delayed.js snippet (NOT an HTML document)', () => {
        // Regression guard: the v1 implementation built a full <!DOCTYPE
        // html> page for DA.live publication. EDS stripped the <script>
        // tag inside it. We must never go back to that shape.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).not.toContain('<!DOCTYPE');
        expect(snippet).not.toContain('<html');
        expect(snippet).toContain('Smart 404 PDP rebuild');
    });

    it('bookends the snippet with stable start and end markers for idempotency', () => {
        // The installer uses these markers to detect "already installed"
        // and skip re-vendoring on every reset.
        const snippet = buildSmart404Snippet(triggerUrl, 'skukla', 'citisignal-b2b');
        expect(snippet).toContain('=== Smart 404 PDP rebuild (Demo Builder) ===');
        expect(snippet).toContain('=== end Smart 404 PDP rebuild ===');
    });
});

describe('installSmart404Handler', () => {
    const repoOwner = 'skukla';
    const repoName = 'citisignal-b2b';
    const daLiveOrg = 'skukla';
    const daLiveSite = 'citisignal-b2b';
    const overlayUrl = 'https://example.adobeioruntime.net/api/v1/web/accs-discovery/render-pdp';

    let mockGithub: {
        getFileContent: jest.Mock;
        createOrUpdateFile: jest.Mock;
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGithub = {
            getFileContent: jest.fn().mockResolvedValue({
                content: '// Existing delayed.js contents\nexport default {};\n',
                sha: 'existing-file-sha',
            }),
            createOrUpdateFile: jest.fn().mockResolvedValue({
                sha: 'new-file-sha',
                commitSha: 'commit-sha',
            }),
        };
    });

    it('installs the snippet on the happy path', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: true });
        expect(mockGithub.getFileContent).toHaveBeenCalledWith(repoOwner, repoName, 'scripts/delayed.js');
        expect(mockGithub.createOrUpdateFile).toHaveBeenCalledWith(
            repoOwner, repoName, 'scripts/delayed.js',
            expect.stringContaining('Smart 404 PDP rebuild'),
            expect.any(String),
            'existing-file-sha',
        );
    });

    it('appends the snippet to the existing delayed.js content (preserves prior content)', async () => {
        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('// Existing delayed.js contents');
        expect(writtenContent).toContain('export default {};');
        expect(writtenContent).toContain('Smart 404 PDP rebuild');
    });

    it('skips when BYOM is disabled (overlayUrl is undefined)', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, undefined, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result).toEqual({ installed: false, reason: 'BYOM disabled' });
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL cannot be parsed', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, 'not-a-url', mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
        expect(mockGithub.getFileContent).not.toHaveBeenCalled();
    });

    it('skips when the overlay URL is the wrong shape', async () => {
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName,
            'https://example.com/api/v1/web/accs-discovery/discover-stores',
            mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('invalid overlay URL');
    });

    it('skips gracefully when delayed.js is missing from the storefront', async () => {
        mockGithub.getFileContent.mockResolvedValue(null);
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('delayed.js missing');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('idempotent: skips when the snippet marker is already present', async () => {
        // Lets the step run safely on every create/edit/reset without
        // piling up duplicate snippets in delayed.js.
        mockGithub.getFileContent.mockResolvedValue({
            content: 'existing stuff\n// === Smart 404 PDP rebuild (Demo Builder) ===\n// snippet body...\n',
            sha: 'sha-already-installed',
        });
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toBe('already installed');
        expect(mockGithub.createOrUpdateFile).not.toHaveBeenCalled();
    });

    it('skips gracefully when the GitHub commit fails', async () => {
        mockGithub.createOrUpdateFile.mockRejectedValue(new Error('GitHub 422 conflict'));
        const result = await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            daLiveOrg, daLiveSite,
        );

        expect(result.installed).toBe(false);
        expect(result.reason).toContain('GitHub commit failed');
        expect(result.reason).toContain('GitHub 422 conflict');
    });

    it('passes the storefront org and site through to the vendored snippet', async () => {
        await installSmart404Handler(
            mockGithub as never,
            repoOwner, repoName, overlayUrl, mockLogger as never,
            'custom-org', 'custom-site',
        );

        const writtenContent = mockGithub.createOrUpdateFile.mock.calls[0][3] as string;
        expect(writtenContent).toContain('org=custom-org');
        expect(writtenContent).toContain('site=custom-site');
    });
});
