/**
 * appBuilderComponentHandlers Tests — drawer rename + snapshot channel
 * (integrations grid, Step 1: the backend seams the card grid needs)
 *
 * Two additions to the handler bundle, both driven by the integrations grid:
 *   - handleRenameAppBuilderComponent with an INLINE payload `name` (the
 *     drawer's InlineRenameField): skips the extension input box, runs the SAME
 *     validation chain, and round-trips a rejection as `error` for inline
 *     display. A payload WITHOUT a name still routes through the input box.
 *   - the `appBuilderComponentsSnapshot` channel: the whole fresh persisted map
 *     pushed after every terminal op (add success AND failure, deploy terminal,
 *     remove success, rename success) — without it an added card never appears
 *     and a removed card lingers, because the webview's map is seeded once.
 *
 * The add/deploy/remove/verify handlers and the input-box rename live in
 * appBuilderComponentHandlers.test.ts; shared setup in
 * appBuilderComponentHandlers.testUtils.ts.
 *
 * Strict TDD: written BEFORE the seams exist.
 */

import {
    createFreshProject,
    ERP_ENTRY,
    handleAddAppBuilderComponent,
    handleDeployAppBuilderComponent,
    handleRemoveAppBuilderComponent,
    handleRenameAppBuilderComponent,
    mockAddAppBuilderComponent,
    mockDeployAppBuilderComponent,
    mockEnsureAdobeIOAuth,
    mockGetAppBuilderComponentEntry,
    mockRemoveAppBuilderComponent,
    mockHandleRequestStatus,
    mockSendAppBuilderComponentStatusUpdate,
    mockSendAppBuilderComponentsSnapshot,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';

beforeEach(() => {
    resetHandlerMocks();
});

describe('handleRenameAppBuilderComponent — inline payload name (drawer rename)', () => {
    /** Same keyed entry as the input-box describe: deployed, already named. */
    const KEYED_ENTRY = {
        kind: 'integration' as const,
        status: 'deployed' as const,
        name: 'Firefly Image Gen',
        source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
        url: 'https://firefly.example.com',
    };

    function setupPayloadRename(components?: Record<string, unknown>) {
        const mocks = setupMocks({
            appBuilderComponents: components ?? {
                'firefly-image-gen': { ...KEYED_ENTRY },
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Order Sync',
                    source: { owner: 'skukla', repo: 'app-builder-shell', branch: 'main' },
                },
            },
        } as never);
        // A non-catalog instance id (rename must see undefined for the gate).
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);
        return { ...mocks, showInputBox: vscode.window.showInputBox as jest.Mock };
    }

    it('skips the input box entirely and persists the trimmed payload name', async () => {
        const { mockContext, showInputBox } = setupPayloadRename();

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: '  Firefly Video Gen  ',
        });

        expect(result.success).toBe(true);
        expect(showInputBox).not.toHaveBeenCalled();
        const saved = (mockContext.stateManager.saveProject as jest.Mock).mock.calls[0][0];
        expect(saved.appBuilderComponents['firefly-image-gen']).toEqual({
            ...KEYED_ENTRY,
            name: 'Firefly Video Gen',
        });
    });

    it('pushes the named row status (current status + new name) on payload rename', async () => {
        const { mockContext } = setupPayloadRename();

        await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'Firefly Video Gen',
        });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'firefly-image-gen',
            'deployed',
            undefined,
            'Firefly Video Gen'
        );
    });

    it('rejects an empty or whitespace-only payload name with an inline error (no save)', async () => {
        const { mockContext } = setupPayloadRename();

        const empty = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: '',
        });
        const blank = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: '   ',
        });

        expect(empty.success).toBe(false);
        expect(empty.error).toEqual(expect.any(String));
        expect(blank.success).toBe(false);
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
        expect(mockSendAppBuilderComponentStatusUpdate).not.toHaveBeenCalled();
    });

    it('rejects a duplicate of ANOTHER integration display name (case/trim-insensitive)', async () => {
        const { mockContext } = setupPayloadRename();

        const exact = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'Order Sync',
        });
        const variant = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: '  order sync  ',
        });

        expect(exact.success).toBe(false);
        expect(exact.error).toEqual(expect.any(String));
        expect(variant.success).toBe(false);
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('allows the entry’s OWN current name via payload (no-op rename persists)', async () => {
        const { mockContext } = setupPayloadRename();

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'Firefly Image Gen',
        });

        expect(result.success).toBe(true);
        expect(mockContext.stateManager.saveProject).toHaveBeenCalled();
    });

    it('payload rename still rejects a pre-built CATALOG integration', async () => {
        const { mockContext } = setupPayloadRename();
        mockGetAppBuilderComponentEntry.mockReturnValue({ ...ERP_ENTRY, id: 'firefly-image-gen' });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'New Name',
        });

        expect(result.success).toBe(false);
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('payload rename still rejects a mesh-kind entry', async () => {
        const { mockContext } = setupPayloadRename({
            'firefly-image-gen': { ...KEYED_ENTRY, kind: 'mesh' },
        });

        const result = await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'New Name',
        });

        expect(result.success).toBe(false);
        expect(mockContext.stateManager.saveProject).not.toHaveBeenCalled();
    });

    it('PIN: a payload WITHOUT a name still routes through the input box', async () => {
        const { mockContext, showInputBox } = setupPayloadRename();

        await handleRenameAppBuilderComponent(mockContext, { id: 'firefly-image-gen' });

        expect(showInputBox).toHaveBeenCalledWith(
            expect.objectContaining({ value: 'Firefly Image Gen' })
        );
    });
});

