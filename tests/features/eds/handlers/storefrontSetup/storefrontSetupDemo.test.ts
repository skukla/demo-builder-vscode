/**
 * The create path's half of Demo Builder's fixes on an added demo (EDS-13f):
 * the fix pass runs against the SC's OWN new repository, reads the demo's
 * source only as the source, applies a colleague's fits only when the SC
 * asked, and its lines ride the completion card's caveats. A shipped brand
 * runs nothing.
 */

import { runDemoFixes } from '@/features/eds/handlers/storefrontSetup/storefrontSetupDemo';
import { runDemoFixPass } from '@/features/eds/services/patches/demoFixPass';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';

jest.mock('@/features/eds/services/patches/demoFixPass', () => ({
    ...jest.requireActual('@/features/eds/services/patches/demoFixPass'),
    runDemoFixPass: jest.fn(),
}));
const mockPass = runDemoFixPass as jest.MockedFunction<typeof runDemoFixPass>;

const fileOps = { getFileContent: jest.fn(), commitTreeToBranch: jest.fn() };
const demo = makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' } });
const CONFIG = { demo, templateOwner: 'sayurihanki', templateRepo: 'aistore' };

beforeEach(() => jest.clearAllMocks());

describe('runDemoFixes (create)', () => {
    it("runs the pass on the SC's repository, reads the source only as the source, and never applies unasked", async () => {
        mockPass.mockResolvedValue({ by: 'template', offered: ['pdp-empty-data-redirect'], caveats: [] });
        const repoInfo = { repoOwner: 'steve', repoName: 'aistore-copy' };
        const logger = createMockLogger();

        await runDemoFixes(CONFIG, repoInfo, fileOps, logger);

        expect(mockPass).toHaveBeenCalledWith(
            demo,
            { owner: 'steve', repo: 'aistore-copy', branch: 'main' },
            { owner: 'sayurihanki', repo: 'aistore' },
            { fileOps, logger },
            { applyOffered: false },
        );
        expect(repoInfo).toEqual({
            repoOwner: 'steve',
            repoName: 'aistore-copy',
            demoCaveats: [
                "1 of Demo Builder's fixes fits this storefront's code: empty product pages. It was not applied. Apply it from the storefront report.",
            ],
        });
    });

    it('applies the offer when the SC asked for it at creation', async () => {
        mockPass.mockResolvedValue({ by: 'template', applied: ['pdp-empty-data-redirect'], caveats: [] });

        await runDemoFixes({ ...CONFIG, applyDemoFixes: true }, { repoOwner: 'steve', repoName: 'x' }, fileOps, createMockLogger());

        expect(mockPass.mock.calls[0][4]).toEqual({ applyOffered: true });
    });

    it('runs nothing for a shipped brand', async () => {
        const repoInfo = { repoOwner: 'steve', repoName: 'bodea' };

        await runDemoFixes({ templateOwner: 'adobe-commerce', templateRepo: 'boilerplate-b2b-template' }, repoInfo, fileOps, createMockLogger());

        expect(mockPass).not.toHaveBeenCalled();
        expect(repoInfo).not.toHaveProperty('demoCaveats');
    });
});
