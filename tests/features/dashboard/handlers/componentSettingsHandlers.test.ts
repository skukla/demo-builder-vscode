/**
 * saveIntegrationSettings — an integration's Settings, saved from its tile (AB-21).
 *
 * The settings model and the secret store are the real ones over the shared
 * SecretStorage fake; the catalog and the redeploy are mocked, and the redeploy
 * is asserted by the ids it receives, in order.
 */

import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { HandlerContext } from '@/types/handlers';

const SYSTEM: AppBuilderComponentCatalogEntry = {
    id: 'demo-erp',
    name: 'ERP',
    description: 'the ERP',
    kind: 'system',
    boundTo: 'erp-integration',
    envSchema: [{ name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' }],
    source: { owner: 'skukla', repo: 'demo-erp', branch: 'main' },
};
const INTEGRATION: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP integration',
    description: 'the integration',
    kind: 'integration',
    envSchema: [
        { name: 'ERP_DISPLAY_NAME', type: 'text', label: 'ERP name', default: 'Acme ERP' },
        { name: 'ERP_REGION', type: 'text', label: 'Region', default: 'eu' },
        { name: 'ERP_API_KEY', type: 'secret', label: 'API key' },
    ],
    source: { owner: 'skukla', repo: 'commerce-erp-integration', branch: 'main' },
};

// The real loader, so an import is recognised by its source the way redeploy does;
// only the stack-filtered catalog is fixed.
jest.mock('@/features/components/services/appBuilderComponentCatalogLoader', () => ({
    ...jest.requireActual('@/features/components/services/appBuilderComponentCatalogLoader'),
    getAvailableAppBuilderComponents: jest.fn(() => [SYSTEM, INTEGRATION]),
}));

const mockRedeploy = jest.fn();
jest.mock('@/features/dashboard/handlers/appBuilderComponentHandlers', () => ({
    ...jest.requireActual('@/features/dashboard/handlers/appBuilderComponentHandlers'),
    handleRedeployAppBuilderComponent: (...a: unknown[]) => mockRedeploy(...a),
}));

import { secretKey } from '@/features/app-builder/services/secretKey';
import {
    handleGetIntegrationSettings,
    saveIntegrationSettings,
} from '@/features/dashboard/handlers/componentSettingsHandlers';
import { ErrorCode } from '@/types/errorCodes';
import { createMockHandlerContext } from '../../../helpers/handlerContextTestHelpers';
import { createMockProject } from '../../../helpers/projectFake';
import { createMockSecretStorage } from '../../../helpers/secretStorageFake';
import { makeStateManager } from '../../../helpers/stateManagerFake';

const SECRET = 'fake-test-pw-not-a-secret';

function setup() {
    const project = createMockProject({
        path: '/projects/p',
        appBuilderComponents: {
            'demo-erp': { kind: 'system', status: 'deployed', source: { owner: 'skukla', repo: 'demo-erp' } },
            'erp-integration': { kind: 'integration', status: 'deployed', source: { owner: 'skukla', repo: 'x' } },
        },
    });
    const { secrets, store } = createMockSecretStorage();
    const stateManager = makeStateManager(project);
    const context = createMockHandlerContext({ stateManager });
    (context.context as unknown as { secrets: unknown }).secrets = secrets;
    return { project, context: context as HandlerContext, stateManager, store };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockRedeploy.mockResolvedValue({ success: true });
});

