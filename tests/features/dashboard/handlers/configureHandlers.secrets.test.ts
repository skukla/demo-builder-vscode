/**
 * AppBuilderComponent Secret Routing Tests (D2 Track B — Step 04)
 *
 * SECRET SAFETY (repo is PUBLIC): a `type:'secret'` value MUST be routed to VS
 * Code SecretStorage and MUST NEVER reach `componentConfigs`, the `.env` file,
 * any persisted manifest, or the logs. These tests are the gate for that.
 *
 * Uses the safe GitGuardian fixture convention (`fake-test-pw-not-a-secret`)
 * for the test secret value. SecretStorage is mocked.
 */

import {
    splitAppBuilderComponentSecrets,
    persistAppBuilderComponentSecrets,
    loadAppBuilderComponentSecretFlags,
} from '@/features/dashboard/handlers/appBuilderComponentSecrets';
import { secretKey } from '@/features/app-builder/services/secretKey';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { ComponentConfigs } from '@/types/webview';

const FAKE_SECRET = 'fake-test-pw-not-a-secret';

/** A catalog entry with one secret var and one text var. */
const erpEntry: AppBuilderComponentCatalogEntry = {
    id: 'erp-integration',
    name: 'ERP Integration',
    description: 'Test integration',
    kind: 'integration',
    source: { owner: 'acme', repo: 'erp', branch: 'main' },
    envSchema: [
        { name: 'ERP_HOST', type: 'text', label: 'ERP Host' },
        { name: 'ERP_API_KEY', type: 'secret', label: 'ERP API Key' },
    ],
};

/** A seed mesh: only a derived (bucket 1) var — no secrets. */
const meshEntry: AppBuilderComponentCatalogEntry = {
    id: 'commerce-paas-mesh',
    name: 'Commerce PaaS API Mesh',
    description: 'Mesh',
    kind: 'mesh',
    source: { owner: 'skukla', repo: 'commerce-paas-mesh', branch: 'main' },
    envSchema: [
        { name: 'COMMERCE_ENDPOINT', type: 'text', label: 'Commerce endpoint', derivedFrom: 'connect-commerce' },
    ],
};

function makeSecretStorage() {
    const store = new Map<string, string>();
    return {
        store,
        api: {
            store: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
            get: jest.fn(async (key: string) => store.get(key)),
            delete: jest.fn(async (key: string) => { store.delete(key); }),
        },
    };
}

describe('splitAppBuilderComponentSecrets', () => {
    it('extracts secret-typed values out of componentConfigs', () => {
        const configs: ComponentConfigs = {
            'erp-integration': { ERP_HOST: 'erp.example.com', ERP_API_KEY: FAKE_SECRET },
        };

        const { sanitizedConfigs, secrets } = splitAppBuilderComponentSecrets(configs, [erpEntry]);

        // The secret is captured for SecretStorage routing...
        expect(secrets).toEqual([
            { appBuilderComponentId: 'erp-integration', varName: 'ERP_API_KEY', value: FAKE_SECRET },
        ]);
        // ...and is ABSENT from the sanitized configs (never .env / never manifest).
        expect(sanitizedConfigs['erp-integration']).not.toHaveProperty('ERP_API_KEY');
    });

    it('leaves non-secret (text) values in componentConfigs unchanged', () => {
        const configs: ComponentConfigs = {
            'erp-integration': { ERP_HOST: 'erp.example.com', ERP_API_KEY: FAKE_SECRET },
        };

        const { sanitizedConfigs } = splitAppBuilderComponentSecrets(configs, [erpEntry]);

        expect(sanitizedConfigs['erp-integration'].ERP_HOST).toBe('erp.example.com');
    });

    it('never serializes a secret value into the sanitized manifest JSON', () => {
        const configs: ComponentConfigs = {
            'erp-integration': { ERP_HOST: 'erp.example.com', ERP_API_KEY: FAKE_SECRET },
        };

        const { sanitizedConfigs } = splitAppBuilderComponentSecrets(configs, [erpEntry]);

        expect(JSON.stringify(sanitizedConfigs)).not.toContain(FAKE_SECRET);
    });

    it('returns zero secrets for a seed mesh (no secret-typed vars)', () => {
        const configs: ComponentConfigs = {
            'commerce-paas-mesh': { COMMERCE_ENDPOINT: 'https://commerce.example.com' },
        };

        const { secrets } = splitAppBuilderComponentSecrets(configs, [meshEntry]);

        expect(secrets).toEqual([]);
    });
});

describe('persistAppBuilderComponentSecrets', () => {
    it('routes each secret to SecretStorage under the deterministic key', async () => {
        const { api } = makeSecretStorage();

        await persistAppBuilderComponentSecrets(
            [{ appBuilderComponentId: 'erp-integration', varName: 'ERP_API_KEY', value: FAKE_SECRET }],
            'proj-1',
            api as never,
        );

        const expectedKey = secretKey('proj-1', 'erp-integration', 'ERP_API_KEY');
        expect(api.store).toHaveBeenCalledWith(expectedKey, FAKE_SECRET);
    });

    it('never logs the secret value', async () => {
        const { api } = makeSecretStorage();
        const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };

        await persistAppBuilderComponentSecrets(
            [{ appBuilderComponentId: 'erp-integration', varName: 'ERP_API_KEY', value: FAKE_SECRET }],
            'proj-1',
            api as never,
            logger as never,
        );

        const allLogArgs = JSON.stringify([
            ...logger.info.mock.calls,
            ...logger.debug.mock.calls,
            ...logger.warn.mock.calls,
            ...logger.error.mock.calls,
        ]);
        expect(allLogArgs).not.toContain(FAKE_SECRET);
    });

    it('does nothing (no store calls) for an empty secret list', async () => {
        const { api } = makeSecretStorage();
        await persistAppBuilderComponentSecrets([], 'proj-1', api as never);
        expect(api.store).not.toHaveBeenCalled();
    });
});

describe('loadAppBuilderComponentSecretFlags', () => {
    it('reports a secret as set without revealing its value', async () => {
        const { api } = makeSecretStorage();
        await api.store(secretKey('proj-1', 'erp-integration', 'ERP_API_KEY'), FAKE_SECRET);

        const flags = await loadAppBuilderComponentSecretFlags([erpEntry], 'proj-1', api as never);

        expect(flags['erp-integration'].ERP_API_KEY).toBe(true);
        // The flags map carries only booleans — never the secret value.
        expect(JSON.stringify(flags)).not.toContain(FAKE_SECRET);
    });

    it('reports an unset secret as false', async () => {
        const { api } = makeSecretStorage();

        const flags = await loadAppBuilderComponentSecretFlags([erpEntry], 'proj-1', api as never);

        expect(flags['erp-integration'].ERP_API_KEY).toBe(false);
    });

    it('produces no entries for a seed mesh (no secret vars)', async () => {
        const { api } = makeSecretStorage();

        const flags = await loadAppBuilderComponentSecretFlags([meshEntry], 'proj-1', api as never);

        expect(flags['commerce-paas-mesh']).toBeUndefined();
    });
});
