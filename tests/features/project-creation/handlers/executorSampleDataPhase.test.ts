/**
 * RENAMED from `executor-sampleDataPhase.test.ts` on 2026-09-07 (PL-45): these tests
 * exercise symbols defined in `executorSampleDataPhase.ts`, and the old filename
 * paired the suite with `executor.ts`, which only re-exports them —
 * so every kill was credited to a module these tests never constrain.
 * The import now names the declaring module directly.
 * The suite's own description follows.
 */

/**
 * The build's sample-data phase.
 *
 * The wizard records a pack (Sample Data) and a scope (Business Structure), and
 * the Connection sub-step has already proven the instance is reachable. This
 * phase is what turns those into an actual import instead of a note the
 * dashboard reads later.
 *
 * What these pin is the phase's CONTRACT with the build, not the import itself —
 * `sampleDataInstall` owns that and has its own suite. Two rules matter here:
 *
 * 1. **It cannot fail the build.** Whatever the install reports, the phase
 *    returns normally. A project is complete without sample data, and by the
 *    time an import goes wrong the instance is already partly written — failing
 *    creation would mark a good project bad and leave the mess anyway.
 * 2. **It reports what happened.** Silence would be worse than failure: the
 *    user asked for a pack and has no other way to learn it did not land.
 *
 * Strict TDD: written BEFORE the phase exists.
 */

import { executeSampleDataPhase } from '@/features/project-creation/handlers/executorSampleDataPhase';
import { installSampleData } from '@/features/data-installer/services/sampleDataInstall';
import type { Project } from '@/types/base';
import { createMockLogger } from '../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../helpers/extensionContextFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

import { createMockProject } from '../../../helpers/projectFake';
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    installSampleData: jest.fn(),
}));

const mockedInstall = installSampleData as jest.MockedFunction<typeof installSampleData>;

function makeContext() {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        sendMessage: jest.fn(),
        stateManager: createMockStateManager({ saveProject: jest.fn() }),
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
    });
}

