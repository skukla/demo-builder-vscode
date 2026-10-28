/**
 * RENAMED from `edsResetUI-sampleData.test.ts` on 2026-10-08 (EDS-8 split by job):
 * the sample-data step moved to `edsResetSampleData.ts`.
 * A suite is paired with the module it is named for. Still driven through the
 * public entry point; no assertion changed in the rename.
 *
 * Reset and the imported sample data.
 *
 * Reset has always meant "put the STOREFRONT back": repo to template, CDN sync,
 * DA.live content re-copied. Sample data is a different target — products,
 * categories and customers on a live Commerce instance — so folding it in
 * silently would widen what an existing button destroys.
 *
 * So it is a SECOND prompt, and these pin its three properties:
 *
 * 1. **Only when there is something to remove.** A project that recorded no
 *    pack is never asked; an extra modal answering itself is noise.
 * 2. **Opt IN.** Dismissing the prompt keeps the data. Someone resetting code
 *    must not lose a catalog by pressing Escape, which is why dismissal and
 *    "keep" are the same path.
 * 3. **It cannot fail the reset.** The storefront reset is what was asked for;
 *    a failed removal is reported, not fatal.
 *
 * Gated on `project.datapack` rather than asking the service what is installed:
 * a network call in front of a modal adds a failure mode to a dialog, and the
 * removal itself reports when there was nothing there.
 *
 * The mock environment mirrors edsResetPreflight-auth.test.ts. Copied rather than
 * shared because `jest.mock` is hoisted within the file that imports the SUT, so
 * a mock living in another module registers too late.
 */

import {
    mockEnsureAdobeIOAuth,
    mockEnsureDaLiveAuth,
    mockEnsureProjectOrgContext,
    resetEdsProjectWithUI,
    vscode,
    fakeGitHubAppService,
} from './edsResetUI.testUtils';
import type { Project, ProjectStatus } from '@/types/base';
import type { HandlerContext } from '@/types/handlers';

jest.setTimeout(5000);

// =============================================================================
// Mocks - defined before imports
// =============================================================================

jest.mock('@/features/eds/services/reset/edsResetService', () => ({
    executeEdsReset: jest.fn().mockResolvedValue({ success: true, filesReset: 1 }),
}));
jest.mock('@/features/eds/services/reset/edsResetParams', () => ({
    ...jest.requireActual('@/features/eds/services/reset/edsResetParams'),
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));

jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
import { makeDemoPackage, makeStorefront } from '../../../../helpers/demoPackageFixtures';
import { createMeshDepsFake } from '../../../../helpers/meshDepsFake';
import { createMockStateManager } from '../../../../helpers/stateManagerFake';
import { createMockLogger } from '../../../../helpers/loggerFake';
import { createMockHandlerContext } from '../../../../helpers/handlerContextTestHelpers';
import { createMockSecretStorage } from '../../../../helpers/secretStorageFake';
import {
    createStatefulGlobalState,
    createMockExtensionContext,
} from '../../../../helpers/extensionContextFake';

/** Shared fake (PL-16) — this was one of eleven hand-rolled copies. */
const meshDeps = createMeshDepsFake();

const mockedReset = executeEdsReset as jest.MockedFunction<typeof executeEdsReset>;
const mockedRemove = removeSampleData as jest.MockedFunction<typeof removeSampleData>;
const RESET = 'Reset Project';
// The datapack prompt uses MessageItem buttons (its Keep Data button replaces
// the modal's automatic Cancel — user-reported ambiguity, 2026-08-23), so the
// mock resolves the shape VS Code resolves: the item, not a string.
const REMOVE = { title: 'Remove Datapack' };

const testPackages = [
    makeDemoPackage({
        id: 'citisignal',
        storefronts: {
            'eds-paas': makeStorefront({ templateOwner: 'test-owner', templateRepo: 'test-template' }),
        },
    }),
];

function createProject(datapack?: { name: string; version: string }): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        // The shape a REAL project has on disk: the backend on `componentSelections`.
        componentSelections: { backend: 'adobe-commerce-accs' },
        componentConfigs: { 'adobe-commerce-accs': { ACCS_STORE_CODE: 'main_website_store' } },
        componentInstances: {
            'eds-storefront': {
                id: 'eds-storefront',
                name: 'EDS Storefront',
                type: 'frontend',
                status: 'ready',
                metadata: {
                    githubRepo: 'test-owner/test-repo',
                    daLiveOrg: 'test-org',
                    daLiveSite: 'test-site',
                },
            },
        },
        ...(datapack ? { datapack } : {}),
    } as unknown as Project;
}

