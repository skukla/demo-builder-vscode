/**
 * What a reset of an imported project restores (EDS-72 decision 1): the project as it was
 * imported. Its own repository is the source and the import's commit the revision; the brand's
 * patches, assets and pages give way to the import's, and the answer says what it restored.
 */

import { forImportedProject, restoredSentence } from '@/features/eds/services/reset/importedProjectReset';
import type { EdsResetParams } from '@/features/eds/services/reset/edsResetParams';
import { createMockProject } from '../../../../helpers/projectFake';

const SENDER_PAGES = { org: 'sender', site: 'kukla-bodea', indexPath: '/query-index.json' };

function brandParams(project = createMockProject({ name: 'p', path: '/p' })): EdsResetParams {
    return {
        repoOwner: 'acme',
        repoName: 'my-bodea',
        daLiveOrg: 'acme',
        daLiveSite: 'my-bodea',
        templateOwner: 'demo-system-stores',
        templateRepo: 'accs-bodea',
        contentSource: { org: 'brand', site: 'bodea', indexPath: '/full-index.json' },
        accountContentSource: { org: 'b2b', site: 'account' },
        codePatches: ['sku-encoding'],
        codePatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'patches' },
        contentPatches: ['x'],
        contentPatchSource: { owner: 'skukla', repo: 'eds-demo-patches', path: 'content' },
        brandAssets: { source: { owner: 'skukla', repo: 'brand', branch: 'main' }, files: [] },
        byomOverlayUrl: 'https://overlay.example/render',
        project,
    };
}

describe('forImportedProject', () => {
    it('leaves a brand or added-demo project exactly as it came', () => {
        const params = brandParams();
        expect(forImportedProject(params)).toBe(params);
    });

    it("points the reset at the project's own repository and the sender's pages, without the brand's patches", () => {
        const project = createMockProject({
            name: 'p',
            path: '/p',
            importedFrom: { bundleName: 'Bodea Summit', commit: 'import-commit', contentSource: SENDER_PAGES },
        });

        const params = forImportedProject(brandParams(project));

        expect(params).toStrictEqual({
            repoOwner: 'acme',
            repoName: 'my-bodea',
            daLiveOrg: 'acme',
            daLiveSite: 'my-bodea',
            templateOwner: 'acme',
            templateRepo: 'my-bodea',
            contentSource: SENDER_PAGES,
            byomOverlayUrl: 'https://overlay.example/render',
            project,
        });
    });

    it('keeps the pages when the import named no content site', () => {
        const project = createMockProject({ name: 'p', path: '/p', importedFrom: { bundleName: 'Bodea Summit', commit: 'import-commit' } });

        const params = forImportedProject(brandParams(project));

        expect(params.keepContent).toBe(true);
        expect(params).not.toHaveProperty('contentSource');
    });
});

describe('restoredSentence', () => {
    it('names the import and its commit, and nothing for any other project', () => {
        const project = createMockProject({ name: 'p', path: '/p', importedFrom: { bundleName: 'Bodea Summit', commit: '1234567890abcdef' } });
        expect(restoredSentence(project)).toBe('Restored the code to Bodea Summit as it was imported (commit 1234567).');
        expect(restoredSentence(createMockProject({ name: 'p', path: '/p' }))).toBeUndefined();
    });
});
