/**
 * No reset offers or runs Clear Demo Data (owner, 2026-11-12: "Reset no longer offers Clear; reset
 * stays the approved batch window"). Clear Demo Data is its own command on the Datapacks screen.
 *
 * Driven through the public entry point for every path that reaches it: a batch (`answered`, every
 * screen's Reset since step-05 S4) and an Edit (`withinEdit`). The wipe's
 * own services are faked so that, were reset still to read the store for a clearing, it would find
 * something to clear: the assertions then prove reset never planned, asked or cleared.
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
    extractResetParams: jest
        .fn()
        .mockReturnValue({
            success: true,
            params: { repoOwner: 'test-owner', repoName: 'test-repo' },
        }),
}));
jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/sampleDataInstallDeps', () => ({
    buildSampleDataDeps: jest.fn(() => ({})),
}));
// The wipe's store access and reads: each answers as though the store held things to clear.
jest.mock('@/features/data-installer/services/buildDatapackEngine', () => ({
    ...jest.requireActual('@/features/data-installer/services/buildDatapackEngine'),
    projectCommerce: jest.fn(() => async () => ({ get: jest.fn() })),
}));
jest.mock('@/core/state/otherProjects', () => ({ loadOtherProjects: jest.fn(async () => []) }));
jest.mock('@/features/data-installer/services/demoDataWipe/wipeReads', () => ({
    readWipeStructure: jest.fn(async () => ({})),
}));
jest.mock('@/features/data-installer/services/demoDataWipe/wipeScope', () => ({
    resolveWipeScope: jest.fn(() => ({})),
}));
jest.mock('@/features/data-installer/services/demoDataWipe/wipeClaims', () => ({
    readWipeClaims: jest.fn(async () => ({})),
}));
jest.mock('@/features/data-installer/services/demoDataWipe/wipeErpDeps', () => ({
    findWipeErp: jest.fn(() => undefined),
}));
jest.mock('@/features/data-installer/services/demoDataWipe/wipePlan', () => ({
    planWipe: jest.fn(),
}));
jest.mock('@/features/data-installer/services/demoDataWipe/wipeRun', () => ({
    clearShown: jest.fn(),
}));

import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { planWipe } from '@/features/data-installer/services/demoDataWipe/wipePlan';
import { clearShown } from '@/features/data-installer/services/demoDataWipe/wipeRun';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import { createMockExtensionContext } from '../../../../helpers/extensionContextFake';
import { createMockProject } from '../../../../helpers/projectFake';

const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const mockedPlan = planWipe as jest.MockedFunction<typeof planWipe>;
const mockedClear = clearShown as jest.MockedFunction<typeof clearShown>;
const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;

/** A plan that, if reset still asked, would put its question on screen. Typed whole, so it keeps the plan's shape. */
const PLAN: WipePlan = {
    websiteCodes: ['base'],
    scopeKey: 'base',
    check: {
        websites: [{ code: 'base', name: 'Main Website' }],
        rows: [{ type: 'products', label: 'Products', count: 3, happens: '3 removed' }],
        records: { products: { removed: ['A', 'B', 'C'], kept: [] } },
        total: 3,
        token: 'zz-token',
    },
    deleteSkus: ['A', 'B', 'C'],
    takeOff: [],
    categoryIds: [],
    categoryUnder: {},
    customerIds: [],
    companyIds: [],
    memberOf: {},
    groups: [],
    attributeSets: [],
    attributes: [],
    settings: [],
    listSettings: [],
    ruleIds: [],
    ruleTakeOff: [],
    orders: [],
    alreadyClosed: 0,
    unreadDetails: {},
};

function project(withPack: boolean): Project {
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
        ...(withPack ? { datapack: { name: 'bodea', version: 'main' } } : {}),
    });
}

type ResetOptions = Parameters<typeof resetEdsProjectWithUI>[0];

function run(withPack: boolean, extra: Partial<ResetOptions> = {}) {
    const context = createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({
            saveProject: jest.fn(),
            getCurrentProject: jest.fn(),
        }),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({ secrets: createMockSecretStorage().secrets }),
    });
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps: createMeshDepsFake(),
        project: project(withPack),
        context,
        withinEdit: { report: jest.fn() },
        ...extra,
    });
}

/** Any question put on screen would be answered "Clear Demo Data Too", so asking one would show. */
function answer(): void {
    (vscode.window.showWarningMessage as jest.Mock).mockReset().mockResolvedValue({ title: 'Clear Demo Data Too' });
}

/** Every question the reset put on screen, by its message. */
function questionsAsked(): string[] {
    return (vscode.window.showWarningMessage as jest.Mock).mock.calls.map((call) =>
        String(call[0])
    );
}

function expectNoClear(): void {
    expect(mockedPlan).not.toHaveBeenCalled();
    expect(mockedClear).not.toHaveBeenCalled();
    expect(questionsAsked().some((q) => /clear demo data/i.test(q))).toBe(false);
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
    mockedPlan.mockResolvedValue(PLAN);
});

it('a batch reset (answered in the batch window) never plans or runs Clear', async () => {
    answer();

    await run(true, { answered: { removeDatapack: true } });

    expect(questionsAsked()).toStrictEqual([]);
    expect(mockedReset).toHaveBeenCalledTimes(1);
    expectNoClear();
});

it("an Edit's reset never plans or runs Clear", async () => {
    answer();

    await run(true);

    expect(questionsAsked()).toStrictEqual([]);
    expect(mockedReset).toHaveBeenCalledTimes(1);
    expectNoClear();
});
