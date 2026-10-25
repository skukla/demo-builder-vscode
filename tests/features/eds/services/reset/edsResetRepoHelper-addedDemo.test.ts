/**
 * resetRepoToTemplate for a project built on an added demo.
 *
 * The template ref is the demo's own branch (D4: their code as it is). The dry
 * check of Demo Builder's fixes against it is gone with the fixes (EDS-64).
 */

import { buildParams, installDefaults, mockGetLatestCommitSha, runReset } from './edsResetRepoHelper.testUtils';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockProject } from '../../../../helpers/projectFake';

function addedDemoParams(branch?: string) {
    return buildParams({
        templateOwner: 'jen',
        templateRepo: 'isle5-demo',
        project: createMockProject({
            name: 'p',
            path: '/p',
            selectedBlockLibraries: [],
            demo: makeAddedDemo({ source: { owner: 'jen', repo: 'isle5-demo', ...(branch ? { branch } : {}) } }),
        }),
    });
}

beforeEach(() => {
    // installDefaults resets every mock, the factory's answer included.
    installDefaults();
});

describe('resetRepoToTemplate — an added demo', () => {
    it("resets to the demo's own branch when the row names one", async () => {
        const { resetMock } = await runReset(addedDemoParams('demo-2026'));

        expect(resetMock).toHaveBeenCalledWith('jen', 'isle5-demo', 'me', 'shop', expect.any(Map), 'demo-2026');
    });

    it("pins to the head of the demo's own branch, and records that commit", async () => {
        const sha = 'abcdef0123456789abcdef0123456789abcdef01';
        mockGetLatestCommitSha.mockResolvedValue(sha);

        const { resetMock, result } = await runReset(addedDemoParams('demo-2026'));

        expect(mockGetLatestCommitSha).toHaveBeenCalledWith('jen', 'isle5-demo', 'demo-2026');
        expect(resetMock).toHaveBeenCalledWith('jen', 'isle5-demo', 'me', 'shop', expect.any(Map), sha);
        expect(result.templateCommitSha).toBe(sha);
    });

    it('resets to main when the row names no branch', async () => {
        const { resetMock } = await runReset(addedDemoParams());

        expect(resetMock).toHaveBeenCalledWith('jen', 'isle5-demo', 'me', 'shop', expect.any(Map), 'main');
    });
});
