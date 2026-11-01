/**
 * Configure's list of catalog views. It has to answer BEFORE a view is set: choosing the first one is
 * what the list is for. It once needed a complete set of settings, so it offered nothing until the SC
 * had already typed an id (found 2026-11-01 setting up a real project).
 */

import { handleListAcoCatalogViews } from '@/features/dashboard/handlers/configureHandlers';
import { acoCredentialKey } from '@/features/components/services/acoCredentialStore';
import type { HandlerContext } from '@/types/handlers';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockStateManager } from '../../../helpers/stateManagerFake';

const PROJECT_PATH = '/projects/demo';

function contextWith(config: Record<string, string>, credential = true) {
    const project = createMockProject({
        name: 'demo',
        path: PROJECT_PATH,
        selectedAddons: ['adobe-commerce-aco'],
        componentConfigs: { 'adobe-commerce-aco': config },
    });
    const get = jest.fn(async (key: string) =>
        credential && key === acoCredentialKey(PROJECT_PATH) ? JSON.stringify({ clientId: 'client-1', clientSecret: 'fake-test-pw-not-a-secret' }) : undefined,
    );
    const context = createMockHandlerContext({
        stateManager: createMockStateManager({ getCurrentProject: jest.fn(async () => project) }),
    }) as HandlerContext;
    (context as unknown as { context: unknown }).context = { secrets: { get } };
    return context;
}

describe('handleListAcoCatalogViews', () => {
    const originalFetch = global.fetch;
    let sent: string[];

    beforeEach(() => {
        sent = [];
        global.fetch = (async (url: string) => {
            sent.push(url);
            if (url.includes('ims/token')) return new Response(JSON.stringify({ access_token: 'h.e30.s', expires_in: 86400 }));
            return new Response(JSON.stringify({ data: { catalogViews: [{ viewId: 'v1', name: 'Main', sources: [{ locale: 'en-US' }] }] } }));
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('lists the views for a project that has an instance and has not chosen a view', async () => {
        const answer = await handleListAcoCatalogViews(contextWith({ ACO_TENANT_ID: 'TenantAbc123' }));

        expect(answer.data).toMatchObject({ views: [{ id: 'v1', name: 'Main', locale: 'en-US' }] });
        expect(sent.at(-1)).toBe('https://na1-sandbox.api.commerce.adobe.com/TenantAbc123/admin/graphql');
    });

    it('offers none and calls nothing with no instance', async () => {
        expect((await handleListAcoCatalogViews(contextWith({}))).data).toEqual({ views: [] });
        expect(sent).toHaveLength(0);
    });

    it('offers none and calls nothing with no credential', async () => {
        expect((await handleListAcoCatalogViews(contextWith({ ACO_TENANT_ID: 'TenantAbc123' }, false))).data).toEqual({ views: [] });
        expect(sent).toHaveLength(0);
    });
});
