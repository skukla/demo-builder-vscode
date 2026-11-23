/**
 * EDS Reset Service — a project imported from a demo bundle (EDS-72 decision 1): the steps are
 * handed the project's own repository as the source and the import's pages, not the brand's
 * template, patches or pages. Brand projects are pinned by the orchestration suite.
 */

const mockCodeServed = jest.fn();
jest.mock('@/features/eds/services/storefront/codeServed', () => ({
    ...jest.requireActual('@/features/eds/services/storefront/codeServed'),
    confirmStorefrontCodeServed: (...args: unknown[]) => mockCodeServed(...args),
}));

import { mockResetRepoToTemplate, resetOrchestrationMocks, runReset } from './edsResetService.orchestrationHarness';
import { createMockProject } from '../../../../helpers/projectFake';

jest.setTimeout(5000);

beforeEach(() => {
    resetOrchestrationMocks();
    mockCodeServed.mockResolvedValue({ files: [] });
});

describe('executeEdsReset — an imported project', () => {
    it("resets from the project's own repository, with the import's pages and none of the brand's patches", async () => {
        const pages = { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' };
        const project = createMockProject({
            name: 'p',
            path: '/p',
            importedFrom: { bundleName: 'Bodea Summit', commit: 'import-commit', contentSource: pages },
        });

        await runReset({ project, codePatches: ['sku-encoding'], codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'p' } });

        const handed = mockResetRepoToTemplate.mock.calls[0][0];
        expect(handed.templateOwner).toBe(handed.repoOwner);
        expect(handed.templateRepo).toBe(handed.repoName);
        expect(handed.contentSource).toStrictEqual(pages);
        expect(handed.codePatches).toBeUndefined();
        expect(handed.codePatchSource).toBeUndefined();
    });
});
