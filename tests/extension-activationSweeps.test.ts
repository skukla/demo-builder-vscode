/**
 * The four upkeep sweeps activation runs, and the order it runs them in.
 *
 * They are fire-and-forget, so nothing awaits them and nothing failed when they
 * did not run at all: `loadAllProjects` threw on the first line, each sweep's own
 * catch swallowed it, and every activation test stayed green over four no-ops.
 * The state-manager mock now answers the project list, which is what makes these
 * assertable.
 *
 * The ORDER is the load-bearing claim. Each sweep loads its own copy of every
 * project, mutates a different field, and saves the whole manifest. Run in
 * parallel, whichever finishes second was built from a copy loaded before the
 * first one wrote — and losing `aiFileHashes` that way makes the ADR-013
 * treat-as-unmodified-once overwrite fire on EVERY activation, destroying a
 * user's edits to AGENTS.md repeatedly instead of once.
 */

import {
    activate,
    deactivate,
    vscode,
    createActivationContext,
    mockHasProject,
    mockGetCurrentProject,
    mockGetAllProjects,
    mockLoadProjectFromPath,
    mockRefreshAiBundles,
    mockRenewPublishKeys,
    mockSweepCommerceSecrets,
    mockSweepManifestFormat,
    mockStateManagerDispose,
} from './extension.testUtils';

/**
 * Let the detached upkeep chain run to completion.
 *
 * Waits on the LAST sweep having fired rather than on a fixed number of ticks:
 * every test here activates the extension, which binds a real MCP socket, and a
 * fixed tick count that is comfortable in a plain run overran Stryker's 5s
 * per-test budget in the instrumented sandbox.
 */
async function settleSweeps(): Promise<void> {
    for (let i = 0; i < 40 && mockSweepManifestFormat.mock.calls.length === 0; i += 1) {
        await new Promise((resolve) => setImmediate(resolve));
    }
}

// Activation is heavier here than in the sibling suites (every test runs the
// whole upkeep chain), and the mutation sandbox is slower still.
jest.setTimeout(20_000);

describe('the activation upkeep sweeps', () => {
    afterEach(() => {
        deactivate();
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace as unknown as { workspaceFolders?: unknown }).workspaceFolders =
            undefined;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
        mockGetAllProjects.mockResolvedValue([
            { name: 'demo-a', path: '/projects/demo-a' },
            { name: 'demo-b', path: '/projects/demo-b' },
        ]);
        mockLoadProjectFromPath.mockImplementation(async (p: string) => ({ name: p, path: p }));
        mockRefreshAiBundles.mockResolvedValue(undefined);
        mockRenewPublishKeys.mockResolvedValue(undefined);
        mockSweepCommerceSecrets.mockResolvedValue(undefined);
        mockSweepManifestFormat.mockResolvedValue(undefined);
    });

    it('runs all four', async () => {
        await activate(createActivationContext());
        await settleSweeps();

        expect(mockRefreshAiBundles).toHaveBeenCalled();
        expect(mockRenewPublishKeys).toHaveBeenCalled();
        expect(mockSweepCommerceSecrets).toHaveBeenCalled();
        expect(mockSweepManifestFormat).toHaveBeenCalled();
    });

    it('runs them ONE AFTER THE OTHER, never in parallel', async () => {
        await activate(createActivationContext());
        await settleSweeps();

        const order = [
            mockRefreshAiBundles.mock.invocationCallOrder[0],
            mockRenewPublishKeys.mock.invocationCallOrder[0],
            mockSweepCommerceSecrets.mock.invocationCallOrder[0],
            mockSweepManifestFormat.mock.invocationCallOrder[0],
        ];
        expect(order).toEqual([...order].sort((a, b) => a - b));
    });

    it('does not let a failing sweep take activation down with it', async () => {
        mockRenewPublishKeys.mockRejectedValue(new Error('helix unreachable'));

        await activate(createActivationContext());
        await settleSweeps();

        expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('hands the secret sweep every project and the extension SecretStorage', async () => {
        const context = createActivationContext();

        await activate(context);
        await settleSweeps();

        const args = mockSweepCommerceSecrets.mock.calls[0][0];
        expect(args.projects.map((p: { path: string }) => p.path)).toEqual([
            '/projects/demo-a',
            '/projects/demo-b',
        ]);
        expect(args.secrets).toBe(context.secrets);
        expect(typeof args.saveProject).toBe('function');
    });

    it('hands the publish-key sweep every project and a DA.live token source', async () => {
        await activate(createActivationContext());
        await settleSweeps();

        const args = mockRenewPublishKeys.mock.calls[0][0];
        expect(args.projects).toHaveLength(2);
        expect(args.tokenProvider).toBeDefined();
        expect(typeof args.saveProject).toBe('function');
    });

    it('hands the manifest sweep the PATHS, and a loader that does not move the pointer', async () => {
        await activate(createActivationContext());
        await settleSweeps();

        const args = mockSweepManifestFormat.mock.calls[0][0];
        expect(args.projectPaths).toEqual(['/projects/demo-a', '/projects/demo-b']);

        mockLoadProjectFromPath.mockClear();
        await args.loadProject('/projects/demo-a');

        // persistAfterLoad: false — the sweep saves config-only itself, and the
        // default load path would also move currentProject and the recents list
        // for every migrated project.
        expect(mockLoadProjectFromPath).toHaveBeenCalledWith('/projects/demo-a', undefined, {
            persistAfterLoad: false,
        });
    });

    it('skips a project the loader cannot read rather than pushing a hole', async () => {
        mockLoadProjectFromPath.mockImplementation(async (p: string) =>
            p === '/projects/demo-b' ? null : { name: p, path: p },
        );

        await activate(createActivationContext());
        await settleSweeps();

        expect(mockSweepCommerceSecrets.mock.calls[0][0].projects).toHaveLength(1);
    });

    it('loads the list ONCE per sweep, not once per sweep per project', async () => {
        await activate(createActivationContext());
        await settleSweeps();

        // Three sweeps load projects; the manifest one reads summaries only.
        expect(mockGetAllProjects.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
});

describe('deactivate()', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockHasProject.mockResolvedValue(false);
        mockGetCurrentProject.mockResolvedValue(undefined);
        (vscode.workspace as unknown as { isTrusted: boolean }).isTrusted = true;
        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue({
            get: jest.fn((_key: string, fallback: unknown) => fallback),
        });
        mockGetAllProjects.mockResolvedValue([]);
    });

    it('disposes the state manager it created', async () => {
        await activate(createActivationContext());

        deactivate();

        expect(mockStateManagerDispose).toHaveBeenCalled();
    });

    it('is safe to call when activation never got that far', () => {
        // Every disposal is optional-chained precisely so this is true: a failed
        // activation must not make shutdown throw as well.
        expect(() => deactivate()).not.toThrow();
    });
});
