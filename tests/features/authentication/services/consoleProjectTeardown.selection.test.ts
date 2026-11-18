/**
 * The teardown owns the two jobs a door used to have to remember (PL-104 fix 8):
 * it refuses ids that are not Adobe resource ids before any call, and once the project
 * is gone it clears the aio Console selection when that pointed at it. The agent's
 * `delete_adobe_project` did neither, because the spine handed the clear back as
 * `shouldClearConsoleSelection` and only the button read it.
 */

import { teardownConsoleProject } from '@/features/authentication/services/consoleProjectTeardown';
import { NOT_PROJECT_OWNER_MESSAGE } from '@/features/authentication/services/projectOwnership';
import { TARGET, makeHarness } from './consoleProjectTeardown.testUtils';

describe('teardownConsoleProject, the Console selection', () => {
    it('clears the selection for the deleted project once the project is gone', async () => {
        const harness = makeHarness({ credentials: {} });

        const result = await teardownConsoleProject(harness.deps, TARGET);

        expect(result.projectDeleted).toBe(true);
        expect(harness.deps.clearConsoleSelectionIfCurrent).toHaveBeenCalledWith('proj1');
        const [deleted] = harness.deps.deleteConsoleProject.mock.invocationCallOrder;
        const [cleared] = harness.deps.clearConsoleSelectionIfCurrent.mock.invocationCallOrder;
        expect(cleared).toBeGreaterThan(deleted);
    });

    it('leaves the selection alone when the project was not deleted', async () => {
        const harness = makeHarness({ credentials: {} });
        harness.deps.deleteConsoleProject.mockRejectedValue(new Error('409'));

        const result = await teardownConsoleProject(harness.deps, TARGET);

        expect(result.projectDeleted).toBe(false);
        expect(harness.deps.clearConsoleSelectionIfCurrent).not.toHaveBeenCalled();
    });

    it('still reports the project deleted when the clear fails', async () => {
        const harness = makeHarness({ credentials: {} });
        harness.deps.clearConsoleSelectionIfCurrent.mockRejectedValue(new Error('store locked'));

        const result = await teardownConsoleProject(harness.deps, TARGET);

        expect(result).toMatchObject({ success: true, projectDeleted: true });
    });
});

describe('teardownConsoleProject, the ids', () => {
    it.each([
        ['project', { ...TARGET, projectId: '../../etc' }],
        ['org', { ...TARGET, orgId: 'org1/../other' }],
    ])('refuses a %s id that is not an Adobe resource id, before any call', async (_which, target) => {
        const harness = makeHarness({ credentials: {} });

        const result = await teardownConsoleProject(harness.deps, target);

        expect(result).toMatchObject({ success: false, projectDeleted: false });
        expect(result.items).toEqual([
            expect.objectContaining({ kind: 'project', outcome: 'failed', error: expect.stringMatching(/^Invalid Adobe resource ID/) }),
        ]);
        expect(harness.deps.getAccessToken).not.toHaveBeenCalled();
        expect(harness.deps.getWorkspaces).not.toHaveBeenCalled();
        expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
    });
});

describe('teardownConsoleProject, who may delete', () => {
    // Only the project's creator may delete it. The button checked that and the agent's
    // `delete_adobe_project` did not (walk F270), so the teardown owns it for every door.
    it('refuses a project the signed-in person did not create, before any call', async () => {
        const harness = makeHarness({ credentials: {} });
        harness.deps.isProjectOwner.mockResolvedValue(false);

        const result = await teardownConsoleProject(harness.deps, TARGET);

        expect(harness.deps.isProjectOwner).toHaveBeenCalledWith({ orgId: 'org1', projectId: 'proj1' });
        expect(result).toMatchObject({ success: false, projectDeleted: false });
        expect(result.items).toEqual([
            expect.objectContaining({ kind: 'project', outcome: 'failed', error: NOT_PROJECT_OWNER_MESSAGE }),
        ]);
        expect(harness.deps.getAccessToken).not.toHaveBeenCalled();
        expect(harness.deps.getWorkspaces).not.toHaveBeenCalled();
        expect(harness.deps.deleteConsoleProject).not.toHaveBeenCalled();
    });

    it('deletes a project the signed-in person created', async () => {
        const harness = makeHarness({ credentials: {} });

        const result = await teardownConsoleProject(harness.deps, TARGET);

        expect(harness.deps.isProjectOwner).toHaveBeenCalledTimes(1);
        expect(result.projectDeleted).toBe(true);
    });
});
