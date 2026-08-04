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
            'Firefly Video Gen',
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
            expect.objectContaining({ value: 'Firefly Image Gen' }),
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
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: false, error: 'undeploy failed' });

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
// Both used to narrate the same steps: `withComponentProgress`'s report pushed
// the identical string to `progress.report` AND to the row status, so a user on
// the Integrations page watched a card say "Checking requirements…" while a
// toast beside it said the same thing in different words. That fan-out was the
// fix for operations running silently (2026-07-31) and is still right for a user
// whose attention is elsewhere — it just needs a coarser register.
//
// Notification: its title, and a spinner. Card: the steps.
describe('progress register', () => {
    it('keeps step detail off the notification', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');
        const report = jest.fn();
        vscode.window.withProgress.mockImplementation(
            async (_o: unknown, task: (p: unknown) => unknown) => task({ report }),
        );

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // Control FIRST: a negative assertion alone would go green if the handler
        // ever bailed before withProgress (a fixture change, a new early return),
        // proving nothing.
        expect(vscode.window.withProgress).toHaveBeenCalled();
        expect(report).not.toHaveBeenCalled();
    });

    it('still names the operation in the notification title', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const vscode = require('vscode');

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscode.window.withProgress).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining('Deploying') }),
            expect.any(Function),
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
            expect.any(Function),
        );
    });

    it('still pushes the step detail to the card', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleDeployAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockSendAppBuilderComponentStatusUpdate).toHaveBeenCalledWith(
            'erp-sync',
            'deploying',
            expect.stringContaining('Checking requirements'),
            undefined, // no endpoint on a progress tick
        );
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
            },
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
