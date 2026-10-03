/**
 * resetRepoToTemplate and Demo Builder's fixes on an added demo (EDS-13f).
 *
 * A saved package's ledger is applied where it fits, in one commit to the
 * SC's OWN repository (never the demo's source); a colleague's storefront with
 * our lineage is offered the fits, and they are written only when the reset
 * was asked to (`applyDemoFixes`). The ledger fetch and GitHub are the
 * boundaries; the engine and the decision are real.
 */

import { buildParams, installDefaults, resetRepoToTemplate } from './edsResetRepoHelper.testUtils';
import type { CodePatch } from '@/features/eds/services/patches/codePatchRegistry';
import { fetchExternalPatches } from '@/features/eds/services/patches/externalPatchFetcher';
import type { GitHubFileOperations } from '@/features/eds/services/github/githubFileOperations';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockProject } from '../../../../helpers/projectFake';

jest.mock('@/features/eds/services/patches/externalPatchFetcher', () => ({ fetchExternalPatches: jest.fn() }));
const mockLedger = fetchExternalPatches as jest.Mock;

const B2B = { owner: 'adobe-commerce', repo: 'boilerplate-b2b-template' };
const LEDGER: CodePatch[] = [
    { id: 'pdp-empty-data-redirect', target: 'blocks/product-details/product-details.js', description: '', precondition: 'P1', replacement: 'p1-fixed' },
    { id: 'header-nav-tools-defensive', target: 'blocks/header/header.js', description: '', precondition: 'H1', replacement: 'h1-fixed' },
];
const FILES: Record<string, string> = {
    'blocks/product-details/product-details.js': 'P1',
    'blocks/header/header.js': 'H1',
    'package.json': '{"name":"@adobe/aem-boilerplate-commerce","version":"4.0.1"}',
};

function githubFileOps() {
    return {
        resetRepoToTemplate: jest.fn().mockResolvedValue({ fileCount: 20, commitSha: 'abc1234567' }),
        getLatestCommitSha: jest.fn().mockResolvedValue(null),
        getFileContent: jest.fn(async (_o: string, _r: string, path: string) =>
            FILES[path] === undefined ? null : { content: FILES[path], sha: 's', path, encoding: 'utf-8' },
        ),
        commitTreeToBranch: jest.fn().mockResolvedValue('f1x0000'),
    };
}

async function reset(demo: ReturnType<typeof makeAddedDemo>, applyDemoFixes?: boolean) {
    const ops = githubFileOps();
    const params = buildParams({
        templateOwner: 'sayurihanki',
        templateRepo: 'aistore',
        project: createMockProject({ name: 'p', path: '/p', selectedBlockLibraries: [], demo }),
        ...(applyDemoFixes ? { applyDemoFixes } : {}),
    });
    const context = createMockHandlerContext({ logger: createMockLogger() });
    const result = await resetRepoToTemplate(params, context, ops as unknown as GitHubFileOperations, jest.fn());
    return { ops, result };
}

beforeEach(() => {
    installDefaults();
    mockLedger.mockResolvedValue(LEDGER);
});

describe('resetRepoToTemplate — fixes on an added demo (EDS-13f)', () => {
    it("re-applies a saved package's ledger to the SC's own repository, and says so", async () => {
        const saved = makeAddedDemo({
            source: { owner: 'sayurihanki', repo: 'aistore' },
            builtWith: {
                template: B2B,
                codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'b2b' },
                codePatches: ['pdp-empty-data-redirect'],
                extension: '1.0.0-beta.150',
            },
        });

        const { ops, result } = await reset(saved);

        expect(ops.commitTreeToBranch).toHaveBeenCalledWith('me', 'shop', 'main', expect.any(Array), 'Demo Builder: 1 fix\n\npdp-empty-data-redirect');
        expect(result.demoFixes).toEqual({ applied: ['pdp-empty-data-redirect'], offered: undefined });
        expect(result.demoCaveats).toEqual(['Demo Builder applied 1 fix to this storefront: empty product pages.']);
    });

    it("offers a colleague's fits and writes nothing when the reset was not asked to apply them", async () => {
        const colleague = makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' }, lineage: { templateRepository: B2B } });

        const { ops, result } = await reset(colleague);

        expect(ops.commitTreeToBranch).not.toHaveBeenCalled();
        expect(result.demoFixes?.offered).toEqual(['pdp-empty-data-redirect', 'header-nav-tools-defensive']);
    });

    it("writes a colleague's fits to the SC's repository when the reset was asked to", async () => {
        const colleague = makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' }, lineage: { templateRepository: B2B } });

        const { ops, result } = await reset(colleague, true);

        expect(ops.commitTreeToBranch).toHaveBeenCalledWith('me', 'shop', 'main', expect.any(Array), expect.stringMatching(/^Demo Builder: 2 fixes/));
        expect(result.demoFixes?.applied).toEqual(['pdp-empty-data-redirect', 'header-nav-tools-defensive']);
    });

    it('reads what the repository is built on after the reset', async () => {
        const { ops, result } = await reset(makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' }, lineage: { templateRepository: B2B } }));

        expect(ops.getFileContent).toHaveBeenCalledWith('me', 'shop', 'package.json', undefined);
        expect(result.boilerplate).toEqual({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' });
    });
});
