/**
 * RENAMED from `edsResetUI-removalReporting.test.ts` on 2026-10-08 (EDS-8 split by job):
 * the sample-data step moved to `edsResetSampleData.ts`.
 * A suite is paired with the module it is named for. Still driven through the
 * public entry point; no assertion changed in the rename.
 *
 * How the datapack removal is asked for, narrated and reported.
 *
 * The sibling suite (`edsResetSampleData.test.ts`) pins WHEN the question is
 * asked and that a refusal cannot fail the reset. This one pins the rest, which
 * mutation testing (PL-22, batch MUT-07) found unconstrained:
 *
 * - the prompt's two buttons, and that Keep Data is the close affordance
 * - the progress line, before and during the removal
 * - the three-level report: a clean removal says nothing, a refusal is a
 *   warning, data removed-but-broken is an ERROR
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
import type { SampleDataProgress } from '@/features/data-installer/services/sampleDataInstallDeps';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(() => ({})),
}));

import { startModalRun } from '@/core/vscode/operationProgress';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { buildSampleDataDeps } from '@/features/data-installer/services/sampleDataInstallDeps';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedDeps = buildSampleDataDeps as jest.MockedFunction<typeof buildSampleDataDeps>;
const meshDeps = createMeshDepsFake();
const RESET = 'Reset Project';
const REMOVE = { title: 'Uninstall Datapack' };
const KEEP = { title: 'Keep Datapack', isCloseAffordance: true };

function createProject(): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_CODE: 'main_website_store' } },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: { githubRepo: 'test-owner/test-repo', daLiveOrg: 'test-org' },
            },
        },
        datapack: { name: 'bodea', version: 'main' },
    });
}

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({ saveProject: jest.fn(), getCurrentProject: jest.fn() }),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
}

const report = jest.fn();

function run(context = createContext()) {
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps,
        project: createProject(),
        context,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.showWarningMessage as jest.Mock)
        .mockReset()
        .mockResolvedValueOnce(RESET)
        .mockResolvedValueOnce(REMOVE)
        .mockResolvedValue(undefined);
    (vscode.window.withProgress as jest.Mock).mockImplementation(
        async (_options: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) =>
            task({ report }),
    );
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
});

describe('the datapack prompt', () => {
    it('is modal, names the pack, and makes Keep Data the close affordance', async () => {
        await run();

        expect(vscode.window.showWarningMessage).toHaveBeenNthCalledWith(
            2,
            expect.stringMatching(/^Uninstall .+ Too\?$/u),
            { modal: true, detail: expect.stringContaining('Deletes what it installed in Commerce.') },
            REMOVE,
            KEEP,
        );
    });
});

describe('the removal narration', () => {
    it('announces the removal, then relays the runner\'s per-type progress', async () => {
        const context = createContext();

        await run(context);

        expect(report).toHaveBeenCalledWith({ message: 'Uninstalling the datapack' });
        expect(mockedDeps).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ name: 'test-project' }),
            expect.any(Function),
            'remove',
        );

        const relay = mockedDeps.mock.calls[0][2] as (p: SampleDataProgress) => void;
        // A notification shows the step alone: the count of types is the line under
        // it, never the step's position (progress vocabulary slice 5, 2026-10-16).
        relay({ done: 1, total: 3, processing: ['Products', 'Categories'] });
        expect(report).toHaveBeenLastCalledWith({ message: 'Uninstalling the datapack' });

        relay({ done: 3, total: 3, processing: [] });
        expect(report).toHaveBeenLastCalledWith({ message: 'Uninstalling the datapack' });
    });
});

// Found by the first mutation run of edsResetSampleData on its own (EDS-8,
// 2026-10-08): the types being worked on are the STEP under the stage, which only
// a screen's modal shows (a notification shows the stage line alone), so no test
// above could see it.
describe('the removal narration in a screen\'s modal', () => {
    it('shows the types removed and in flight as the line under the step, never as its position', async () => {
        const send = jest.fn().mockResolvedValue(undefined);
        startModalRun('reset-modal', send);

        await resetEdsProjectWithUI({
            githubAppService: fakeGitHubAppService,
            meshDeps,
            project: createProject(),
            context: createContext(),
            progress: 'modal',
            operationId: 'reset-modal',
        });
        const relay = mockedDeps.mock.calls[0][2] as (p: SampleDataProgress) => void;
        relay({ done: 1, total: 3, processing: ['Products', 'Categories'] });

        expect(send).toHaveBeenLastCalledWith(
            'operationProgress',
            expect.objectContaining({
                id: 'reset-modal',
                state: 'running',
                stage: 'Uninstalling the datapack',
                step: '1 of 3 data types: Products, Categories',
            }),
        );
        expect(send.mock.calls.filter(([, payload]) => (payload as { position?: unknown })?.position)).toStrictEqual([]);
    });
});

describe('the removal report', () => {
    it('says nothing on a clean removal', async () => {
        const context = createContext();

        await run(context);

        expect(context.logger.error).not.toHaveBeenCalled();
        expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it('is an ERROR when the removal ran and did not succeed — the instance is now broken', async () => {
        mockedRemove.mockResolvedValue({ ran: true, outcome: 'failed', reason: 'two types errored' });
        const context = createContext();

        await run(context);

        expect(context.logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Sample data was NOT removed: two types errored'),
        );
        expect(context.logger.warn).not.toHaveBeenCalled();
    });

    it('is a WARNING when the removal was refused before running', async () => {
        mockedRemove.mockResolvedValue({ ran: false, reason: 'the service refused' });
        const context = createContext();

        await run(context);

        expect(context.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Sample data was not removed: the service refused'),
        );
        expect(context.logger.error).not.toHaveBeenCalled();
    });

    it.each([
        ['error', { ran: true, outcome: 'failed' }],
        ['warn', { ran: false }],
    ])('reads "no reason given" on the %s line when none came back', async (level, outcome) => {
        mockedRemove.mockResolvedValue(outcome);
        const context = createContext();

        await run(context);

        expect(context.logger[level as 'error' | 'warn']).toHaveBeenCalledWith(
            expect.stringContaining('no reason given'),
        );
    });

    it('is a WARNING that the reset stands when the removal throws', async () => {
        mockedRemove.mockRejectedValue(new Error('unexpected'));
        const context = createContext();

        const result = await run(context);

        expect(result.success).toBe(true);
        expect(context.logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('Sample data removal failed, reset stands: unexpected'),
        );
    });
});

// The S7 b defect (step-05 R1): a reset's removal never cleared the project's pack, so the card
// showed it installed after the reset. The trap: the reset's `finally` saves the project object it
// holds, so a clear on any other copy would be written back over by that last save.
describe('the project record after the reset', () => {
    const resetWith = async (project: Project, context: HandlerContext) =>
        resetEdsProjectWithUI({ githubAppService: fakeGitHubAppService, meshDeps, project, context });
    const lastSaved = (context: HandlerContext): Project | undefined =>
        jest.mocked(context.stateManager.saveProject).mock.calls.at(-1)?.[0];

    it('names no datapack in the reset\'s last save once the removal took everything', async () => {
        const context = createContext();
        const project = createProject();

        await resetWith(project, context);

        expect(lastSaved(context)).toBe(project);
        expect(lastSaved(context)?.datapack).toBeUndefined();
    });

    it('still names the datapack when the removal left part of it in Commerce', async () => {
        mockedRemove.mockResolvedValue({ ran: true, outcome: 'success', leftInStore: true });
        const context = createContext();

        await resetWith(createProject(), context);

        expect(lastSaved(context)?.datapack).toStrictEqual({ name: 'bodea', version: 'main' });
    });

    it('CONTROL: still names the datapack when the SC kept it', async () => {
        (vscode.window.showWarningMessage as jest.Mock).mockReset().mockResolvedValueOnce(RESET).mockResolvedValue(KEEP);
        const context = createContext();

        await resetWith(createProject(), context);

        expect(mockedRemove).not.toHaveBeenCalled();
        expect(lastSaved(context)?.datapack).toStrictEqual({ name: 'bodea', version: 'main' });
    });
});
