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
    mockApplyErpOwnership,
    mockRemoveAppBuilderComponent,
    mockSendAppBuilderComponentsSnapshot,
    mockTestDeveloperPermissions,
    resetHandlerMocks,
    setupMocks,
} from './appBuilderComponentHandlers.testUtils';
import * as vscode from 'vscode';
import { ErrorCode } from '@/types/errorCodes';

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
            expect.anything(),
            { force: false },
        );
    });

    it('passes Remove anyway on only for a literal true', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync', force: true });
        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync', force: 'yes' as unknown as boolean });

        expect(mockRemoveAppBuilderComponent.mock.calls.map((call) => call[3])).toEqual([
            { force: true },
            { force: false },
        ]);
    });

    it('a stopped removal hands back its code and refreshes the cards so they offer Remove anyway', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const stopped = { success: false, error: 'Nothing was removed. …', code: ErrorCode.COMPONENT_REMOVAL_STOPPED };
        mockRemoveAppBuilderComponent.mockResolvedValue(stopped);

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toEqual(stopped);
        expect(mockSendAppBuilderComponentsSnapshot).toHaveBeenCalledTimes(1);
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

    it('says leftovers go with the deleted workspace, not to check a namespace that is going', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: true,
            runtimeCleanup: { verified: true, deleted: [], failed: ['kit-b'], goneWithWorkspace: 'Northwind ERP' },
            workspacesDeleted: ['Northwind ERP'],
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        const data = result.data as { warning?: string; workspaces?: string };
        expect(data.warning).toBe(
            'erp-sync was removed. 1 item(s) Runtime would not delete go with the Northwind ERP workspace, ' +
                'which Adobe finishes deleting in about 10 minutes.',
        );
        expect(data.warning).not.toContain('list_runtime_packages');
        expect(data.workspaces).toBe(
            'Deleted the Northwind ERP workspace. Adobe finishes deleting its Runtime space in about 10 ' +
                'minutes; Demo Builder checks, and says so if it does not.',
        );
    });

    it('a clean removal that deleted a workspace says so without a warning', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: true,
            runtimeCleanup: { verified: true, deleted: [], failed: [] },
            workspacesDeleted: ['Northwind ERP'],
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
        expect((result.data as { workspaces?: string }).workspaces).toMatch(/^Deleted the Northwind ERP workspace\./);
    });

    it("says so when the ERP integration's Commerce changes were not all undone", async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const commerceDetach = {
            status: 'failed' as const,
            detail: "The ERP's changes in Commerce were not undone: offline",
        };
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: true, commerceDetach });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result.success).toBe(true);
        const data = result.data as { warning?: string; commerceDetach?: unknown };
        expect(data.warning).toContain('not everything it changed in Commerce was undone');
        expect(data.warning).toContain('offline');
        expect(data.commerceDetach).toEqual(commerceDetach);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(expect.stringContaining('offline'));
    });

    it('hands back a finished undo without a warning', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        const commerceDetach = { status: 'detached' as const, detail: 'Undid 1 company change and cleared 0 ERP order numbers in Commerce.' };
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: true, commerceDetach });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toEqual({ success: true, data: { commerceDetach } });
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it('surfaces the runner error', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({
            success: false,
            error: 'undeploy failed',
        });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(result).toEqual({ success: false, error: 'undeploy failed' });
        expect(mockSendAppBuilderComponentsSnapshot).not.toHaveBeenCalled();
    });
});

describe('handleRemoveAppBuilderComponent — an ERP leaving a multi-ERP integration (AB-70)', () => {

    /** Two ERPs on one integration; the removal mock leaves the record as it is. */
    function twoErps() {
        return setupMocks({
            appBuilderComponents: {
                'erp-integration': {
                    kind: 'integration',
                    status: 'deployed',
                    name: 'ERP Integration',
                    systems: ['demo-erp', 'demo-erp-2'],
                    source: { owner: 'skukla', repo: 'commerce-erp-integration' },
                },
                'demo-erp': { kind: 'system', status: 'deployed', name: 'Justrite ERP', usedBy: 'erp-integration', source: { owner: 'skukla', repo: 'demo-erp' } },
                'demo-erp-2': { kind: 'system', status: 'deployed', name: 'Kukla ERP', usedBy: 'erp-integration', catalogId: 'demo-erp', source: { owner: 'skukla', repo: 'demo-erp' } },
            },
        });
    }

    it('applies ownership across the remaining ERPs after the removal, and says what the pass says', async () => {
        const { mockContext, mockProject } = twoErps();
        mockTestDeveloperPermissions(true);
        mockApplyErpOwnership.mockResolvedValue({ status: 'applied', erps: [], fills: [], unowned: 0, notes: ['Justrite ERP owns every product again.'] });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'demo-erp-2' });

        expect(mockApplyErpOwnership).toHaveBeenCalledWith(mockProject, 'erp-integration', expect.any(Object), 'remove');
        expect(mockApplyErpOwnership.mock.invocationCallOrder[0]).toBeGreaterThan(mockRemoveAppBuilderComponent.mock.invocationCallOrder[0]);
        expect(result).toMatchObject({ success: true, data: { warning: 'Justrite ERP owns every product again.' } });
    });

    it('a pass that could not run is said, and the removal stands', async () => {
        const { mockContext } = twoErps();
        mockTestDeveloperPermissions(true);
        mockApplyErpOwnership.mockResolvedValue({ status: 'failed', detail: 'Adobe sign-in required.' });

        const result = await handleRemoveAppBuilderComponent(mockContext, { id: 'demo-erp-2' });

        expect(result).toMatchObject({
            success: true,
            data: { warning: 'Ownership was not applied across the remaining ERPs: Adobe sign-in required. Use Load demo data on the integration.' },
        });
    });

    it('runs no pass for a component that is not an ERP of an integration', async () => {
        const { mockContext } = setupMocks();
        mockTestDeveloperPermissions(true);

        await handleRemoveAppBuilderComponent(mockContext, { id: 'erp-sync' });

        expect(mockApplyErpOwnership).not.toHaveBeenCalled();
    });

    it('a removal that stopped runs no pass', async () => {
        const { mockContext } = twoErps();
        mockTestDeveloperPermissions(true);
        mockRemoveAppBuilderComponent.mockResolvedValue({ success: false, error: 'stopped', code: ErrorCode.COMPONENT_REMOVAL_STOPPED });

        await handleRemoveAppBuilderComponent(mockContext, { id: 'demo-erp-2' });

        expect(mockApplyErpOwnership).not.toHaveBeenCalled();
    });
});