describe('appBuilderComponentsSnapshot channel (fresh persisted map after terminal ops)', () => {
    const DEPLOYED_ENTRY = {
        kind: 'integration' as const,
        status: 'deployed' as const,
        name: 'ERP Sync',
        source: { owner: 'acme', repo: 'erp-sync', branch: 'main' },
    };

    it('posts the snapshot with the fresh persisted map after a successful add', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        // Freshness: the map re-read AFTER the runner persisted must ride the
        // snapshot — not the map captured when the handler started (empty).
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockReset();
        (mockContext.stateManager.getCurrentProject as jest.Mock)
            .mockResolvedValueOnce(createFreshProject({}))
            .mockResolvedValue(createFreshProject({ 'erp-sync': DEPLOYED_ENTRY }));

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({
            'erp-sync': DEPLOYED_ENTRY,
        });
    });

    // The dashboard Add flow lets the user pick free Adobe APIs, and those picks
    // have to reach `project.componentApiPicks` BEFORE the runner runs: the
    // subscribe union is `resolveDesiredApis(project)`, so a pick that never lands
    // is never subscribed. Until 2026-08-04 the handler took only the catalog
    // entry — the picks were written into WIZARD state, which the dashboard never
    // persists. Symptom on a real project: "Adobe I/O Events for Commerce" was
    // chosen at add time, componentApiPicks stayed null, the API was never
    // subscribed, and Manage APIs showed nothing preselected.
    it('persists the picked APIs before the runner subscribes', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, {
            id: 'erp-sync',
            apis: ['AdobeIOEventsSDK'],
        } as never);

        const project = mockAddAppBuilderComponent.mock.calls.at(-1)?.[0] as {
            componentApiPicks?: Record<string, string[]>;
        };
        expect(project.componentApiPicks).toEqual({ 'erp-sync': ['AdobeIOEventsSDK'] });
    });

    it('leaves existing picks alone when an add carries none', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // An empty/absent pick set must not write a key: the subscribe PUT sets
        // extras to EXACTLY the union, so an empty entry is harmless but a wrong
        // one is not — and other integrations' picks must survive untouched.
        const project = mockAddAppBuilderComponent.mock.calls.at(-1)?.[0] as {
            componentApiPicks?: Record<string, string[]>;
        };
        expect(project.componentApiPicks?.['erp-sync']).toBeUndefined();
    });

    it('still posts the snapshot after a FAILED add (the entry may have persisted)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': { ...DEPLOYED_ENTRY, status: 'error' } },
        } as never);
        mockTestDeveloperPermissions(true);
        mockAddAppBuilderComponent.mockResolvedValue({ success: false, error: 'clone failed' });

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({
            'erp-sync': { ...DEPLOYED_ENTRY, status: 'error' },
        });
    });

    it('does NOT post a snapshot when an add guard fails (nothing ran, nothing persisted)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockEnsureAdobeIOAuth.mockResolvedValue({ authenticated: false });

        await handleAddAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });

    it('posts the snapshot after a deploy reaches a terminal status (success)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': DEPLOYED_ENTRY },
        } as never);
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({
            'erp-sync': DEPLOYED_ENTRY,
        });
    });

    it('posts the snapshot after a deploy reaches a terminal status (failure)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': DEPLOYED_ENTRY },
        } as never);
        mockTestDeveloperPermissions(true);
        mockDeployAppBuilderComponent.mockResolvedValue({ success: false, error: 'deploy failed' });

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({
            'erp-sync': DEPLOYED_ENTRY,
        });
    });

    it('posts the snapshot after a successful remove (empty map when last entry dropped)', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        // After the runner removed the last entry the fresh persisted map is empty.
        (mockContext.stateManager.getCurrentProject as jest.Mock).mockReset();
        (mockContext.stateManager.getCurrentProject as jest.Mock)
            .mockResolvedValueOnce(createFreshProject({ 'erp-sync': DEPLOYED_ENTRY }))
            .mockResolvedValue(createFreshProject({}));

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledWith({});
    });

    it('does NOT post a snapshot when remove fails', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'erp-sync': DEPLOYED_ENTRY },
        } as never);
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: false,
            error: 'undeploy failed',
        });

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });

    it('posts the snapshot after a successful payload rename', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'custom-app': { ...DEPLOYED_ENTRY, name: 'Old Name' } },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);

        await handleRenameAppBuilderComponent(mockContext, { id: 'custom-app', name: 'New Name' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalled();
    });

    it('posts the snapshot after a successful input-box rename', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'custom-app': { ...DEPLOYED_ENTRY, name: 'Old Name' } },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue('New Name');

        await handleRenameAppBuilderComponent(mockContext, { id: 'custom-app' });

        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalled();
    });

    it('does NOT post a snapshot on a cancelled input-box rename (nothing written)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'custom-app': { ...DEPLOYED_ENTRY, name: 'Old Name' } },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);
        const vscode = require('vscode');
        vscode.window.showInputBox = jest.fn().mockResolvedValue(undefined);

        await handleRenameAppBuilderComponent(mockContext, { id: 'custom-app' });

        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });

    it('does NOT post a snapshot on a rejected payload rename (validation failed, no write)', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: { 'custom-app': { ...DEPLOYED_ENTRY, name: 'Old Name' } },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);

        await handleRenameAppBuilderComponent(mockContext, { id: 'custom-app', name: '   ' });

        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });
});

