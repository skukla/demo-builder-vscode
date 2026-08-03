/**
 * addIntegrationFlowHandlers — the Add Integration flow's host contract.
 *
 * The flow is rendered by two panels (the wizard owns it, the integrations surface
 * reuses it whole). Both used to keep their own hand-written copy of the messages
 * it sends, so the list drifted every time the flow grew — and an unregistered type
 * used to be silence, so the drift surfaced as "Adobe is slow" or "my org is
 * broken" rather than as our wiring. This suite pins the single list and that the
 * wizard registry really spreads it.
 *
 * The per-panel coverage check (`webviewHandlerCoverage`) is the other half: it
 * walks each panel's real import graph, so it catches a message this map forgot.
 */

import { addIntegrationFlowHandlers } from '@/features/project-creation/handlers/addIntegrationFlowHandlers';
import { projectCreationHandlers } from '@/features/project-creation/handlers/ProjectCreationHandlerRegistry';

describe('addIntegrationFlowHandlers', () => {
    it('maps every entry to a callable handler', () => {
        // A barrel-ordering mistake captures `undefined` here rather than failing
        // the import, so the message would register and then throw on first use.
        const notFunctions = Object.entries(addIntegrationFlowHandlers)
            .filter(([, handler]) => typeof handler !== 'function')
            .map(([type]) => type);

        expect(notFunctions).toEqual([]);
    });

    it('covers the destination stages the flow renders', () => {
        const types = Object.keys(addIntegrationFlowHandlers);

        expect(types).toEqual(
            expect.arrayContaining([
                'check-auth',
                'authenticate',
                'get-projects',
                'select-project',
                'create-adobe-project',
                'delete-adobe-project',
                'get-workspaces',
                'select-workspace',
                'list-org-console-apis',
                'ensure-mesh-api-subscribed',
                'switchOrg',
            ])
        );
    });

    // REGRESSION: the workspace field's "New" button sends this, and the
    // integrations panel never registered it — invisible to the coverage guard,
    // whose SEND pattern could not match the NESTED generic in
    // `request<HandlerResult<Workspace>>(...)`. Both holes closed 2026-08-03.
    it("includes create-adobe-workspace, which the workspace picker's New button sends", () => {
        expect(addIntegrationFlowHandlers).toHaveProperty('create-adobe-workspace');
    });

    // Org recovery belongs to authentication, not the dashboard: it is a forced
    // IMS sign-in. The dashboard registers its own status-verifying variant under
    // the same key on its own panels.
    it('answers switchOrg so the pickers\' "Switch IMS Org" works on every host', () => {
        expect(typeof addIntegrationFlowHandlers.switchOrg).toBe('function');
    });

    it('is spread whole into the wizard registry, so the wizard cannot drift from it', () => {
        const missing = Object.keys(addIntegrationFlowHandlers).filter(
            (type) => !(type in projectCreationHandlers)
        );

        expect(missing).toEqual([]);
    });

    // The hosts spread this map; they must not gain the wizard's own messages by
    // some later "just re-export the registry" shortcut.
    it('does NOT carry wizard-only messages', () => {
        const types = Object.keys(addIntegrationFlowHandlers);

        expect(types).not.toContain('create-project');
        expect(types).not.toContain('validate');
        expect(types).not.toContain('check-prerequisites');
    });
});
