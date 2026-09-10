/**
 * handleRemoveAppBuilderComponent.
 *
 * Split from appBuilderComponentHandlers.test.ts on 2026-09-10 — the AB-7
 * regression tests took that file to 781 lines, past the 750 the CI size check
 * blocks on. Named for its subject, matching the family's other members
 * (-drawer, -edges, -plumbing).
 */
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
    handleRemoveAppBuilderComponent,
    mockRemoveAppBuilderComponent,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import * as vscode from 'vscode';

// The family's shared reset. Dropped on the first attempt at this split, which is
// the playbook's own first rule — extract the shared setup FIRST — and it showed up
// as five auth-guard failures rather than as anything about removal.
beforeEach(() => {
    resetHandlerMocks();
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

    /**
     * AB-7 — "remove_integration reports success while leaving deployed code running".
     *
     * The runner's fix (2b5be4ce0) verifies the Runtime namespace after undeploy and
     * returns a summary. This handler DISCARDED it and answered a bare
     * `{ success: true }`, so a leftover whose delete failed, or a namespace that
     * could not be listed at all, still reached the user as clean success — the
     * original bug, one layer up, for thirteen days after the fix landed.
     *
     * These fail against the pre-2026-09-10 handler.
     */
    it('says so when a leftover is STILL DEPLOYED, instead of a bare success', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: true,
            runtimeCleanup: { verified: true, deleted: ['kit-a'], failed: ['kit-b', 'kit-c'] },
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        // The removal DID happen — the manifest is clean — so it stays a success.
        expect(result.success).toBe(true);
        // But the still-running packages reach BOTH surfaces: the toast for the SC,
        // `data` for an agent, which cannot see a toast.
        const warning = (result.data as { warning?: string }).warning ?? '';
        expect(warning).toContain('kit-b, kit-c');
        expect(warning).toContain('still deployed');
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
            expect.stringContaining('kit-b, kit-c')
        );
        expect((result.data as { runtimeCleanup?: unknown }).runtimeCleanup).toEqual({
            verified: true,
            deleted: ['kit-a'],
            failed: ['kit-b', 'kit-c'],
        });
    });

    it('says so when the namespace could not be listed at all', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: true,
            runtimeCleanup: {
                verified: false,
                deleted: [],
                failed: [],
                note: 'Could not list the namespace',
            },
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect((result.data as { warning?: string }).warning).toContain('Could not list');
        expect(vscode.window.showWarningMessage).toHaveBeenCalled();
    });

    it('stays quiet when the cleanup verified clean — no false alarm', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: true,
            runtimeCleanup: { verified: true, deleted: ['kit-a'], failed: [] },
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect((result.data as { warning?: string }).warning).toBeUndefined();
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
