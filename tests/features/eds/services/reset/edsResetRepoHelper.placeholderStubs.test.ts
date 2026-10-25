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

import {
    RESET_RESULT,
    buildParams,
    installDefaults,
    mockGetLatestCommitSha,
    resetRepoToTemplate,
    runReset,
} from './edsResetRepoHelper.testUtils';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockLogger } from '../../../../helpers/loggerFake';
import {
    PLACEHOLDER_STUB_PATHS,
    buildPlaceholderStubJson,
} from '@/features/eds/services/placeholderStubs';

import { installSiteFetch, restoreFetch } from '../../../../helpers/siteFetchFake';
import {
    B2B_TEMPLATE_CHECKOUT_JSON,
    B2B_TEMPLATE_CHECKOUT_ROWS,
} from '../../../../helpers/placeholderLabelFixtures';

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

    // Measured 2026-10-22 on a live storefront made from the B2B template: the stub replaced
    // the template's checkout.json and the checkout's item-list heading and Edit link read
    // "undefined". The reset writes the template's tree, so it reads the template's file, at
    // the commit it resets onto, and keeps its rows.
    it("keeps the template's checkout labels, read from the template at the commit reset onto", async () => {
        mockGetLatestCommitSha.mockResolvedValue('feedface1234');
        const getFileContent = jest.fn(async (owner: string, _r: string, path: string) =>
            owner === 'tpl-owner' && path === 'placeholders/checkout.json'
                ? { content: B2B_TEMPLATE_CHECKOUT_JSON, sha: 's', path, encoding: 'base64' }
                : null,
        );
        const resetMock = jest.fn().mockResolvedValue(RESET_RESULT);
        const githubFileOps = {
            resetRepoToTemplate: resetMock,
            getFileContent,
            commitTreeToBranch: jest.fn(),
            getLatestCommitSha: mockGetLatestCommitSha,
        } as unknown as GitHubFileOperations;

        await resetRepoToTemplate(buildParams(), createMockHandlerContext({ logger: createMockLogger() }), githubFileOps, jest.fn());

        expect(getFileContent).toHaveBeenCalledWith('tpl-owner', 'tpl-repo', 'placeholders/checkout.json', 'feedface1234');
        const overrides = resetMock.mock.calls[0]?.[4] as Map<string, string>;
        const written = JSON.parse(overrides.get('placeholders/checkout.json') ?? 'null') as { data: { data: unknown } };
        expect(written.data.data).toStrictEqual(B2B_TEMPLATE_CHECKOUT_ROWS);
        // Control: an area the template has no file for keeps the plain stub.
        expect(overrides.get('placeholders/cart.json')).toBe(buildPlaceholderStubJson());
    });
});

/**
 * The B2B template ships `placeholders/checkout.json`; the reset copied it, and the
 * repository file hid CitiSignal's copied checkout sheet (EDS-53). After the reset
 * commit, the template's label files are removed, reading the commit just written.
 */
describe('resetRepoToTemplate — template label files that hide a copied sheet', () => {
    it('removes them in a commit after the reset, reading the reset commit', async () => {
        installSiteFetch(['https://main--their-demo--colleague.aem.live/placeholders/checkout.json']);
        const getFileContent = jest.fn(async (_o: string, _r: string, path: string) =>
            path === 'placeholders/checkout.json'
                ? { content: '{"data":[{"Key":"Checkout.Summary.Edit","Value":"Edit"}]}', sha: 's', path, encoding: 'base64' }
                : null,
        );
        const commitTreeToBranch = jest.fn().mockResolvedValue('after');
        const githubFileOps = {
            resetRepoToTemplate: jest.fn().mockResolvedValue(RESET_RESULT),
            getFileContent,
            commitTreeToBranch,
            getLatestCommitSha: mockGetLatestCommitSha,
        } as unknown as GitHubFileOperations;

        await resetRepoToTemplate(
            buildParams({ contentSource: { org: 'colleague', site: 'their-demo', indexPath: '/full-index.json' } }),
            createMockHandlerContext({ logger: createMockLogger() }),
            githubFileOps,
            jest.fn(),
        );

        expect(getFileContent).toHaveBeenCalledWith('me', 'shop', 'placeholders/checkout.json', RESET_RESULT.commitSha);
        expect(commitTreeToBranch).toHaveBeenCalledWith(
            'me',
            'shop',
            'main',
            [{ path: 'placeholders/checkout.json', mode: '100644', type: 'blob', sha: null }],
            expect.any(String),
        );
    });
});
