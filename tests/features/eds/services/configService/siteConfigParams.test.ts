/**
 * What a site registration says: the lookup key and the body Helix reads.
 *
 * The `buildSiteConfigParams` tests moved here from `configurationService.test.ts`
 * on 2026-10-08 (EDS-8) with the function; `buildRegistrationBody` is the body
 * literal `registerSite` used to build inline, pinned on its own.
 */

import {
    buildRegistrationBody,
    buildSiteConfigParams,
    type SiteRegistrationParams,
} from '@/features/eds/services/configService/siteConfigParams';

describe('buildSiteConfigParams', () => {
    it('omits contentOverlayUrl when no overlay URL is provided', () => {
        const params = buildSiteConfigParams('owner', 'repo', 'org');
        expect(params.contentOverlayUrl).toBeUndefined();
        expect('contentOverlayUrl' in params).toBe(false);
    });

    it('includes contentOverlayUrl when an overlay URL is provided', () => {
        const params = buildSiteConfigParams('owner', 'repo', 'org', 'https://byom.example.com');
        expect(params.contentOverlayUrl).toBe('https://byom.example.com');
    });

    // legacyLookupKey retired 2026-08-23: reset AND repair both migrate a
    // mismatched DA site name before registering, so every caller reaches
    // this function with the DA site name equal to the repo name. The
    // param is gone — this pins that it stays gone.
    it('exposes no legacyLookupKey field', () => {
        const params = buildSiteConfigParams('owner', 'repo', 'org');
        expect('legacyLookupKey' in params).toBe(false);
    });

    // Helix's preview/publish/live operations look up the site config at
    // /config/{githubOwner}/sites/{githubRepo}.json — using the GitHub
    // identifiers, not the DA.live identifiers. Registering under the
    // DA.live name (the old behavior) leaves the config invisible to those
    // operations and every preview/publish silently fails.
    describe('Config Service lookup key (Helix preview/publish contract)', () => {
        it('uses the GitHub owner/repo as the Config Service lookup key', () => {
            const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

            expect(params.org).toBe('my-owner');
            expect(params.site).toBe('my-repo');
        });

        it('keeps codeOwner/codeRepo identical to the lookup key (Helix code source)', () => {
            const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

            expect(params.codeOwner).toBe('my-owner');
            expect(params.codeRepo).toBe('my-repo');
        });

        it('points the content source URL at the DA.live org and the REPO name (the one identifier)', () => {
            const params = buildSiteConfigParams('my-owner', 'my-repo', 'my-dalive-org');

            expect(params.contentSourceUrl).toBe('https://content.da.live/my-dalive-org/my-repo/');
        });
    });
});

describe('buildRegistrationBody', () => {
    const params: SiteRegistrationParams = {
        org: 'test-user',
        site: 'my-site',
        codeOwner: 'code-owner',
        codeRepo: 'code-repo',
        contentSourceUrl: 'https://content.da.live/test-user/my-site/',
    };

    it('names the code source and a markup content source by default', () => {
        expect(buildRegistrationBody(params)).toStrictEqual({
            version: 1,
            code: { owner: 'code-owner', repo: 'code-repo' },
            content: {
                source: { url: 'https://content.da.live/test-user/my-site/', type: 'markup' },
            },
        });
    });

    it('uses the content source type it is given', () => {
        const body = buildRegistrationBody({ ...params, contentSourceType: 'html' });

        expect(body.content).toStrictEqual({
            source: { url: 'https://content.da.live/test-user/my-site/', type: 'html' },
        });
    });

    it('adds the BYOM overlay with the .html suffix the overlay schema needs', () => {
        const body = buildRegistrationBody({
            ...params,
            contentOverlayUrl: 'https://byom.example.com',
        });

        expect(body.content).toStrictEqual({
            source: { url: 'https://content.da.live/test-user/my-site/', type: 'markup' },
            overlay: { url: 'https://byom.example.com', type: 'markup', suffix: '.html' },
        });
    });
});
