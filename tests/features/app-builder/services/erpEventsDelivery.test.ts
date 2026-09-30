/**
 * erpEventsDelivery — where an ADDED ERP sends its events, signed how (AB-16i).
 *
 * Measured on Bodea, 2026-09-28: Contoso ERP (`demo-erp-2`, its own workspace) raised
 * `contract.changed` and its outbox said `delivered: false`, because it posted to an
 * ingestion action in its OWN namespace where no integration listens. The integration's
 * ingestion action is `require-adobe-auth` in the integration's workspace, so the ERP must
 * also sign with a credential from THAT workspace. The integration's own ERP shares its
 * workspace and is left exactly as it was.
 */

import { getActiveOrgContext, type OrgContextTarget } from '@/core/shell/orgContextEnv';
import type { ErpCredentialRead } from '@/features/app-builder/services/erpCredential';
import { erpEventsEnvResolver, resolveErpEventsEnv } from '@/features/app-builder/services/erpEventsDelivery';
import { fetchWorkspaceS2SCredential } from '@/features/app-builder/services/runtimeCredentials';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { AppBuilderComponentState, Project } from '@/types/base';
import { createMockCommandExecutor } from '../../../helpers/commandExecutorFake';
import { createMockProject } from '../../../helpers/projectFake';

jest.mock('@/features/app-builder/services/runtimeCredentials', () => ({
    fetchWorkspaceS2SCredential: jest.fn(),
}));

const fetchMock = fetchWorkspaceS2SCredential as jest.MockedFunction<typeof fetchWorkspaceS2SCredential>;

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    listedAs: { envVar: 'ERP_ID', adapter: 'demo-erp' },
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};
const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'the integration',
    kind: 'integration',
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};
const CATALOG = [SYSTEM, INTEGRATION];
const CONTOSO: AppBuilderComponentCatalogEntry = { ...SYSTEM, id: 'demo-erp-2', catalogId: 'demo-erp' };

const INGESTION = 'https://ns-integration.adobeio-static.net/api/v1/web/ingestion/webhook';
const ERP_SOURCE = { owner: 'skukla', repo: 'demo-erp', branch: 'main' };
const CREDENTIAL = {
    clientId: 'fake-integration-client',
    clientSecret: 'fake-test-pw-not-a-secret',
    orgId: 'FAKE@AdobeOrg',
    scopes: ['AdobeID', 'openid'],
};

function integrationState(deployedUrls: Record<string, string>): AppBuilderComponentState {
    return {
        kind: 'integration',
        status: 'deployed',
        name: 'Northwind ERP Integration',
        deployedUrls,
        source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
    };
}

/** Bodea's shape: the integration and its own ERP in the project's workspace, Contoso in its own. */
function bodea(options: { linked?: boolean; deployedUrls?: Record<string, string> } = {}): Project {
    const deployedUrls = options.deployedUrls ?? {
        'erp/erps': 'https://ns-integration.adobeio-static.net/api/v1/web/erp/erps',
        'ingestion/webhook': INGESTION,
    };
    return createMockProject({
        adobe: { organization: 'org-1', projectId: 'proj-1', workspace: 'ws-project', workspaceName: 'Stage' },
        appBuilderComponents: {
            'erp-integration': integrationState(deployedUrls),
            'demo-erp': { kind: 'system', status: 'deployed', name: 'Northwind ERP', source: ERP_SOURCE },
            'demo-erp-2': {
                kind: 'system',
                catalogId: 'demo-erp',
                status: options.linked ? 'deployed' : 'deploying',
                name: 'Contoso ERP',
                workspace: { id: 'ws-contoso', name: 'ContosoERP' },
                source: ERP_SOURCE,
                ...(options.linked ? { usedBy: 'erp-integration' } : {}),
            },
        },
    });
}

function reader(): jest.MockedFunction<ErpCredentialRead> {
    return jest.fn<ReturnType<ErpCredentialRead>, Parameters<ErpCredentialRead>>(async () => CREDENTIAL);
}

