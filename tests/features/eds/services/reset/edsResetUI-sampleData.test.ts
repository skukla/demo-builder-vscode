/**
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
 * The mock environment mirrors edsResetUI-auth.test.ts. Copied rather than
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
    // Lives in edsResetService too — mocking the module with only executeEdsReset
    // wipes it, and the SUT dies on a missing function before reaching anything
    // this file is about.
    extractResetParams: jest.fn().mockReturnValue({
        success: true,
        params: { repoOwner: 'test-owner', repoName: 'test-repo' },
    }),
}));

jest.mock('@/features/data-installer/services/sampleDataInstall', () => ({
    ...jest.requireActual('@/features/data-installer/services/sampleDataInstall'),
    removeSampleData: jest.fn(),
}));
jest.mock('@/features/data-installer/services/commerceCredentials', () => ({
    resolveCommerceCredentials: jest.fn(),
}));

// =============================================================================
// Imports (after mocks)
// =============================================================================

import { removeSampleData } from '@/features/data-installer/services/sampleDataInstall';
import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';
import { executeEdsReset } from '@/features/eds/services/reset/edsResetService';
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
const mockedCredentials = resolveCommerceCredentials as jest.MockedFunction<
    typeof resolveCommerceCredentials
>;
const RESET = 'Reset Project';
// The datapack prompt uses MessageItem buttons (its Keep Data button replaces
// the modal's automatic Cancel — user-reported ambiguity, 2026-08-23), so the
// mock resolves the shape VS Code resolves: the item, not a string.
const REMOVE = { title: 'Remove Datapack' };

const testPackages = [
    {
        id: 'citisignal',
        storefronts: {
            'eds-paas': { templateOwner: 'test-owner', templateRepo: 'test-template' },
        },
    },
] as unknown as Parameters<typeof resetEdsProjectWithUI>[0]['packages'];

function createProject(datapack?: { name: string; version: string }): Project {
    return {
        name: 'test-project',
        path: '/test/project',
        status: 'running' as ProjectStatus,
        created: new Date(),
        lastModified: new Date(),
        selectedPackage: 'citisignal',
        selectedStack: 'eds-paas',
        // The shape a REAL project has on disk. `stackBackend` is deliberately
        // absent: it is not persisted, and inventing it here is what let the
        // dispatch bug below survive every existing test.
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
 * Let the SUT's dynamic imports and its detached credential promise settle.
 *
 * The lookup is started without being awaited, so nothing the caller returns
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
    mockedCredentials.mockResolvedValue({ ok: true, credentials: { kind: 'accs' } } as never);
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

    it('removes only when the removal is explicitly chosen', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedRemove).toHaveBeenCalled();
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

    /** Cancelling the reset cancels everything — the second prompt never runs. */
    it('does not ask about data when the reset itself is cancelled', async () => {
        answers(undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
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
 * ~3-minute storefront reset, and only THEN reported "This project has no usable
 * Commerce credentials." The prompt should never have appeared.
 *
 * The gate was `project.datapack` alone, justified by "a network call in front of
 * a modal adds a failure mode to a dialog".
 *
 * **That justification has since half come true, and the conclusion still holds.**
 * `resolveCommerceCredentials` now DOES make a network call for an ACCS project
 * with no declared pair: it asks the shared discovery service for the credential
 * such a project cannot mint itself. What made the original reasoning wrong was
 * never the absence of a network call — it was that the alternative is three
 * minutes of irreversible reset behind a question that could not be honoured. A
 * bounded GET that degrades silently does not add a failure mode; it removes one.
 *
 * The credential requirement is not incidental. A Data Installer write needs an
 * OAuth S2S pair, which exists only inside an Adobe I/O project and workspace, so
 * a package that selects no App Builder components has nowhere for one to live —
 * which is exactly the gap the broker fills.
 */
describe('resetEdsProjectWithUI — asks only when it can deliver', () => {
    it('does not ask when the project has no usable Commerce credentials', async () => {
        mockedCredentials.mockResolvedValue({
            ok: false,
            reason: 'needs-accs-credentials',
        } as never);
        answers(RESET);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    it('still asks when the credentials resolve', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
        expect(mockedRemove).toHaveBeenCalled();
    });

    /**
     * THE TRAP THIS TEST EXISTS FOR.
     *
     * This call site passed `{ project }` and nothing else for its whole life.
     * Adding the broker parameter to `resolveCommerceCredentials` does not force
     * it to be supplied — the parameter is optional so the callers that cannot
     * build one keep working — so forgetting it here leaves every other test in
     * this repo green while the feature is inert on the path it was built for: a
     * project with no App Builder components, which is the only kind that has no
     * pair of its own.
     *
     * Asserted on the ARGUMENT rather than on any resulting behaviour, because
     * the resolver is mocked here and would report success either way.
     */
    it('supplies a broker, so a project with no workspace can still be offered removal', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ broker: expect.any(Function) })
        );
    });

    /**
     * THE SECOND TRAP, and the one that actually shipped.
     *
     * `resolveCommerceCredentials` dispatches on `stackBackend` — a CredentialProject
     * field that is NOT persisted, mapped from `componentSelections.backend` at every
     * call site. This one passed the raw Project through `as never`, so `stackBackend`
     * was undefined, neither backend branch matched, and it returned
     * `unsupported-backend` BEFORE the broker was built. The prompt never appeared for
     * any project, and no credential line was ever logged.
     *
     * Measured live 2026-08-17: an import recorded `bodea@main` at 00:00:20, the reset
     * at 00:03:38 asked nothing, and the debug channel — which carries this call site's
     * logger, confirmed by a control line from the same logger — held no `[Reset]`
     * credential line at all.
     *
     * Asserted on the ARGUMENT because the resolver is mocked here: with the mock
     * returning ok, every behavioural test above passed while the real dispatch fell
     * through. `importHandlers` carries a comment about the identical failure one
     * shape earlier (`stack?.backend`), whose fixtures shared the invented shape and
     * so agreed with the bug — which is exactly why this asserts the mapping itself.
     */
    it('maps stackBackend from componentSelections, so the dispatch can match', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        expect(mockedCredentials).toHaveBeenCalledWith(
            expect.objectContaining({
                project: expect.objectContaining({
                    stackBackend: 'adobe-commerce-accs',
                    componentConfigs: expect.objectContaining({
                        'adobe-commerce-accs': expect.anything(),
                    }),
                }),
            })
        );
    });

    /**
     * CONTROL for the test above: the assertion must be sensitive to the mapping,
     * not merely to a field existing. A project whose backend is absent must NOT
     * produce the ACCS value — otherwise the test would pass against code that
     * hardcodes it.
     */
    it('CONTROL — an absent backend maps to empty, never to a guessed one', async () => {
        answers(RESET, REMOVE);
        const project = createProject({ name: 'bodea', version: 'main' });
        (project as { componentSelections?: unknown }).componentSelections = undefined;

        await run(project);

        expect(mockedCredentials).toHaveBeenCalledWith(
            expect.objectContaining({ project: expect.objectContaining({ stackBackend: '' }) })
        );
    });

    /** Checked BEFORE the prompt, not during the reset it would follow. */
    it('resolves credentials before asking, not after resetting', async () => {
        answers(RESET, REMOVE);

        await run(createProject({ name: 'bodea', version: 'main' }));

        const askedAt = (vscode.window.showWarningMessage as jest.Mock).mock.invocationCallOrder[1];
        const checkedAt = mockedCredentials.mock.invocationCallOrder[0];
        expect(checkedAt).toBeLessThan(askedAt);
    });

    /**
     * The lookup starts before the FIRST modal, not between the two.
     *
     * Reported live 2026-08-17: the second prompt took ~2s to appear after the
     * first was confirmed. The cost is not the HTTP call (130-230ms measured) but
     * the IMS token behind it — `tokenManager.inspectToken` spawns the whole `aio`
     * CLI when its inspection cache is cold, which its own comment puts at ~3.7s.
     * Nothing here makes that faster; starting it against a dialog the user is
     * already reading is what removes the wait.
     *
     * Pinned on ordering because it is the entire point and is otherwise invisible:
     * awaiting in the old place passes every other test in this file.
     */
    it('runs the credential lookup WHILE the reset confirmation is still open', async () => {
        // Held open, so "did the lookup happen yet?" is a question about overlap
        // rather than about call order. Ordering alone cannot express this: the
        // lookup sits behind two dynamic imports, so it is always invoked a
        // microtask AFTER the modal opens — which is exactly what makes it
        // concurrent with the modal rather than after it.
        let releaseFirstModal!: (answer: string) => void;
        const firstModal = new Promise<string>((resolve) => {
            releaseFirstModal = resolve;
        });
        const mock = vscode.window.showWarningMessage as jest.Mock;
        mock.mockReset();
        mock.mockReturnValueOnce(firstModal);
        mock.mockResolvedValueOnce(REMOVE);
        mock.mockResolvedValue(undefined);

        const pending = run(createProject({ name: 'bodea', version: 'main' }));
        await flush();

        // The user has not answered anything yet.
        expect(mockedCredentials).toHaveBeenCalled();

        releaseFirstModal(RESET);
        await pending;
    });

    /**
     * Cancelling costs one discarded lookup — acceptable, and asserted so the
     * trade-off is a decision rather than an accident. It must NOT cost a second
     * prompt.
     */
    it('starts it even if the reset is then cancelled, and asks nothing', async () => {
        answers(undefined);

        await run(createProject({ name: 'bodea', version: 'main' }));
        await flush();

        expect(mockedCredentials).toHaveBeenCalledTimes(1);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    /**
     * CONTROL for the unawaited promise: a rejecting lookup must degrade to "do
     * not ask", never surface as an unhandled rejection or fail the reset. It is
     * held across a modal, so a throw here has no caller to catch it.
     */
    it('CONTROL — a lookup that throws keeps the reset successful and asks nothing', async () => {
        answers(RESET);
        mockedCredentials.mockRejectedValue(new Error('discovery service down'));

        const result = await run(createProject({ name: 'bodea', version: 'main' }));

        expect(result.success).toBe(true);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
        expect(mockedRemove).not.toHaveBeenCalled();
    });

    /** No pack, no credential lookup — nothing to spend it on. */
    it('does not even look when the project chose no pack', async () => {
        answers(RESET);

        await run(createProject());

        expect(mockedCredentials).not.toHaveBeenCalled();
    });
});