describe('saveIntegrationSettings', () => {
    it('stores a text setting, redeploys the ERP then the integration, and answers the new settings', async () => {
        const { project, context, stateManager } = setup();

        const result = await saveIntegrationSettings(context, {
            id: 'erp-integration',
            values: { ERP_DISPLAY_NAME: 'Nordwind' },
        });

        expect(project.componentConfigs?.['erp-integration']).toEqual({ ERP_DISPLAY_NAME: 'Nordwind' });
        expect(stateManager.saveProject).toHaveBeenCalledWith(project);
        expect(mockRedeploy.mock.calls.map(([, payload]) => payload)).toEqual([
            { id: 'demo-erp' },
            { id: 'erp-integration' },
        ]);
        expect(result).toMatchObject({ success: true, saved: true });
        expect(result.settings?.fields[0]).toEqual(
            { name: 'ERP_DISPLAY_NAME', label: 'ERP name', type: 'text', required: false, value: 'Nordwind' },
        );
    });

    it("a setting only the integration uses redeploys the integration alone", async () => {
        const { context } = setup();

        await saveIntegrationSettings(context, { id: 'erp-integration', values: { ERP_REGION: 'us' } });

        expect(mockRedeploy.mock.calls.map(([, payload]) => payload)).toEqual([{ id: 'erp-integration' }]);
    });

    it('stores a secret in SecretStorage only, and answers only that it is set', async () => {
        const { project, context, stateManager, store } = setup();

        const result = await saveIntegrationSettings(context, {
            id: 'erp-integration',
            secrets: { ERP_API_KEY: SECRET },
        });

        expect(store.get(secretKey('/projects/p', 'erp-integration', 'ERP_API_KEY'))).toBe(SECRET);
        expect(project.componentConfigs?.['erp-integration']).toBeUndefined();
        expect(stateManager.saveProject).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain(SECRET);
        expect(result.settings?.fields.find((f) => f.name === 'ERP_API_KEY')?.isSet).toBe(true);
    });

    it('refuses a change the entry does not allow, and stores and redeploys nothing', async () => {
        const { project, context, store } = setup();

        const result = await saveIntegrationSettings(context, {
            id: 'erp-integration',
            values: { ERP_API_KEY: SECRET },
        });

        expect(result).toEqual({
            success: false,
            error: '"ERP_API_KEY" is not a text setting of this integration.',
            code: ErrorCode.CONFIG_INVALID,
        });
        expect(project.componentConfigs?.['erp-integration']).toBeUndefined();
        expect(store.size).toBe(0);
        expect(mockRedeploy).not.toHaveBeenCalled();
    });

    it("refuses the ERP's name on the ERP's own tile: it is set on the integration", async () => {
        const { context } = setup();

        const result = await saveIntegrationSettings(context, {
            id: 'demo-erp',
            values: { ERP_DISPLAY_NAME: 'Nordwind' },
        });

        expect(result.success).toBe(false);
        expect(mockRedeploy).not.toHaveBeenCalled();
    });

    it('refuses a component the project does not have', async () => {
        const { context } = setup();
        const { project } = setup();
        delete project.appBuilderComponents?.['erp-integration'];
        (context.stateManager.getCurrentProject as jest.Mock).mockResolvedValue(project);

        const result = await saveIntegrationSettings(context, { id: 'erp-integration', values: {} });

        expect(result).toMatchObject({ success: false, code: ErrorCode.INVALID_OPERATION });
    });

    it('a failed redeploy keeps the saved value, stops there, and says which app failed', async () => {
        const { project, context } = setup();
        mockRedeploy.mockResolvedValueOnce({ success: false, error: 'aio said no' });

        const result = await saveIntegrationSettings(context, {
            id: 'erp-integration',
            values: { ERP_DISPLAY_NAME: 'Nordwind' },
        });

        expect(project.componentConfigs?.['erp-integration']?.ERP_DISPLAY_NAME).toBe('Nordwind');
        expect(mockRedeploy).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            success: false,
            saved: true,
            error: 'Settings saved, but redeploying demo-erp failed: aio said no',
        });
    });

    it('asks for an id', async () => {
        const { context } = setup();

        const result = await saveIntegrationSettings(context, { values: { ERP_REGION: 'us' } });

        expect(result).toMatchObject({ success: false, code: ErrorCode.CONFIG_INVALID });
    });
});

describe('getIntegrationSettings', () => {
    it("answers an integration's settings, a secret only as set or not", async () => {
        const { context } = setup();

        const result = await handleGetIntegrationSettings(context, { id: 'erp-integration' });

        expect(result).toMatchObject({ success: true, data: { id: 'erp-integration' } });
        const settings = (result.data as { settings: { fields: Array<{ name: string; isSet?: boolean }> } }).settings;
        expect(settings.fields.map((f) => f.name)).toEqual(['ERP_DISPLAY_NAME', 'ERP_REGION', 'ERP_API_KEY']);
        expect(settings.fields[2].isSet).toBe(false);
    });

    it("finds an imported integration's settings through its source, as redeploy does", async () => {
        // A colleague's copy of the ERP integration under its own id: no catalog row,
        // but its source is the catalog entry's repo, so it carries that entry's settings.
        const { project, context } = setup();
        project.appBuilderComponents = {
            'my-erp-sync': {
                kind: 'integration',
                status: 'deployed',
                source: { owner: 'skukla', repo: 'commerce-erp-integration' },
            },
        };

        const result = await handleGetIntegrationSettings(context, { id: 'my-erp-sync' });

        const settings = (result.data as { settings: { fields: Array<{ name: string }> } }).settings;
        expect(settings.fields.map((f) => f.name)).toContain('ERP_DISPLAY_NAME');
    });

    it('answers empty lists for an integration with nothing to set', async () => {
        const { project, context } = setup();
        project.appBuilderComponents = {
            shell: { kind: 'integration', status: 'deployed', source: { owner: 'acme', repo: 'blank' } },
        };

        const result = await handleGetIntegrationSettings(context, { id: 'shell' });

        expect(result).toEqual({ success: true, data: { id: 'shell', settings: { fields: [], connected: [] } } });
    });
});