describe('resolveErpEventsEnv', () => {
    it.each([
        ['on its first add, before it is linked', false],
        ['on a redeploy, once linked', true],
    ])('gives an added ERP the ingestion address and the INTEGRATION workspace credential %s', async (_when, linked) => {
        const read = reader();

        const result = await resolveErpEventsEnv(bodea({ linked }), CONTOSO, CATALOG, read);

        expect(read).toHaveBeenCalledWith({ id: 'ws-project', name: 'Stage' });
        expect(result).toStrictEqual({
            env: {
                EVENTS_WEBHOOK_URL: INGESTION,
                EVENTS_AUTH_CLIENT_ID: 'fake-integration-client',
                EVENTS_AUTH_CLIENT_SECRET: 'fake-test-pw-not-a-secret',
                EVENTS_AUTH_ORG_ID: 'FAKE@AdobeOrg',
                EVENTS_AUTH_SCOPES: '["AdobeID","openid"]',
            },
        });
    });

    it("reads the credential from the integration's own workspace when it has one", async () => {
        const project = bodea();
        project.appBuilderComponents!['erp-integration'].workspace = { id: 'ws-integration', name: 'ERPIntegration' };
        const read = reader();

        await resolveErpEventsEnv(project, CONTOSO, CATALOG, read);

        expect(read).toHaveBeenCalledWith({ id: 'ws-integration', name: 'ERPIntegration' });
    });

    it("leaves the integration's own ERP exactly as it was, and reads no credential", async () => {
        const read = reader();

        await expect(resolveErpEventsEnv(bodea(), SYSTEM, CATALOG, read)).resolves.toStrictEqual({ env: {} });
        expect(read).not.toHaveBeenCalled();
    });

    it('gives nothing to a component that is not a listed system', async () => {
        const read = reader();

        await expect(resolveErpEventsEnv(bodea(), INTEGRATION, CATALOG, read)).resolves.toStrictEqual({ env: {} });
        await expect(
            resolveErpEventsEnv(bodea(), { ...CONTOSO, listedAs: undefined }, CATALOG, read),
        ).resolves.toStrictEqual({ env: {} });
        expect(read).not.toHaveBeenCalled();
    });

    it('deploys an added ERP as before, and says so, while its integration has no ingestion address', async () => {
        const read = reader();

        const result = await resolveErpEventsEnv(bodea({ deployedUrls: {} }), CONTOSO, CATALOG, read);

        expect(result.env).toStrictEqual({});
        expect(result.note).toBe(
            "Contoso ERP's events will wait in its own outbox: Northwind ERP Integration has no event address yet. " +
                'Redeploy Contoso ERP once it is deployed.',
        );
        expect(read).not.toHaveBeenCalled();
    });

    it('deploys an added ERP as before, and says why, when the credential cannot be read', async () => {
        const read: ErpCredentialRead = async () => {
            throw new Error('the Stage workspace has no OAuth server-to-server credential');
        };

        const result = await resolveErpEventsEnv(bodea(), CONTOSO, CATALOG, read);

        expect(result.env).toStrictEqual({});
        expect(result.note).toContain('the Stage workspace has no OAuth server-to-server credential');
    });
});

describe('erpEventsEnvResolver (the production wiring)', () => {
    it("downloads the credential under the INTEGRATION's workspace, not the ERP's own", async () => {
        let ranUnder: OrgContextTarget | undefined;
        fetchMock.mockImplementation(async () => {
            ranUnder = getActiveOrgContext();
            return CREDENTIAL;
        });
        const commandManager = createMockCommandExecutor();
        const resolve = erpEventsEnvResolver({
            commandManager,
            catalog: CATALOG,
            getCachedOrganization: () => ({ id: 'org-1', code: 'FAKE@AdobeOrg', name: 'Fake Org' }),
        });

        const result = await resolve(bodea(), CONTOSO);

        expect(fetchMock).toHaveBeenCalledWith(commandManager, 'auto');
        expect(ranUnder).toMatchObject({ orgId: 'org-1', projectId: 'proj-1', workspaceId: 'ws-project' });
        expect(result.env.EVENTS_AUTH_CLIENT_ID).toBe('fake-integration-client');
    });
});
