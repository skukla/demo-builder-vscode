/**
 * appBuilderComponentHandlers Tests (D2 Track B — Step 05)
 *
 * The dashboard message handlers that drive the live D1 runner from the
 * integrations grid:
 *   - handleAddAppBuilderComponent     — resolve catalog entry / custom source → guards →
 *                               assemble RunnerDepsContext → addAppBuilderComponent
 *   - handleDeployAppBuilderComponent  — deployAppBuilderComponent {id}
 *   - handleRedeployAppBuilderComponent— deployAppBuilderComponent {id}
 *   - handleRemoveAppBuilderComponent  — removeAppBuilderComponent {id}
 *   - handleRenameAppBuilderComponent  — display-name rename via the input box
 *
 * The guard order is auth → org-mismatch → App Builder permission; a failing guard surfaces the message and NEVER calls the runner.
 *
 * The drawer's inline payload rename and the appBuilderComponentsSnapshot
 * channel live in appBuilderComponentHandlers-drawer.test.ts; shared setup in
 * appBuilderComponentHandlers.testUtils.ts.
 *
 * Strict TDD: written BEFORE the handlers exist.
 */

import {
    ERP_ENTRY,
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRedeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockBuildDefaultRunnerDeps,
    mockBuildRunnerDepsContext,
    mockDeployAppBuilderComponent,
    mockDetectProjectOrgMismatch,
    mockEnsureAdobeIOAuth,
    mockGetAppBuilderComponentEntry,
    mockRemoveAppBuilderComponent,
    mockSendAppBuilderComponentStatusUpdate,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
    mockBuildCustomIntegrationEntry,
} from './appBuilderComponentHandlers.testUtils';

beforeEach(() => {
    resetHandlerMocks();
});





