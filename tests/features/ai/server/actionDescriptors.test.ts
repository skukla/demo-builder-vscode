/**
 * ACTION_DESCRIPTORS — assert the destructive rows are wired to the right
 * handler map/type and gated. The dispatch + confirm-gating behavior itself is
 * covered generically in toolDescriptors.test.ts; here we pin the catalog.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';

function row(tool: string) {
    return ACTION_DESCRIPTORS.find((d) => d.tool === tool);
}

describe('ACTION_DESCRIPTORS', () => {
    it('exposes deploy_mesh dispatching to deploy-api-mesh, no arg, no confirm', () => {
        const d = row('deploy_mesh');
        expect(d).toBeDefined();
        expect(d!.map).toBe(meshHandlers);
        expect(d!.type).toBe('deploy-api-mesh');
        // Deploy targets the current project's mesh — no input args.
        expect(d!.inputSchema).toBeUndefined();
        // Deploy is idempotent/reversible (redeploy) — NOT confirm-gated.
        expect(d!.confirm).toBeUndefined();
    });

    it('exposes export_project_settings dispatching to exportProjectSettings, optional args, no confirm', () => {
        const d = row('export_project_settings');
        expect(d).toBeDefined();
        expect(d!.map).toBe(dashboardHandlers);
        expect(d!.type).toBe('exportProjectSettings');
        // Optional path + includeSecrets inputs.
        const keys = Object.keys(d!.inputSchema ?? {});
        expect(keys).toContain('path');
        expect(keys).toContain('includeSecrets');
        // Writing a local settings backup is idempotent — NOT confirm-gated.
        expect(d!.confirm).toBeUndefined();
    });

    it('exposes refresh_block_library dispatching to refresh-block-library, no arg, no confirm', () => {
        const d = row('refresh_block_library');
        expect(d).toBeDefined();
        expect(d!.map).toBe(edsHandlers);
        expect(d!.type).toBe('refresh-block-library');
        // Targets the current project's library — no input args.
        expect(d!.inputSchema).toBeUndefined();
        // Rebuild is idempotent/reversible (re-run) — NOT confirm-gated.
        expect(d!.confirm).toBeUndefined();
    });

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