// The notification and the card each get ONE job.
//
// Both used to narrate the same steps, which read as redundant, so the steps were
// given to the CARD and the notification kept to its title (2026-08-04). Seen
// running, that was backwards: the card is a ~450px tile whose status line renders
// small and uppercase, so "VERIFYING DEPLOYMENT… CHECKING DEPLOYMENT STATUS…"
// wrapped to two shouting lines inside the object's own summary, while the
// notification — which has the room, is transient, and is where VS Code users
// already look for progress — sat on one static line.
//
// Reversed the same day: Notification carries the STEPS under its static title.
// Card names the operation once and holds still.
//
// The invariant survives the swap unchanged: no two surfaces narrate the same
// step, and a path with no card (the projects-list kebab redeploy) still keeps
// step text in its notification — which is now simply the general rule.
describe('progress register', () => {
    it('sends the step detail to the notification', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');
        const report = jest.fn();
        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => task({ report })
        );

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscode.window.withProgress).toHaveBeenCalled();
        expect(report).toHaveBeenCalledWith(
            expect.objectContaining({ message: expect.stringContaining('Checking requirements') })
        );
    });

    it('still names the operation in the notification title', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining('Deploying') }),
            expect.any(Function)
        );
    });

    // Now that the title is the notification's ENTIRE content, a slug is what a
    // palette/background user reads. Add and Remove already pass the display
    // name; Deploy passed the raw id.
    it('names the component, not its id, in the notification title', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'erp-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP Sync',
                    source: { owner: 'acme', repo: 'erp-sync' },
                },
            },
        } as never);
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Deploying ERP Sync' }),
            expect.any(Function)
        );
    });

    it('names the operation on the card, once', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // ONCE is the assertion, not merely "at some point". Before the swap the
        // card received a push per step and one of them happened to read
        // "Deploying…", so a toHaveBeenCalledWith would have passed against the
        // broken code and proved nothing.
        const inProgress = mockSendAppBuilderComponentStatusUpdate.mock.calls.filter(
            (call: unknown[]) => call[1] === 'deploying'
        );
        expect(inProgress).toHaveLength(1);
        // Verb + KIND, never the component name: the card's own heading already
        // carries the name, so "Deploying ERP Sync" under "ERP Sync" would spend
        // the tile's one status line restating its title. The kind is what the
        // heading does NOT say.
        expect(inProgress[0]).toEqual([
            'erp-sync',
            'deploying',
            'Deploying Integration',
            undefined,
        ]);
    });

    it('says "Adding Mesh" on a mesh card', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockGetAppBuilderComponentEntry.mockReturnValue({
            id: 'eds-accs-mesh',
            name: 'EDS ACCS API Mesh',
            description: 'API Mesh',
            kind: 'mesh',
            source: { owner: 'skukla', repo: 'eds-accs-mesh' },
        });

        await handleAddAppBuilderComponent(mockContext, { id: 'eds-accs-mesh' });

        const inProgress = mockSendAppBuilderComponentStatusUpdate.mock.calls.filter(
            (call: unknown[]) => call[1] === 'deploying'
        );
        expect(inProgress).toHaveLength(1);
        expect(inProgress[0][2]).toBe('Adding Mesh');
    });

    // The half of the swap a "does the notification get steps" test cannot see:
    // forwarding to the notification while ALSO leaving the card push in place
    // would pass every other test here and reproduce the double narration the
    // original split existed to remove.
    it('keeps step detail off the card', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        const stepPushes = mockSendAppBuilderComponentStatusUpdate.mock.calls.filter(
            (call: unknown[]) =>
                typeof call[2] === 'string' && /Checking requirements/.test(call[2])
        );
        expect(stepPushes).toEqual([]);
    });
});

