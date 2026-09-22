/**
 * handleAddConsoleApis with a componentId — the agent adding an API to ONE
 * integration (AB-23 slice 6).
 *
 * `add_console_apis` took no componentId, so an agent asked to give the ERP
 * integration an API subscribed it on the project's workspace — Production —
 * while the integration runs in a workspace of its own and never saw it. The
 * Manage APIs dialog already edits a component's own workspace through
 * `setConsoleApis`; this gives the additive door the same reach.
 */

import {
    createApiSubscriberClient,
    handleAddConsoleApis,
    handleListConsoleApis,
    handleSetConsoleApis,
    consoleApiContext,
    consoleApiProject,
    subscribeRequiredApis,
} from './consoleApiHandlers.testUtils';

function bodea() {
    return consoleApiProject({
        appBuilderComponents: {
            'erp-integration': {
                kind: 'integration',
                status: 'deployed',
                name: 'ERP Integration',
                source: { owner: 'o', repo: 'r' },
                workspace: { id: 'ws-erp-own', name: 'Northwind-ERP' },
            },
            'firefly-app': {
                kind: 'integration',
                status: 'deployed',
                name: 'Firefly App',
                source: { owner: 'o', repo: 'r' },
            },
        },
        componentApiPicks: {
            'erp-integration': ['commerceeventing'],
            'firefly-app': ['GraphQLServiceSDK'],
        },
    });
}

beforeEach(() => jest.clearAllMocks());

describe('add_console_apis for one integration', () => {
    it("adds to that integration's own workspace, keeping what it already had", async () => {
        const context = consoleApiContext(bodea());

        const result = await handleAddConsoleApis(context, {
            apis: ['FireflyAPISDK'],
            componentId: 'erp-integration',
        });

        expect(result.success).toBe(true);
        const call = (subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect(call[1]).toEqual(expect.objectContaining({ workspaceId: 'ws-erp-own' }));
        // Its own picks plus the new one — never another integration's.
        expect(call[4]).toEqual(['commerceeventing', 'FireflyAPISDK']);
    });

    it("records the new API as that integration's pick", async () => {
        const project = bodea();
        const context = consoleApiContext(project);

        await handleAddConsoleApis(context, {
            apis: ['FireflyAPISDK'],
            componentId: 'erp-integration',
        });

        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0];
        expect(saved.componentApiPicks).toEqual({
            'erp-integration': ['commerceeventing', 'FireflyAPISDK'],
            'firefly-app': ['GraphQLServiceSDK'],
        });
    });

    it('refuses an id the project does not have, and touches nothing', async () => {
        const context = consoleApiContext(bodea());

        const result = await handleAddConsoleApis(context, {
            apis: ['FireflyAPISDK'],
            componentId: 'nope',
        });

        expect(result).toMatchObject({ success: false });
        expect(result.error).toContain('"nope"');
        expect(subscribeRequiredApis).not.toHaveBeenCalled();
    });

    it("CONTROL: without a componentId it still adds on the project's workspace", async () => {
        const context = consoleApiContext(bodea());

        await handleAddConsoleApis(context, { apis: ['FireflyAPISDK'] });

        const call = (subscribeRequiredApis as jest.Mock).mock.calls[0];
        expect(call[1]).toEqual(expect.objectContaining({ workspaceId: 'w-1' }));
    });
});

// Found writing the test above: a component in a workspace of its own had its save
// judged by what THAT workspace took, so every other integration's picks were
// erased. The Manage APIs dialog's `setConsoleApis` went through the same line.
describe("an edit in one integration's own workspace", () => {
    it("leaves other integrations' picks alone (the Manage APIs path)", async () => {
        const project = bodea();
        const context = consoleApiContext(project);

        await handleSetConsoleApis(context, { apis: ['FireflyAPISDK'], componentId: 'erp-integration' });

        const saved = (context.stateManager.saveProject as jest.Mock).mock.calls.at(-1)?.[0];
        expect(saved.componentApiPicks).toEqual({
            'erp-integration': ['FireflyAPISDK'],
            'firefly-app': ['GraphQLServiceSDK'],
        });
    });
});

// The project's union leaves out an integration with a workspace of its own
// (componentApiPicks), so its list must keep its own picks' rows by name. The list
// drops a service Adobe marks disabled unless it is kept — which is the case here.
describe("the API list for one integration in its own workspace", () => {
    it('still shows an API that integration picked, even one Adobe marks disabled', async () => {
        (createApiSubscriberClient as jest.Mock).mockReturnValueOnce({
            getServicesForOrg: jest.fn().mockResolvedValue([
                { code: 'AdobeIOManagementAPISDK', name: 'I/O Management API' },
                { code: 'LegacyEventsSDK', name: 'Legacy Events', enabled: false },
            ]),
        });
        const project = bodea();
        project.componentApiPicks = { 'erp-integration': ['LegacyEventsSDK'] };

        const result = await handleListConsoleApis(consoleApiContext(project), {
            componentId: 'erp-integration',
        });

        const data = result.data as { apis: Array<{ code: string }>; added: string[] };
        expect(data.added).toEqual(['LegacyEventsSDK']);
        expect(data.apis.map((api) => api.code)).toContain('LegacyEventsSDK');
    });
});
