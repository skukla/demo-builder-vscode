/**
 * ACTION_DESCRIPTORS — assert the destructive rows are wired to the right
 * handler map/type and gated. The dispatch + confirm-gating behavior itself is
 * covered generically in toolDescriptors.test.ts; here we pin the catalog.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';

function row(tool: string) {
    return ACTION_DESCRIPTORS.find((d) => d.tool === tool);
}

describe('ACTION_DESCRIPTORS', () => {
    it('exposes delete_mesh as a confirm-gated row dispatching to delete-api-mesh', () => {
        const d = row('delete_mesh');
        expect(d).toBeDefined();
        expect(d!.confirm).toBe(true);
        expect(d!.map).toBe(meshHandlers);
        expect(d!.type).toBe('delete-api-mesh');
        expect(Object.keys(d!.inputSchema ?? {})).toContain('workspaceId');
    });

    it('gates every destructive row (delete_*) on confirm', () => {
        for (const d of ACTION_DESCRIPTORS.filter((r) => r.tool.startsWith('delete_'))) {
            expect(d.confirm).toBe(true);
        }
    });

    it('exposes rename_project dispatching to the current-project rename handler', () => {
        const d = row('rename_project');
        expect(d).toBeDefined();
        expect(d!.map).toBe(dashboardHandlers);
        expect(d!.type).toBe('renameProject');
        expect(Object.keys(d!.inputSchema ?? {})).toContain('newName');
        // Rename is reversible (rename back) — NOT confirm-gated, unlike delete_*.
        expect(d!.confirm).toBeUndefined();
    });

    describe('App Builder integration deploy/redeploy/remove', () => {
        it('deploy_integration dispatches to deployAppBuilderComponent with an id, no confirm', () => {
            const d = row('deploy_integration');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('deployAppBuilderComponent');
            expect(Object.keys(d!.inputSchema ?? {})).toContain('id');
            expect(d!.confirm).toBeUndefined();
        });

        it('redeploy_integration dispatches to redeployAppBuilderComponent with an id, no confirm', () => {
            const d = row('redeploy_integration');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('redeployAppBuilderComponent');
            expect(Object.keys(d!.inputSchema ?? {})).toContain('id');
            expect(d!.confirm).toBeUndefined();
        });

        it('remove_integration is confirm-gated (remote undeploy) with an id', () => {
            const d = row('remove_integration');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('removeAppBuilderComponent');
            expect(Object.keys(d!.inputSchema ?? {})).toContain('id');
            expect(d!.confirm).toBe(true);
        });
    });
});
