/**
 * Where project reset asks its second data question (datapack-engine step 10): only after the SC
 * chose to remove the datapack, or when the project names none, and the clearing runs after the
 * pack's removal, so what that took is gone from the list rather than added to it.
 *
 * The question and the clearing have their own suite (`edsResetOtherData.test.ts`); here they are
 * mocked and the ORDER and the condition are asserted, driven through the public entry point.
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
import type { WipePlan } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import type { Project, ProjectStatus } from '@/types/base';

jest.setTimeout(5000);

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn().mockReturnValue({ success: true, params: { repoOwner: 'test-owner', repoName: 'test-repo' } }),
}));
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({ buildSampleDataDeps: jest.fn(() => ({})) }));
jest.mock('@/features/eds/services/reset/edsResetOtherData', () => ({
    beginOtherDataCheck: jest.fn(),
    confirmClearOtherData: jest.fn(),
    clearProjectOtherData: jest.fn(),
}));

import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { beginOtherDataCheck, clearProjectOtherData, confirmClearOtherData } from '@/features/eds/services/reset/edsResetOtherData';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedBegin = beginOtherDataCheck as jest.MockedFunction<typeof beginOtherDataCheck>;
const mockedConfirm = confirmClearOtherData as jest.MockedFunction<typeof confirmClearOtherData>;
const mockedClear = clearProjectOtherData as jest.MockedFunction<typeof clearProjectOtherData>;
const PLAN = { preview: { total: 3 } } as WipePlan;

function project(withPack: boolean): Project {
    return createMockProject({
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_CODE: 'main_website_store' } },
        componentInstances: {
            'eds-storefront': { id: 'eds-storefront', name: 'EDS Storefront', type: 'frontend', status: 'ready', metadata: { githubRepo: 'test-owner/test-repo', daLiveOrg: 'test-org' } },
        },
        ...(withPack ? { datapack: { name: 'bodea', version: 'main' } } : {}),
    });
}

function run(withPack = true) {
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({ saveProject: jest.fn(), getCurrentProject: jest.fn() }),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
    return resetEdsProjectWithUI({ githubAppService: fakeGitHubAppService, meshDeps: createMeshDepsFake(), project: project(withPack), context });
}

/** The reset question answers with its button's text; the data questions with a button. */
function asAnswered(title: string): unknown {
    if (title === 'Reset Project') return title;
    return { title };
}

/** The answers to the reset and the datapack questions, in order. */
function answer(...titles: string[]): void {
    const ask = (vscode.window.showWarningMessage as jest.Mock).mockReset();
    for (const title of titles) ask.mockResolvedValueOnce(asAnswered(title));
    ask.mockResolvedValue(undefined);
}

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.window.withProgress as jest.Mock).mockImplementation(async (_o: unknown, task: (p: { report: jest.Mock }) => Promise<unknown>) => task({ report: jest.fn() }));
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
    mockedBegin.mockResolvedValue(PLAN);
    mockedConfirm.mockResolvedValue(true);
});

it('asks after "Remove Datapack", and clears after the pack is removed', async () => {
    const order: string[] = [];
    mockedRemove.mockImplementation(async () => (order.push('remove pack'), { ran: true, outcome: 'success' }));
    mockedClear.mockImplementation(async () => (order.push('clear the rest'), { cleared: true, sentence: 'Removed 3 things.' }));
    answer('Reset Project', 'Remove Datapack');

    await run();

    expect(mockedConfirm).toHaveBeenCalledWith(vscode, PLAN);
    expect(order).toEqual(['remove pack', 'clear the rest']);
    expect(mockedClear).toHaveBeenCalledWith(expect.objectContaining({ name: 'test-project' }), expect.anything(), expect.any(Function), PLAN);
});

it('never asks, and clears nothing, when the SC keeps the datapack', async () => {
    answer('Reset Project', 'Keep Data');

    await run();

    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockedClear).not.toHaveBeenCalled();
});

it('asks for a project that names no datapack', async () => {
    answer('Reset Project');

    await run(false);

    expect(mockedConfirm).toHaveBeenCalledWith(vscode, PLAN);
    expect(mockedClear).toHaveBeenCalledTimes(1);
});

it('clears nothing when the SC answers Keep Them', async () => {
    mockedConfirm.mockResolvedValue(false);
    answer('Reset Project', 'Remove Datapack');

    await run();

    expect(mockedClear).not.toHaveBeenCalled();
});