describe('handleAddAppBuilderComponent', () => {
    it('resolves the catalog entry, assembles deps, and calls addAppBuilderComponent', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockBuildRunnerDepsContext).toHaveBeenCalledWith(
            mockContext,
            mockProject,
            // ADR-015: the shared services the handler resolves at the boundary.
            expect.objectContaining({
                authManager: expect.anything(),
                commandManager: expect.anything(),
            })
        );
        expect(mockBuildDefaultRunnerDeps).toHaveBeenCalledWith(
            expect.objectContaining({
                subscriberClient: expect.anything(),
                getCachedOrganization: expect.any(Function),
                secrets: expect.anything(),
            }),
            // The notification's reporter, so the deploy tail's steps reach the
            // user instead of one static title for the whole add.
            expect.any(Function),
            // The toolchain consent: undefined on this interactive path (the
            // fixture context has a panel), so the factory prompt applies.
            undefined
        );
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(
            mockProject,
            ERP_ENTRY,
            expect.anything()
        );
    });

    it('runs guards BEFORE deploying — auth failure does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false, cancelled: true });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('aborts on org mismatch and does NOT call the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockDetectProjectOrgMismatch.mockResolvedValue({
            reachable: false,
            currentOrg: 'Other Org',
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('aborts when the App Builder permission gate fails (no runner call)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(false, 'Developer access required');

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('rejects an unknown catalog id without calling the runner', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'nope' });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('refuses a backend-constrained entry when the project has no matching backend', async () => {
        // The stack gate: galleries filter by axes, but this add-by-id door
        // resolves from the raw catalog — a Commerce-only entry (the starter
        // kit) must be refused on a project whose stack cannot use it. The
        // testUtils project carries no componentSelections, so both axes are ''.
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            compatibleBackends: ['adobe-commerce-paas', 'adobe-commerce-accs'],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('adobe-commerce-paas');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('control: the same constrained entry adds on a project with a listed backend', async () => {
        const { mockContext } = setupMocks({
            componentSelections: { backend: 'adobe-commerce-paas' },
        });
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            compatibleBackends: ['adobe-commerce-paas', 'adobe-commerce-accs'],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
    });

    it('refuses a SECOND extension-layout app from the same source (fixed package names)', async () => {
        // Extension-layout deploys skip the per-id ow-package rewrite, so two
        // apps from one source in one workspace overwrite each other on Runtime
        // whatever ids we mint (AB-2 spike). The id-collision check cannot see a
        // seeded instance under a new name; the same-source scan must.
        const { mockContext } = setupMocks({
            componentSelections: { backend: 'adobe-commerce-paas' },
            appBuilderComponents: {
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'adobe', repo: 'commerce-integration-starter-kit' },
                },
            },
        } as never);
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            id: 'stock-sync',
            layout: 'extension',
            source: { owner: 'adobe', repo: 'commerce-integration-starter-kit' },
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'stock-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toContain('fixed internal package names');
        expect(result.error).toContain('Order Sync');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('control: a second STANDALONE app from the same source still adds (ids isolate it)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'my-app-a': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'erp-sync' },
                },
            },
        } as never);
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({ ...ERP_ENTRY, id: 'my-app-b' });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'my-app-b' });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
    });

    it('routes a custom GitHub URL into an integration entry and deploys it', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, {
            source: { owner: 'owner', repo: 'custom-app' },
        });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                kind: 'integration',
                source: expect.objectContaining({ owner: 'owner', repo: 'custom-app' }),
            }),
            expect.anything()
        );
    });

    it('routes to Configure FIRST when the entry needs bucket-3 user inputs', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
        });

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // Routed to Configure, not silently deployed with a missing secret.
        const vscode = require('vscode');
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('demoBuilder.configureProject');
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    // This branch used to return `{success: true}` for opening a panel and adding
    // NOTHING. Neither the grid, an agent, nor a human reading the transcript
    // could tell that from a completed add. It is the defect the `needsUser`
    // handoff convention was written against.
    it('does NOT report success for the Configure route — nothing was added', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
        });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        // The message must name what is missing — "it failed" is not actionable.
        expect(result.error).toContain('ERP_API_KEY');
        expect(result.error).toContain('ERP Sync');
    });

    // `blocked`, like a guard refusal: nothing ran, so the row must not be
    // painted red as though a deploy had failed.
    it('does not post an error row status for the Configure route', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            envSchema: [{ name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' }],
        });

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalledWith(
            'erp-sync',
            'error',
            expect.anything(),
            expect.anything()
        );
    });

    // Control for the two above: the SAME assertions on an entry needing no
    // inputs must go the other way, or they would pass on a handler that
    // refused every add.
    it('control: an entry needing no user inputs still adds and reports what it added', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        const vscode = require('vscode');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'demoBuilder.configureProject'
        );
        expect(result.success).toBe(true);
        // Not a bare `{success: true}`: the agent needs the id it can now deploy,
        // remove or ask the status of — and for a CUSTOM source it never saw one.
        expect(result.added).toEqual({ id: 'erp-sync', name: 'ERP Sync', kind: 'integration' });
    });

    it('posts an error row status when the runner returns failure (no throw)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockAddAppBuilderComponent.mockResolvedValue({ success: false, error: 'clone failed' });

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('clone failed');
        // Trailing undefined = the optional display-name slot (rename channel);
        // deploy-path pushes never carry a name.
        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'error',
            expect.stringContaining('clone failed'),
            undefined
        );
    });
});

describe('handleDeployAppBuilderComponent / handleRedeployAppBuilderComponent', () => {
    it('deploy routes to the runner deployAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).toHaveBeenCalledWith(
            mockProject,
            'erp-sync',
            expect.anything()
        );
    });

    it('redeploy routes to the runner deployAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRedeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockDeployAppBuilderComponent).toHaveBeenCalledWith(
            mockProject,
            'erp-sync',
            expect.anything()
        );
    });

    it('does not call the runner when a guard fails', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        const result = await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(mockDeployAppBuilderComponent).not.toHaveBeenCalled();
    });
});

describe('handleRemoveAppBuilderComponent', () => {
    it('routes to the runner removeAppBuilderComponent with the id', async () => {
        const { mockContext, mockProject } = setupMocks();
        mockTestDeveloperPermissions(true);

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockRemoveAppBuilderComponent).toHaveBeenCalledWith(
            mockProject,
            'erp-sync',
            expect.anything()
        );
    });

    it('surfaces the runner error', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: false,
            error: 'undeploy failed',
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toBe('undeploy failed');
    });
});

