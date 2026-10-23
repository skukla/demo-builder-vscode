/**
 * What an added demo adds to storefront setup: its content site joins the block
 * library's content sources, so its blocks' example pages arrive (D20).
 *
 * The fix pass that also ran here (EDS-13f) is gone: an added demo's code is copied
 * as it is (owner, 2026-10-23, EDS-64).
 */

import { withDemoContentSource } from '@/features/eds/handlers/storefrontSetup/storefrontSetupDemo';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';

const LIBRARY = { org: 'skukla', site: 'demo-builder-block-library' };

describe('withDemoContentSource', () => {
    it("adds the demo's own content site after the libraries'", () => {
        const contentSource = { org: 'kmanns', site: 'justrite', indexPath: '/query-index.json' };
        const demo = makeAddedDemo({ contentSource });

        expect(withDemoContentSource([LIBRARY], demo)).toStrictEqual([LIBRARY, contentSource]);
    });

    it('leaves the sources as they are for a demo that names no content site', () => {
        const sources = [LIBRARY];

        expect(withDemoContentSource(sources, makeAddedDemo({}))).toBe(sources);
    });

    it('leaves the sources as they are for a shipped brand', () => {
        const sources = [LIBRARY];

        expect(withDemoContentSource(sources, undefined)).toBe(sources);
    });
});