function makeProject(): Project {
    return createMockProject({
        name: 'demo-1',
        datapack: { name: 'bodea', version: 'main' },
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: {
            'adobe-commerce-accs': {
                ACCS_WEBSITE_CODE: 'base',
                ACCS_STORE_VIEW_CODE: 'default',
            },
        },
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockedInstall.mockResolvedValue({ ran: true, outcome: 'success', perType: {} });
});

describe('executeSampleDataPhase', () => {
    it('installs the pack the wizard recorded', async () => {
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(mockedInstall).toHaveBeenCalled();
    });

    /**
     * The opening line names the pack, because it is the only moment the user is
     * told WHICH pack the minutes ahead are spent on. Pinned exactly — a phase
     * that announced an empty label would look identical to one that never ran.
     */
    it('opens by naming the pack it is about to install', async () => {
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenNthCalledWith(
            1,
            'Installing Datapack',
            92,
            'Installing bodea\u2026'
        );
    });

    /** The pack, the scope and the credentials all travel in the project itself. */
    it('hands the installer the project the build is creating', async () => {
        const project = makeProject();

        await executeSampleDataPhase(makeContext(), project, jest.fn());

        expect(mockedInstall).toHaveBeenCalledWith(project, expect.any(Object));
    });

    /** Rule 1 — the whole reason this phase is separate from the ones that throw. */
    it('does NOT throw when the install fails', async () => {
        mockedInstall.mockResolvedValue({ ran: false, reason: 'the service refused' });

        await expect(
            executeSampleDataPhase(makeContext(), makeProject(), jest.fn())
        ).resolves.toBeUndefined();
    });

    it('does NOT throw even when the install itself blows up', async () => {
        mockedInstall.mockRejectedValue(new Error('unexpected'));

        await expect(
            executeSampleDataPhase(makeContext(), makeProject(), jest.fn())
        ).resolves.toBeUndefined();
    });

    /**
     * Not throwing is only half of it. Reaching this arm means the wiring broke,
     * which is the case with no other symptom at all — swallowing it silently
     * would leave the build claiming a pack it never attempted.
     */
    it('reports the broken wiring instead of swallowing it', async () => {
        mockedInstall.mockRejectedValue(new Error('unexpected'));
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Datapack could not be installed \u2014 unexpected'
        );
    });

    it('reports a thrown non-Error as the value it was', async () => {
        mockedInstall.mockRejectedValue('the module was not there');
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Datapack could not be installed \u2014 the module was not there'
        );
    });

    /** Rule 2 — a failure the user never sees is worse than the failure. */
    it('says so when the import did not land', async () => {
        mockedInstall.mockResolvedValue({ ran: false, reason: 'the service refused' });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Datapack could not be installed \u2014 the service refused'
        );
    });

    /**
     * The same line with the service silent about why. The fallback is the whole
     * point: `undefined` in the sentence would read as a bug in us rather than a
     * refusal by the service.
     */
    it('says the import did not start when the service gave no reason', async () => {
        mockedInstall.mockResolvedValue({ ran: false });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Datapack could not be installed \u2014 the import did not start'
        );
    });

    /**
     * Skipped is not failed — nothing was wrong and nothing was written. Saying
     * "could not be installed" for a pack that had nothing to install would send
     * the user to the dashboard to retry a job that will skip again.
     */
    it('distinguishes a skipped pack from a failed one', async () => {
        mockedInstall.mockResolvedValue({
            ran: false,
            skipped: true,
            reason: 'this instance already holds every type',
        });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Skipped datapack \u2014 this instance already holds every type'
        );
    });

    it('says nothing to install when a skip carries no reason', async () => {
        mockedInstall.mockResolvedValue({ ran: false, skipped: true });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Skipped datapack \u2014 nothing to install'
        );
    });

    /** The clean outcome, named so the three failure lines above stay distinct. */
    it('names the pack it installed when everything landed', async () => {
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith('Installing Datapack', 96, 'Installed bodea');
    });

    it('says so when only some types landed', async () => {
        mockedInstall.mockResolvedValue({
            ran: true,
            outcome: 'partial',
            perType: { categories: 'success', products: 'error' },
        });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenLastCalledWith(
            'Installing Datapack',
            96,
            'Installed bodea partially \u2014 some data types did not land. Retry from the dashboard.'
        );
    });

    /**
     * The three-row contract, driven through the REAL `buildSampleDataDeps`.
     *
     * `installSampleData` is mocked, so nothing here calls the callback by
     * itself — the deps object the installer was handed is taken back out of the
     * mock and its `onProgress` invoked, which is the only way this callback is
     * ever reached in production too. Asserting the arguments the progress line
     * receives is the point: the count belongs in the title and the types being
     * written belong in the detail row, and a callback that reported neither
     * would leave the bar frozen at "Installing bodea" for the whole import.
     */
    describe('the live progress line', () => {
        async function driveProgress(
            perType: Record<string, 'pending' | 'processing' | 'success' | 'error'>
        ): Promise<jest.Mock> {
            const progress = jest.fn();
            await executeSampleDataPhase(makeContext(), makeProject(), progress);
            const deps = mockedInstall.mock.calls[0]?.[1];
            deps?.onProgress?.(perType);
            return progress;
        }

        it('puts the count in the title and the types in flight in the detail row', async () => {
            const progress = await driveProgress({
                categories: 'success',
                products: 'processing',
                attribute_sets: 'processing',
            });

            expect(progress).toHaveBeenCalledWith(
                'Installing Datapack (1/3)',
                94,
                'Products, Attribute sets'
            );
        });

        /**
         * Between types nothing is processing, and an empty detail row would read
         * as a stall. The pack name holds the line until the next type starts.
         */
        it('falls back to the pack name when no type is in flight', async () => {
            const progress = await driveProgress({ categories: 'success', products: 'pending' });

            expect(progress).toHaveBeenCalledWith('Installing Datapack (1/2)', 94, 'bodea');
        });

        /** Errors are finished work too — a failed type must not stall the count. */
        it('counts a failed type as done', async () => {
            const progress = await driveProgress({ categories: 'error', products: 'processing' });

            expect(progress).toHaveBeenCalledWith('Installing Datapack (1/2)', 94, 'Products');
        });
    });

    /** A project with no pack must cost the build nothing at all. */
    it('stays silent for a project that chose no sample data', async () => {
        const progress = jest.fn();
        const project: Project = { ...makeProject(), datapack: undefined };

        await executeSampleDataPhase(makeContext(), project, progress);

        expect(mockedInstall).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });
});
