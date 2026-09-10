/**
 * How the datapack removal is asked for, narrated and reported.
 *
 * The sibling suite (`edsResetUI-sampleData.test.ts`) pins WHEN the question is
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
jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn().mockResolvedValue({
        ok: true,
        credentials: { kind: 'accs', clientId: 'id', clientSecret: 'fake-test-pw-not-a-secret' },
    }),
}));

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
const REMOVE = { title: 'Remove Datapack' };
const KEEP = { title: 'Keep Data', isCloseAffordance: true };

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
            expect.stringContaining('(bodea@main)'),
            { modal: true },
            REMOVE,
            KEEP,
        );
    });
});

describe('the removal narration', () => {
    it('announces the removal, then relays the runner\'s per-type progress', async () => {
        const context = createContext();

        await run(context);

        expect(report).toHaveBeenCalledWith({ message: 'Removing datapack…' });
        expect(mockedDeps).toHaveBeenCalledWith(
            context,
            expect.objectContaining({ name: 'test-project' }),
            expect.any(Function),
            'remove',
        );

        const relay = mockedDeps.mock.calls[0][2] as (p: SampleDataProgress) => void;
        relay({ verb: 'Removing', done: 1, total: 3, processing: ['Products', 'Categories'] });
        expect(report).toHaveBeenLastCalledWith({
            message: 'Removing datapack (1/3) — Products, Categories',
        });

        relay({ verb: 'Removing', done: 3, total: 3, processing: [] });
        expect(report).toHaveBeenLastCalledWith({ message: 'Removing datapack (3/3)' });
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
