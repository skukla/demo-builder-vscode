/**
 * resetRepoToTemplate — placeholder-stub wiring.
 *
 * The stub CONTENT is pinned in placeholderStubs.test.ts; this suite pins the
 * WIRING: the reset's bulk file-override map must carry one stub per sheet the
 * boilerplate requests, in the same atomic commit as fstab/config (a separate
 * commit could race the template reset and be lost). Asserting the ARGUMENT
 * handed to githubFileOps.resetRepoToTemplate — not a mock's echo — per the
 * repo's mock-audit rule.
 */

import { buildParams, installDefaults, runReset } from './edsResetRepoHelper.testUtils';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';

import { installSiteFetch, restoreFetch } from '../../../../helpers/siteFetchFake';

beforeEach(installDefaults);
afterEach(restoreFetch);

describe('resetRepoToTemplate — placeholder stubs ride the bulk override commit', () => {
    it('hands one stub per requested sheet to githubFileOps.resetRepoToTemplate', async () => {
        const { overrides } = await runReset(buildParams());

        expect(overrides?.get('fstab.yaml')).toBe('mock-fstab');
        for (const sheetPath of PLACEHOLDER_STUB_PATHS) {
            expect(overrides?.get(`${sheetPath}.json`)).toBe(buildPlaceholderStubJson());
        }
    });

    it('hands over no stub for an area the content source serves a sheet for', async () => {
        // The same source the reset's content copy reads from. A stub at the same
        // path would stop the copied sheet from being served (measured live
        // 2026-10-12), and creation decides the same way from the same function.
        const base = 'https://main--their-demo--colleague.aem.live';
        const site = installSiteFetch([`${base}/placeholders/cart.json`]);

        const { overrides } = await runReset(
            buildParams({ contentSource: { org: 'colleague', site: 'their-demo', indexPath: '/full-index.json' } }),
        );

        expect(overrides?.has('placeholders/cart.json')).toBe(false);
        const stubbed = [...(overrides?.keys() ?? [])].filter((key) => key.startsWith('placeholders/')).sort();
        expect(stubbed).toEqual(
            PLACEHOLDER_STUB_PATHS.filter((p) => p !== 'placeholders/cart')
                .map((p) => `${p}.json`)
                .sort(),
        );
        expect(site.asked()).toContain(`${base}/placeholders/cart.json`);
    });
});
