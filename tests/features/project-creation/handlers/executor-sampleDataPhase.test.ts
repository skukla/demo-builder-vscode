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

import { executeSampleDataPhase } from '@/features/project-creation/handlers/executor';
import { installSampleData } from '@/features/data-installer/services/sampleDataInstall';
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

function makeProject() {
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
    }) as never;
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

    it('reports progress so the build does not look stalled for minutes', async () => {
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        expect(progress).toHaveBeenCalledWith(
            expect.stringMatching(/datapack/i),
            expect.any(Number),
            expect.any(String)
        );
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

    /** Rule 2 — a failure the user never sees is worse than the failure. */
    it('says so when the import did not land', async () => {
        mockedInstall.mockResolvedValue({ ran: false, reason: 'the service refused' });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        const said = progress.mock.calls.map((c) => String(c[2])).join(' | ');
        expect(said).toMatch(/refused|could not|failed/i);
    });

    it('says so when only some types landed', async () => {
        mockedInstall.mockResolvedValue({
            ran: true,
            outcome: 'partial',
            perType: { categories: 'success', products: 'error' },
        });
        const progress = jest.fn();

        await executeSampleDataPhase(makeContext(), makeProject(), progress);

        const said = progress.mock.calls.map((c) => String(c[2])).join(' | ');
        expect(said).toMatch(/partial|some/i);
    });

    /** A project with no pack must cost the build nothing at all. */
    it('stays silent for a project that chose no sample data', async () => {
        const progress = jest.fn();
        const project = { ...(makeProject() as object), datapack: undefined } as never;

        await executeSampleDataPhase(makeContext(), project, progress);

        expect(mockedInstall).not.toHaveBeenCalled();
        expect(progress).not.toHaveBeenCalled();
    });
});
