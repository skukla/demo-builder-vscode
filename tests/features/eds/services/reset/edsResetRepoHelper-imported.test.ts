/**
 * resetRepoToTemplate for a project imported from a demo bundle (EDS-72 decision 1): the code goes
 * back to the import's own commit, in the project's own repository. No template's head is read,
 * and the update record is left alone: the import commit is not a commit of the brand's template.
 */

import { buildParams, installDefaults, mockGetLatestCommitSha, runReset } from './edsResetRepoHelper.testUtils';
import { createMockProject } from '../../../../helpers/projectFake';

const IMPORT_COMMIT = '1234567890abcdef1234567890abcdef12345678';

beforeEach(() => {
    installDefaults();
});

describe('resetRepoToTemplate — an imported project', () => {
    it("restores its own repository to the import's commit, and records no template commit", async () => {
        const params = buildParams({
            templateOwner: 'me',
            templateRepo: 'shop',
            project: createMockProject({
                name: 'p',
                path: '/p',
                selectedBlockLibraries: [],
                importedFrom: { bundleName: 'Bodea Summit', commit: IMPORT_COMMIT },
            }),
        });

        const { resetMock, result } = await runReset(params);

        expect(resetMock).toHaveBeenCalledWith('me', 'shop', 'me', 'shop', expect.any(Map), IMPORT_COMMIT);
        expect(mockGetLatestCommitSha).not.toHaveBeenCalled();
        expect(result.templateCommitSha).toBeUndefined();
    });
});