describe('handleRenameAppBuilderComponent (display name only — shell instancing Step 10)', () => {
    /** The keyed integration entry under rename (deployed, already named). */
    const KEYED_ENTRY = {
        kind: 'integration' as const,
        status: 'deployed' as const,
        name: 'Firefly Image Gen',
        source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
        url: 'https://firefly.example.com',
    };

    function setupRename(entryOverrides: Partial<typeof KEYED_ENTRY> | null = {}) {
        const mocks = setupMocks({
            appBuilderComponents:
                entryOverrides === null
                    ? {}
                    : { 'firefly-image-gen': { ...KEYED_ENTRY, ...entryOverrides } },
        } as never);
        // An AI-built instance id never resolves in the catalog (the beforeEach
        // default returns ERP_ENTRY for the add path — rename must see undefined).
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);
        return { ...mocks, showInputBox: vscode.window.showInputBox as jest.Mock };
    }

    it('persists the trimmed new name on the keyed entry and saves the project', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('  Firefly Video Gen  ');

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true);
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls[0][0];
        // The name changes IN PLACE on the keyed entry — id (map key), kind,
        // status, source, and url are untouched.
        expect(saved.appBuilderComponents['firefly-image-gen']).toEqual({
            ...KEYED_ENTRY,
            name: 'Firefly Video Gen',
        });
    });

    // Same rule as the add path: `defaultShape` renders a bare success as "{}",
    // so `rename_integration` would answer an agent with nothing at all. The
    // TRIMMED name is the part worth returning — it is not what the caller sent.
    it('reports what it renamed, not a bare success', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('  Firefly Video Gen  ');

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.renamed).toEqual({ id: 'firefly-image-gen', name: 'Firefly Video Gen' });
    });

    it('pushes the row-status refresh with the CURRENT status and the new name (label update)', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('Firefly Video Gen');

        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'firefly-image-gen',
            'deployed',
            undefined,
            'Firefly Video Gen'
        );
    });

    it('prefills the input with the current display name (falls back to the id when unnamed)', async () => {
        const { mockContext, showInputBox } = setupRename();
        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });
        expect(showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'Firefly Image Gen' })
        );

        const unnamed = setupRename({ name: undefined });
        await handleRenameAppBuilderComponent(unnamed.mockContext, { id: 'firefly-image-gen' });
        expect(unnamed.showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'firefly-image-gen' })
        );
    });

    it('rejects whitespace-only input via the validateInput fn (tested directly)', async () => {
        const { mockContext, showInputBox } = setupRename();
        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        const { validateInput } = showInputBox.mock.calls[0][0];
        expect(validateInput('   ')).toEqual(expect.any(String)); // rejected with a message
        expect(validateInput('')).toEqual(expect.any(String));
        expect(validateInput('Firefly Video Gen')).toBeUndefined(); // accepted
    });

    it('cancel (input box dismissed) writes NOTHING and pushes nothing', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue(undefined);

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true); // cancel is not an error
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('rejects a rename when the id is a pre-built CATALOG integration (redeploy reverts it)', async () => {
        // The runner resolves catalog-first and rewrites `name: entry.name` on
        // every redeploy, so a catalog-id rename would be silently reverted.
        // Same exclusion the settings serializer applies (deriveAppBuilderComponentSources).
        const { mockContext, showInputBox } = setupRename();
        mockGetAppBuilderComponentEntry.mockReturnValue({
            ...ERP_ENTRY,
            id: 'firefly-image-gen',
        });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('still renames a custom-import entry (id not in the catalog)', async () => {
        const { mockContext, showInputBox } = setupRename({
            name: undefined,
            source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
        });
        showInputBox.mockResolvedValue('Acme ERP');

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(true);
        expect(mockGetAppBuilderComponentEntry).toHaveBeenCalledWith('firefly-image-gen');
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls[0][0];
        expect(saved.appBuilderComponents['firefly-image-gen'].name).toBe('Acme ERP');
    });

    it('rejects a duplicate of ANOTHER integration display name via validateInput (wizard parity)', async () => {
        // Same case-insensitive, trimmed duplicate rule RenameIntegrationModal
        // applies in the wizard — against the OTHER entries' `name ?? id`.
        const mocks = setupMocks({
            appBuilderComponents: {
                'firefly-image-gen': { ...KEYED_ENTRY },
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                },
                'unnamed-import': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'acme', repo: 'unnamed-import', branch: 'main' },
                },
            },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);

        await handleRenameAppBuilderComponent(mocks.mockContext, { id: 'firefly-image-gen' });

        const { validateInput } = (vscode.window.showInputBox as jest.Mock).mock.calls[0][0];
        expect(validateInput('Order Sync')).toEqual(expect.any(String)); // exact duplicate
        expect(validateInput('  order sync  ')).toEqual(expect.any(String)); // case/trim variant
        expect(validateInput('unnamed-import')).toEqual(expect.any(String)); // other row's id fallback
        expect(validateInput('Firefly Image Gen')).toBeUndefined(); // own current name allowed
        expect(validateInput('Fresh Name')).toBeUndefined(); // new unique name allowed
    });

    it('never prompts for a mesh-kind entry (fixed "API Mesh" identity)', async () => {
        const { mockContext, showInputBox } = setupRename({ kind: 'mesh' as never });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
        });

        expect(result.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('fails for an unknown id and for a missing id', async () => {
        const { mockContext, showInputBox } = setupRename(null);

        const unknown = await handleRenameAppBuilderComponent(mockContext, { id: 'nope' });
        expect(unknown.success).toBe(false);

        const missing = await handleRenameAppBuilderComponent(mockContext, {});
        expect(missing.success).toBe(false);
        expect(showInputBox).not.toHaveBeenCalled();
    });

    it('runs NO Adobe guards — rename is a local metadata write (works offline)', async () => {
        const { mockContext, showInputBox } = setupRename();
        showInputBox.mockResolvedValue('Renamed');

        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        expect(mockEnsureAdobeIOAuth).not.toHaveBeenCalled();
        expect(mockDetectProjectOrgMismatch).not.toHaveBeenCalled();
    });
});