// The progress notification must open BEFORE the guards, not after. runGuards
// performs the auth check, whose `aio config get` spawn costs seconds on a cold
// cache — guarding first left the user clicking Add and watching nothing happen
// ("it's not as immediate as it should be", 2026-07-31). Ordering is invisible in
// the UI once it is right, so it is pinned here.
describe('progress opens before the guards run', () => {
    it.each([
        ['add', handleAddAppBuilderComponent],
        ['remove', handleRemoveAppBuilderComponent],
        ['deploy', handleDeployAppBuilderComponent],
    ])('%s: withProgress is entered before runGuards resolves', async (_label, handler) => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');
        const order: string[] = [];

        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => {
                order.push('progress');
                return task({ report: jest.fn() });
            }
        );
        mockEnsureAdobeIOAuth.mockImplementation(async () => {
            order.push('guards');
            return { authenticated: true };
        });

        await handler(mockContext, { id: 'erp-sync' });

        expect(order[0]).toBe('progress');
        expect(order).toContain('guards');
    });
});

// The project status is DERIVED from the component set, so an op that changes
// the set makes it stale — the same reason rename / re-authenticate / forced org
// switch already re-run handleRequestStatus after their mutations.
//
// REGRESSION (2026-08-04, live): removing a mesh left its card on the grid
// reading "MESH DEPLOYED". The keyed entry was cleared and a fresh snapshot was
// sent, but nothing refreshed meshStatus, so the derived card outlived the
// component it described.
describe('status refresh after a set-changing operation', () => {
    // The context must be built INSIDE the test, after the permission mock —
    // an it.each table is evaluated at describe time, before any beforeEach.
    it.each([
        ['add', (ctx: never) => handleAddAppBuilderComponent(ctx, { id: 'erp-sync' })],
        ['deploy', (ctx: never) => handleDeployAppBuilderComponent(ctx, { id: 'erp-sync' })],
        ['remove', (ctx: never) => handleRemoveAppBuilderComponent(ctx, { id: 'erp-sync' })],
    ])('%s re-runs the project status', async (_label, run) => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await run(mockContext as never);

        expect(mockHandleRequestStatus).toHaveBeenCalled();
    });

    // The exclusion, and it is load-bearing: rename is a local metadata write
    // that deliberately runs NO Adobe guards so it works offline, and
    // handleRequestStatus reaches ensureAdobeIOAuth. Folding the refresh into
    // postComponentsSnapshot — which rename also calls — put a guard on the
    // offline path; the pinned no-guards test caught it. Rename does not need a
    // refresh anyway: it changes a display name, not the set.
    it('rename does NOT re-run the project status', async () => {
        const { mockContext } = setupMocks({
            appBuilderComponents: {
                'firefly-image-gen': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'Firefly Image Gen',
                    source: { owner: 'skukla', repo: 'app-builder-shell' },
                },
            },
        } as never);
        mockGetAppBuilderComponentEntry.mockReturnValue(undefined);

        await handleRenameAppBuilderComponent(mockContext, {
            id: 'firefly-image-gen',
            name: 'Renamed',
        });

        expect(mockHandleRequestStatus).not.toHaveBeenCalled();
    });
});
