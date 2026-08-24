/**
 * ACTION_DESCRIPTORS — assert the destructive rows are wired to the right
 * handler map/type and gated. The dispatch + confirm-gating behavior itself is
 * covered generically in toolDescriptors.test.ts; here we pin the catalog.
 */

import { ACTION_DESCRIPTORS } from '@/features/ai/server/actionDescriptors';
import { dashboardHandlers } from '@/features/dashboard/handlers/dashboardHandlers';
import { meshHandlers } from '@/features/mesh/handlers/meshHandlers';
import { edsHandlers } from '@/features/eds/handlers/edsHandlers';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import { projectsListHandlers } from '@/features/projects-dashboard/handlers/projectsListHandlers';

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
        // Targets the current project's library — the only arg is the gate.
        expect(Object.keys(d!.inputSchema ?? {})).toEqual([]);
        // Confirm-gated. This row used to assert the opposite, on the reasoning
        // that a rebuild is "idempotent/reversible (re-run)". Locally it is —
        // but it runs with skipPublish: false, so the re-sync reaches the live
        // site. Reversible-for-the-filesystem is not the bar.
        expect(d!.confirm).toBe(true);
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

    // The delete_* rule above only catches tools that SAY delete. It would not
    // have caught refresh_block_library or promote_block_to_library, both of
    // which published to a live site ungated. Pinning the exact set means adding
    // a destructive tool forces a deliberate edit here rather than sliding in.
    it('pins the exact confirm-gated set', () => {
        const gated = ACTION_DESCRIPTORS.filter((d) => d.confirm).map((d) => d.tool);
        expect(gated.sort()).toEqual([
            'delete_ai_prompt',
            'delete_mesh',
            // Not destructive, and gated anyway: it runs package managers (fnm,
            // npm, brew) on the user's machine and can take minutes. The rule
            // this row stretches is that a confirm gate is about SURPRISE as much
            // as about loss.
            'install_prerequisite',
            'refresh_block_library',
            'remove_integration',
            // Says "set", not "delete", and removes on a live workspace credential
            // — exactly the case the delete_* rule above cannot see.
            'set_console_apis',
        ]);
    });

    describe('Group 5 — lifecycle', () => {
        it('restart_demo dispatches to restartDemo with no args', () => {
            const d = row('restart_demo');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('restartDemo');
            expect(d!.inputSchema).toBeUndefined();
            expect(d!.confirm).toBeUndefined();
        });

        it('set_current_project FORCES forceNewWindow off', () => {
            const d = row('set_current_project');
            expect(d).toBeDefined();
            expect(d!.map).toBe(projectsListHandlers);
            expect(d!.type).toBe('selectProject');
            expect(Object.keys(d!.inputSchema ?? {})).toEqual(['projectPath']);

            // The load-bearing half. `forceNewWindow: true` is the shift-click
            // gesture — it opens a SECOND VS Code window and leaves the current one
            // on the projects list, so an agent could both take over the screen and
            // then act on a window the user is not looking at. Forced, not
            // defaulted: `runHandler` applies argDefaults LAST, so a caller sending
            // `true` cannot win.
            expect(d!.argDefaults).toEqual({ forceNewWindow: false });
            // And it must not be offered as an argument either, or the force above
            // would just be silently overriding something the schema advertised.
            expect(Object.keys(d!.inputSchema ?? {})).not.toContain('forceNewWindow');
        });

        it('set_project_pinned takes a path and a boolean, no confirm', () => {
            const d = row('set_project_pinned');
            expect(d).toBeDefined();
            expect(d!.map).toBe(projectsListHandlers);
            expect(d!.type).toBe('setProjectPinned');
            expect(Object.keys(d!.inputSchema ?? {}).sort()).toEqual(['pinned', 'projectPath']);
            // Local display state, trivially reversible.
            expect(d!.confirm).toBeUndefined();
        });

        // `select_project` is the ADOBE Console project selector (adobeTools.ts).
        // Naming this one the same would throw at registration ("Tool ... is
        // already registered") and, before that, would have read as the same
        // capability to an agent choosing between them.
        it('does not collide with the Adobe Console select_project', () => {
            expect(ACTION_DESCRIPTORS.map((d) => d.tool)).not.toContain('select_project');
        });
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

        it('rename_integration REQUIRES a name — an omitted one opens an input box', () => {
            const d = row('rename_integration');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('renameAppBuilderComponent');
            expect(Object.keys(d!.inputSchema ?? {}).sort()).toEqual(['id', 'name']);
            // THE headless-safety guard, not a convenience. `resolveRenameName`
            // falls through to `vscode.window.showInputBox` when the payload
            // carries no name — a tool that allowed the omission would hang an
            // agent's call on a dialog nobody is looking at.
            expect(d!.inputSchema!.name.isOptional()).toBe(false);
            expect(d!.inputSchema!.id.isOptional()).toBe(false);
            // A rename is a local display-name write, undone by renaming back.
            expect(d!.confirm).toBeUndefined();
        });

        it('set_console_apis is confirm-gated — a short list UNSUBSCRIBES', () => {
            const d = row('set_console_apis');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('setConsoleApis');
            expect(Object.keys(d!.inputSchema ?? {})).toContain('apis');
            // Per-integration edits need the owner, or the write lands on the union.
            expect(Object.keys(d!.inputSchema ?? {})).toContain('componentId');
            // `add_console_apis` is add-only and ungated. This one sets the list to
            // EXACTLY what it is given, so anything dropped is unsubscribed from a
            // live workspace credential — that is the delete the gate is for.
            expect(d!.confirm).toBe(true);
        });

        it('set_project_destination takes an Adobe project AND workspace, no confirm', () => {
            const d = row('set_project_destination');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('setProjectDestination');
            expect(Object.keys(d!.inputSchema ?? {}).sort()).toEqual(['project', 'workspace']);
            // Both required: the handler refuses a half-specified destination, and
            // the schema should say so rather than let the call round-trip to find out.
            expect(d!.inputSchema!.project.isOptional()).toBe(false);
            expect(d!.inputSchema!.workspace.isOptional()).toBe(false);
            // Ungated deliberately. The move only ever DEPLOYS — nothing is
            // undeployed from the old destination — and it is undone by setting the
            // destination back. The UI's confirmation modal was removed for the same
            // reason (user decision 2026-08-07); a gate here would reinstate it for
            // agents only.
            expect(d!.confirm).toBeUndefined();
        });

        it('add_integration dispatches to addAppBuilderComponent, catalog id OR custom source', () => {
            const d = row('add_integration');
            expect(d).toBeDefined();
            expect(d!.map).toBe(dashboardHandlers);
            expect(d!.type).toBe('addAppBuilderComponent');
            const keys = Object.keys(d!.inputSchema ?? {});
            expect(keys).toEqual(
                expect.arrayContaining(['id', 'source', 'name', 'instanceId', 'apis'])
            );
            // Additive and re-runnable (a failed add keeps its folder for retry) —
            // NOT confirm-gated, same as deploy_integration.
            expect(d!.confirm).toBeUndefined();
        });
    });

    /**
     * The preflight against the REAL catalog.
     *
     * Its handoff content is asserted in addIntegrationPreflight.test.ts, which
     * mocks the loader — because MEASURED 2026-08-17, no entry in the shipped
     * catalog declares a user-supplied env var: 5 ids across all 4 stacks
     * (`headless-commerce-mesh`, `eds-commerce-mesh`, `eds-accs-mesh`,
     * `app-builder-shell`) plus a custom GitHub source, all with empty
     * `userText`/`userSecret`. So the bucket-3 branch cannot fire today.
     *
     * That is exactly why this test is here rather than being folded into the
     * mocked one: it pins the CURRENT state, so the day someone authors a
     * pre-built integration with an `ERP_API_KEY`-style var, it fails and points
     * at the tool that now has a handoff to return.
     */
    describe('add_integration preflight — against the shipped catalog', () => {
        const preflight = (args: Record<string, unknown>) =>
            row('add_integration')!.preflight!(args);

        it('dispatches every real catalog id — none needs user inputs today', () => {
            const ids = getAvailableAppBuilderComponents('', '').map((e) => e.id);
            // Control: an empty list would make the loop below vacuously true.
            expect(ids.length).toBeGreaterThan(0);
            for (const id of ids) {
                expect(preflight({ id })).toBeUndefined();
            }
        });

        it('dispatches an unknown id so the HANDLER reports it, not the preflight', () => {
            // A preflight that swallowed unknown ids would answer "enter values"
            // for a component that does not exist.
            expect(preflight({ id: 'no-such-component' })).toBeUndefined();
        });

        it('resolves a custom GitHub source the same way an add payload does', () => {
            // A custom source has no envSchema, so it dispatches — but it must
            // RESOLVE without throwing, which is the half a catalog-only
            // preflight would get wrong.
            expect(preflight({ source: { owner: 'acme', repo: 'widget' } })).toBeUndefined();
        });

        it('dispatches an empty payload rather than throwing', () => {
            expect(preflight({})).toBeUndefined();
        });
    });
});
