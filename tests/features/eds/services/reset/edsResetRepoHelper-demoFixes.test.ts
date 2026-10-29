/**
 * resetRepoToTemplate on an added demo: its code is copied as it is (owner,
 * 2026-10-23, EDS-64). Demo Builder's fixes used to be applied to a saved
 * package, and offered to a colleague's storefront with our lineage (EDS-13f);
 * neither happens now, even when every fix in the ledger would fit. The ledger
 * answers with fixes that fit, so a write would have something to write.
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

async function reset(demo: ReturnType<typeof makeAddedDemo>) {
    const ops = githubFileOps();
    const params = buildParams({
        templateOwner: 'sayurihanki',
        templateRepo: 'aistore',
        project: createMockProject({ name: 'p', path: '/p', selectedBlockLibraries: [], demo }),
    });
    const context = createMockHandlerContext({ logger: createMockLogger() });
    const result = await resetRepoToTemplate(params, context, ops as unknown as GitHubFileOperations, jest.fn());
    return { ops, result };
}

/** Whether the reset wrote a commit of Demo Builder's fixes. */
function wroteFixes(ops: ReturnType<typeof githubFileOps>): boolean {
    return ops.commitTreeToBranch.mock.calls.some(([, , , , message]) => String(message).startsWith('Demo Builder: '));
}

beforeEach(() => {
    installDefaults();
    mockLedger.mockResolvedValue(LEDGER);
});

describe('resetRepoToTemplate — an added demo is copied as it is', () => {
    it("writes no fixes to a saved package's storefront, though its ledger fits", async () => {
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

        expect(wroteFixes(ops)).toBe(false);
        expect('demoFixes' in result).toBe(false);
    });

    it("writes no fixes to a colleague's storefront made from one of our templates, and offers none", async () => {
        const colleague = makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' }, lineage: { templateRepository: B2B } });

        const { ops, result } = await reset(colleague);

        expect(wroteFixes(ops)).toBe(false);
        expect('demoFixes' in result).toBe(false);
        expect('demoCaveats' in result).toBe(false);
    });

    it('reads what the repository is built on after the reset', async () => {
        const { ops, result } = await reset(makeAddedDemo({ source: { owner: 'sayurihanki', repo: 'aistore' }, lineage: { templateRepository: B2B } }));

        expect(ops.getFileContent).toHaveBeenCalledWith('me', 'shop', 'package.json', undefined);
        expect(result.boilerplate).toEqual({ name: '@adobe/aem-boilerplate-commerce', version: '4.0.1' });
    });
});