/**
 * Duplicate-id adds (2026-08-06).
 *
 * `resolveAddEntry` returns a catalog entry UNCHANGED for an `{ id }` add, and
 * falls back to `${owner}-${repo}` for a custom source with no instance. Neither
 * mints a fresh id, so a second add of the same thing reuses it — and the id is
 * simultaneously the keyed slot in `appBuilderComponents`, the clone folder, and
 * (via `deriveOwPackage`) the OpenWhisk package. Letting it through silently
 * replaces the first integration with the second, in the state file AND on
 * Runtime, with no error anywhere.
 *
 * Blank instances are exempt: they mint a collision-checked id from the user's
 * name, which is what makes several of them legitimate.
 */
describe('handleAddAppBuilderComponent — duplicate ids', () => {
    it('refuses a catalog entry already present, without calling the runner', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'deployed' },
            },
        } as never);
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/already/i);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('refuses a custom source whose derived id is already present', async () => {
        mockBuildCustomIntegrationEntry.mockReturnValue({
            id: 'acme-erp-sync',
            name: 'acme-erp-sync',
            description: 'Custom App Builder component from acme/erp-sync',
            kind: 'integration',
            source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
        });
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'acme-erp-sync': { kind: 'integration', status: 'deployed' },
            },
        } as never);
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, {
            source: { owner: 'acme', repo: 'erp-sync' },
        });

        expect(result.success).toBe(false);
        expect(mockAddAppBuilderComponent).not.toHaveBeenCalled();
    });

    it('ALLOWS re-adding an entry left in error — that is the documented retry', async () => {
        // The runner persists status:'error' when the clone succeeded but the
        // deploy failed, and keeps the folder. Adding again is how the user
        // recovers, so the duplicate guard must not stand in the way.
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': { kind: 'integration', status: 'error' },
            },
        } as never);
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
    });

    it('still allows an add whose id is NOT present', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'other-thing': { kind: 'integration' } },
        } as never);
        mockTestDeveloperPermissions(true);

        const result = await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(mockAddAppBuilderComponent).toHaveBeenCalled();
    });
});
