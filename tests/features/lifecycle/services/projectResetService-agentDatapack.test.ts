/**
 * The agent's headless reset with Uninstall Datapack (step-05 S7, owner 2026-11-13: "The agent's
 * `reset_project` gets the same uninstall choice as the window"). `executeProjectReset` runs the
 * batch's datapack step (`{ given }`, after the components are read, before anything is removed)
 * and hands back what it did, for the tool to say. One difference, and only here: changes nobody
 * answered stop the reset before anything is removed, so the agent can ask the user and call again.
 *
 * The removal is mocked at its module, so what it is HANDED is asserted.
 */

jest.mock('@/features/eds/services/reset/edsResetSampleData', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetSampleData'),
    removeProjectSampleDataOutcome: jest.fn(),
}));

import {
    authManager,
    commandManager,
    createResetHandlerContext,
    createResetProject,
    executeProjectReset,
    installResetDefaults,
    mockCloneAllComponents,
    mockRm,
    progressReport,
} from './projectResetService-answered.testUtils';
import { removeProjectSampleDataOutcome } from '@/features/eds/services/reset/edsResetSampleData';
import {
    FailedAfterDatapack,
    type AnsweredDatapack,
} from '@/features/eds/services/reset/resetDatapackStep';
import type { Project } from '@/types/base';

const mockedRemove = removeProjectSampleDataOutcome as jest.MockedFunction<
    typeof removeProjectSampleDataOutcome
>;

const withPack = (): Project =>
    createResetProject({
        datapack: { name: 'bodea', version: 'main', store: 'library' },
        componentSelections: { backend: 'adobe-commerce-paas', dependencies: [] },
    });

function run(project: Project, answered?: AnsweredDatapack) {
    const context = createResetHandlerContext();
    return {
        context,
        outcome: executeProjectReset(
            { project, context, commandManager, authManager },
            progressReport,
            answered
        ),
    };
}

beforeEach(() => {
    installResetDefaults();
    mockedRemove.mockResolvedValue({});
});

describe("the agent's headless reset with Uninstall Datapack", () => {
    it("hands the removal this project and the call's answer as given, and says what it did", async () => {
        const project = withPack();
        const { context, outcome } = run(project, { removeDatapack: true, changes: 'drop' });

        await expect(outcome).resolves.toEqual({
            success: true,
            meshRedeployed: false,
            datapackRemoval: {},
        });

        expect(mockedRemove).toHaveBeenCalledTimes(1);
        const [handed, handedContext, , answering] = mockedRemove.mock.calls[0];
        expect(handed).toBe(project);
        expect(handedContext).toBe(context);
        expect(answering).toStrictEqual({ given: 'drop' });
    });

    it('stops before anything is removed when the changes were not answered', async () => {
        const kept = 'You changed 2 things since it was installed. They were not answered.';
        mockedRemove.mockResolvedValue({ kept, unanswered: true });

        await expect(run(withPack(), { removeDatapack: true }).outcome).resolves.toEqual({
            success: false,
            error: kept,
            datapackRemoval: { kept, unanswered: true },
        });
        expect(mockRm).not.toHaveBeenCalled();
        expect(mockCloneAllComponents).not.toHaveBeenCalled();
    });

    it('goes on when the data stayed for another reason, saying so', async () => {
        mockedRemove.mockResolvedValue({ kept: 'Categories could not be removed.', partly: true });

        await expect(
            run(withPack(), { removeDatapack: true, changes: 'drop' }).outcome
        ).resolves.toEqual({
            success: true,
            meshRedeployed: false,
            datapackRemoval: { kept: 'Categories could not be removed.', partly: true },
        });
        expect(mockCloneAllComponents).toHaveBeenCalledTimes(1);
    });

    it('throws a later failure carrying what became of the store', async () => {
        mockCloneAllComponents.mockRejectedValue(new Error('git clone failed'));

        const thrown = await run(withPack(), {
            removeDatapack: true,
            changes: 'drop',
        }).outcome.catch((e: unknown) => e);

        expect(thrown).toBeInstanceOf(FailedAfterDatapack);
        expect(thrown).toMatchObject({ message: 'git clone failed', removal: {} });
    });

    it('CONTROL: with no answer, nothing is removed and the outcome is as before', async () => {
        await expect(run(withPack()).outcome).resolves.toEqual({
            success: true,
            meshRedeployed: false,
        });

        expect(mockedRemove).not.toHaveBeenCalled();
    });
});
