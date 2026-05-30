/**
 * ACTION_DESCRIPTORS — assert the destructive rows are wired to the right
 * handler map/type and gated. The dispatch + confirm-gating behavior itself is
 * covered generically in toolDescriptors.test.ts; here we pin the catalog.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
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
});
