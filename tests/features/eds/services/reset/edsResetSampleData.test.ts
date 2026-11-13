/**
 * RENAMED from `edsResetUI-sampleData.test.ts` on 2026-10-08 (EDS-8 split by job):
 * the sample-data step moved to `edsResetSampleData.ts`.
 * A suite is paired with the module it is named for.
 *
 * Reset and the imported sample data. Since step-05 S5 the question is asked before anything
 * runs: by Edit (`executorEditApply.ts`, through `confirmSampleDataRemoval`) or by the batch
 * window, whose answer reaches the reset as `answered.removeDatapack`.
 *
 * Reset has always meant "put the STOREFRONT back": repo to template, CDN sync,
 * DA.live content re-copied. Sample data is a different target — products,
 * categories and customers on a live Commerce instance — so folding it in
 * silently would widen what an existing button destroys.
 *
 * So it is a SEPARATE question, and these pin its three properties:
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
import {
    beginSampleDataRemovalCheck,
    confirmSampleDataRemoval,
} from '@/features/eds/services/reset/edsResetSampleData';
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
// The datapack prompt uses MessageItem buttons (its Keep Data button replaces
// the modal's automatic Cancel — user-reported ambiguity, 2026-08-23), so the
// mock resolves the shape VS Code resolves: the item, not a string.
const REMOVE = { title: 'Uninstall Datapack' };

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

/** The question's answers, in order. */
function answers(...values: Array<string | { title: string } | undefined>): void {
    const mock = vscode.window.showWarningMessage as jest.Mock;
    mock.mockReset();
    for (const value of values) {
        mock.mockResolvedValueOnce(value);
    }
    mock.mockResolvedValue(undefined);
}

/** The reset as a batch runs it, with the SC's Uninstall Datapack answer. */
function run(project: Project, removeDatapack = true) {
    return resetEdsProjectWithUI({
        githubAppService: fakeGitHubAppService,
        meshDeps,
        project,
        context: createContext(),
        packages: testPackages,
        withinEdit: { report: jest.fn() },
        answered: { removeDatapack },
    });
}

/** The question as Edit asks it (`executorEditApply.ts`): gated on the same check. */
function ask(project: Project): Promise<boolean> {
    return confirmSampleDataRemoval(project, vscode, beginSampleDataRemovalCheck(project));
}

beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureDaLiveAuth.mockResolvedValue({ authenticated: true });
    mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: true });
    mockEnsureProjectOrgContext.mockResolvedValue({ reachable: true });
    mockedRemove.mockResolvedValue({ ran: true, outcome: 'success' });
});

describe('the question', () => {
    /** Rule 1. */
    it('never asks when the project recorded no pack', async () => {
        await expect(ask(createProject())).resolves.toBe(false);

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('asks, and names the pack, when one was recorded', async () => {
        answers(undefined);

        await ask(createProject({ name: 'bodea', version: 'main' }));

        const first = (vscode.window.showWarningMessage as jest.Mock).mock.calls[0];
        // A question, never the pack's id (review, 2026-11-10): "Uninstall My Luma Too?".
        expect(String(first[0])).toMatch(/^Uninstall .+ Too\?$/u);
        expect(String(first[0])).not.toMatch(/bodea@main/u);
    });

    /** Rule 2 — the important one. */
    it('KEEPS the data when the prompt is dismissed', async () => {
        answers(undefined);

        await expect(ask(createProject({ name: 'bodea', version: 'main' }))).resolves.toBe(false);
    });

    /**
     * Do not ask for something we cannot deliver. Measured live 2026-08-16: reset offered
     * sample-data removal, ran the full ~3-minute storefront reset, and only THEN reported it
     * could not remove anything. It used to be decided by resolving the project's Commerce
     * credentials; the Data Installer service signs in with its own (DEMOSYS-1698), so what
     * decides it now is whether the project has a Commerce backend (DI-6).
     */
    it('asks for an ACCS project that saved no Commerce credentials', async () => {
        answers(REMOVE);

        await expect(ask(createProject({ name: 'bodea', version: 'main' }))).resolves.toBe(true);
    });

    it('does not ask when the project has no Commerce backend', async () => {
        const project = createProject({ name: 'bodea', version: 'main' });
        (project as { componentSelections?: unknown }).componentSelections = undefined;

        await expect(ask(project)).resolves.toBe(false);

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });
});

describe('resetEdsProjectWithUI — sample data, answered', () => {
    it('removes nothing when the project recorded no pack', async () => {
        await run(createProject());

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('runs the DA.live guard before the reset', async () => {
        // The guard asks IMS, so a locally-valid token IMS no longer accepts stops
        // here rather than three minutes into the pipeline (2026-08-16, 2026-10-28).
        await run(createProject());

        expect(mockEnsureDaLiveAuth).toHaveBeenCalledWith(expect.anything(), expect.any(String));
    });

    it('KEEPS the data when the SC did not tick Uninstall Datapack', async () => {
        await run(createProject({ name: 'bodea', version: 'main' }), false);

        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('removes nothing when the project has no Commerce backend', async () => {
        const project = createProject({ name: 'bodea', version: 'main' });
        (project as { componentSelections?: unknown }).componentSelections = undefined;

        await run(project);

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

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove.mock.invocationCallOrder[0]).toBeLessThan(
            mockedReset.mock.invocationCallOrder[0]
        );
    });

    /** Rule 3. */
    it('still reports the reset as successful when the removal fails', async () => {
        mockedRemove.mockResolvedValue({ ran: false, reason: 'the service refused' });

        const result = await run(createProject({ name: 'bodea', version: 'main' }));

        expect(result.success).toBe(true);
    });

    it('does not throw when the removal itself blows up', async () => {
        mockedRemove.mockRejectedValue(new Error('unexpected'));

        await expect(run(createProject({ name: 'bodea', version: 'main' }))).resolves.toMatchObject(
            { success: true }
        );
    });
});