function createContext(): HandlerContext {
    return createMockHandlerContext({
        logger: createMockLogger(),
        debugLogger: createMockLogger(),
        stateManager: createMockStateManager({
            saveProject: jest.fn(),
            getCurrentProject: jest.fn(),
        }),
        sendMessage: jest.fn(),
        context: createMockExtensionContext({
            globalState: createStatefulGlobalState().globalState,
            secrets: createMockSecretStorage().secrets,
        }),
    });
}

/** The confirm answers, in order: the reset, then the sample-data prompt. */
function answers(...values: Array<string | { title: string } | undefined>): void {
    const mock = vscode.window.showWarningMessage as jest.Mock;
    mock.mockReset();
    for (const value of values) {
        mock.mockResolvedValueOnce(value);
    }
    mock.mockResolvedValue(undefined);
}

/**
 * Let the SUT's dynamic imports and its detached removal check settle.
 *
 * The check is started without being awaited, so nothing the caller returns
 * guarantees it has run. A microtask tick is not enough — `await import()`
 * resolves on the macrotask queue.
 */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

function run(project: Project) {
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps,
        project,
        context: createContext(),
        packages: testPackages,
    });
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
});

describe('resetEdsProjectWithUI — sample data', () => {
    /** Rule 1. */
    it('never asks when the project recorded no pack', async () => {
        answers(RESET);

        await run(createProject());

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('hands the DA.live guard the target org, so its server probe can run', async () => {
        // The locally-valid-but-server-refused gap: without the org, the guard
        // falls back to the local expiry check that let the 2026-08-16 run
        // start a three-minute pipeline on a refused token.
        answers(RESET);

        await run(createProject());

        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(String),
            'test-org'
        );
    });

    it('asks, and names the pack, when one was recorded', async () => {
        answers(RESET, undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        const second = (vscode.window.showWarningMessage as jest.Mock).mock.calls[1];
        expect(String(second[0])).toMatch(/bodea/);
        expect(String(second[0])).toMatch(/datapack/i);
    });

    /** Rule 2 — the important one. */
    it('KEEPS the data when the prompt is dismissed', async () => {
        answers(RESET, undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    /**
     * The data step runs BEFORE the storefront pipeline.
     *
     * The pipeline's last step pre-warms the catalog — it enumerates the
     * instance's SKUs and pre-publishes a PDP page for each. With the data step
     * after it, reset pre-published 30 product pages and then deleted those
     * products; measured in two live runs on 2026-08-17
     * (`Catalog Prewarm: Complete: 30/30` → `EDS project reset successfully` →
     * the delete's 202). Ordered this way the warm cache describes the catalog
     * the user is actually left with.
     *
     * Pinned on invocation order because nothing else can see it: both calls
     * happen, both succeed, and the wrong sequence costs a wasted pre-warm that
     * no assertion about outcomes would notice.
     */
    it('runs the data step BEFORE the storefront reset, so pre-warming is not wasted', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove.mock.invocationCallOrder[0]).toBeLessThan(
            mockedReset.mock.invocationCallOrder[0]
        );
    });

    /** Rule 3. */
    it('still reports the reset as successful when the removal fails', async () => {
        answers(RESET, REMOVE);
        mockedRemove.mockResolvedValue({ ran: false, reason: 'the service refused' });

        const result = await run(createProject({ name: 'bodea', version: 'main' }));

        expect(result.success).toBe(true);
    });

    it('does not throw when the removal itself blows up', async () => {
        answers(RESET, REMOVE);
        mockedRemove.mockRejectedValue(new Error('unexpected'));

        await expect(run(createProject({ name: 'bodea', version: 'main' }))).resolves.toMatchObject(
            { success: true }
        );
    });
});

/**
 * Do not ask for something we cannot deliver.
 *
 * Measured live 2026-08-16: reset offered sample-data removal, ran the full
 * ~3-minute storefront reset, and only THEN reported it could not remove anything.
 * So the question is decided before the prompt.
 *
 * It used to be decided by resolving the project's Commerce credentials. The Data
 * Installer service signs in with its own (DEMOSYS-1698), so what decides it now is
 * whether the project has a Commerce backend to remove the pack from (DI-6).
 */
describe('resetEdsProjectWithUI — asks only when it can deliver', () => {
    it('asks for an ACCS project that saved no Commerce credentials', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
        expect(mockedRemove).toHaveBeenCalled();
    });

    it('does not ask when the project has no Commerce backend', async () => {
        answers(RESET);
        const project = createProject({ name: 'bodea', version: 'main' });
        (project as { componentSelections?: unknown }).componentSelections = undefined;

        await run(project);

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('asks nothing more when the reset is cancelled', async () => {
        answers(undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));
        await flush();

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });
});
