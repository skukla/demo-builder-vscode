/**
 * resetRepoToTemplate for a project built on an added demo.
 *
 * The template ref is the demo's own branch (D4: their code as it is), the
 * dry check re-runs against that ref on every reset and its caveats ride
 * the result (D23), and none of that happens for a shipped brand.
 */

jest.mock('@/features/eds/services/patches/loadBearingPatches', () => ({
    addedDemoCaveats: jest.fn(),
}));

import { buildParams, installDefaults, runReset } from './edsResetRepoHelper.testUtils';
import { addedDemoCaveats } from '@/features/eds/services/patches/loadBearingPatches';
import { makeAddedDemo } from '../../../../helpers/demoPackageFixtures';
import { createMockProject } from '../../../../helpers/projectFake';

const mockCaveats = addedDemoCaveats as jest.MockedFunction<typeof addedDemoCaveats>;

const CAVEATS = ['Product links may not work.'];

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
    mockCaveats.mockResolvedValue(CAVEATS);
});

describe('resetRepoToTemplate — an added demo', () => {
    it("resets to the demo's own branch when the row names one", async () => {
        const { resetMock } = await runReset(addedDemoParams('demo-2026'));

        expect(resetMock).toHaveBeenCalledWith('jen', 'isle5-demo', 'me', 'shop', expect.any(Map), 'demo-2026');
    });

    it('resets to main when the row names no branch', async () => {
        const { resetMock } = await runReset(addedDemoParams());

        expect(resetMock).toHaveBeenCalledWith('jen', 'isle5-demo', 'me', 'shop', expect.any(Map), 'main');
    });

    it("re-runs the dry check against the demo's row and carries its caveats in the result", async () => {
        const params = addedDemoParams('demo-2026');
        const { result, context } = await runReset(params);

        expect(mockCaveats).toHaveBeenCalledWith(
            params.project.demo,
            { owner: 'jen', repo: 'isle5-demo' },
            context.logger,
        );
        expect(result.demoCaveats).toEqual(CAVEATS);
    });

    it('runs no dry check and carries no caveats for a shipped brand', async () => {
        const { result } = await runReset(buildParams());

        expect(mockCaveats).not.toHaveBeenCalled();
        expect('demoCaveats' in result).toBe(false);
    });
});
