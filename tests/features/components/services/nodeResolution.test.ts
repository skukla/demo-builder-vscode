/**
 * Where Demo Builder's Node is read from (PR-1a): the release-time source list, read
 * against the REAL bundled catalogs, so adding a component moves these pins on purpose.
 * The rule itself is tested in tests/core/shell/nodeRangeRule.test.ts.
 */

import { excludedNodeSources, listNodeSources } from '@/features/components/services/nodeResolution';

describe('listNodeSources: where the ranges are read', () => {
    let refs: () => string[];

    beforeAll(async () => {
        const listed = (await listNodeSources()).map((s) => s.ref);
        refs = () => listed;
    });

    it('reads each mesh at the tag Demo Builder installs, not the default branch', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            'skukla/commerce-eds-mesh@stable',
            'skukla/eds-accs-mesh@stable',
            'skukla/headless-commerce-mesh@stable',
        ]));
    });

    it('reads every App Builder catalog entry at its branch', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            'skukla/demo-erp@main',
            'skukla/commerce-erp-integration@main',
            'adobe/commerce-integration-starter-kit@main',
            'skukla/app-builder-shell@main',
        ]));
    });

    it('reads a storefront Demo Builder runs locally, and none it does not', () => {
        expect(refs()).toContain('skukla/citisignal-nextjs@main');
        // EDS storefronts install nothing locally (skipNpmInstall), so their repos decide nothing.
        expect(refs().filter((r) => r.startsWith('adobe-commerce/boilerplate-b2b-template'))).toStrictEqual([]);
    });

    it('reads the npm packages the prerequisites and the AI tools install', () => {
        expect(refs()).toEqual(expect.arrayContaining([
            '@adobe/aio-cli@latest',
            '@adobe/aio-cli-plugin-api-mesh@latest',
            '@dropins/ai-tools@^1.0.0',
        ]));
    });

    it('leaves the unreadable ingestion tool out, and says why', () => {
        expect(refs().some((r) => r.includes('commerce-demo-ingestion'))).toBe(false);
        expect(excludedNodeSources().map((e) => e.id)).toStrictEqual(['commerce-demo-ingestion']);
    });

    it('lists each ref once', () => {
        expect(new Set(refs()).size).toBe(refs().length);
    });
});
