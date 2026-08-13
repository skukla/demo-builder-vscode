/**
 * Commerce credential resolution — backend-conditional, and asymmetric on purpose.
 *
 * PaaS has no gap: the admin username and password are already in
 * `componentConfigs`, put there when the project was built. ACCS has nothing —
 * its REST API accepts only IMS OAuth2, and the client_id/client_secret pair
 * comes from a Developer Console credential the user creates by hand. It cannot
 * be auto-provisioned: the service is product-profile gated on *Commerce Cloud
 * Manager*, which is the step that silently hides it.
 *
 * **The ACCS pair goes to SecretStorage and nowhere else.** A value in
 * `componentConfigs` is exported with the project unless its key is listed in
 * `SECRET_ENV_KEYS`, so putting it there would mean a secret leaves the machine
 * the moment someone exports. SecretStorage sidesteps that question entirely.
 *
 * What this module does NOT do: decide whether a credential is correct. For PaaS
 * `getAdminToken` is the real check, and for ACCS nothing local can validate the
 * pair — which is why the write client's `operation_mode: 'validate'` exists.
 * Resolution answers "do we have something to try?", never "will it work?".
 *
 * Strict TDD: written BEFORE the module exists.
 */

import {
    resolveCommerceCredentials,
    storeAccsCredentials,
    clearAccsCredentials,
} from '@/features/data-installer/services/commerceCredentials';

/** An in-memory stand-in for `vscode.SecretStorage`. */
function makeSecrets(seed: Record<string, string> = {}) {
    const store = new Map(Object.entries(seed));
    return {
        store: jest.fn(async (k: string, v: string) => void store.set(k, v)),
        get: jest.fn(async (k: string) => store.get(k)),
        delete: jest.fn(async (k: string) => void store.delete(k)),
        peek: (k: string) => store.get(k),
        size: () => store.size,
    };
}

const PAAS_PROJECT = {
    stackBackend: 'adobe-commerce-paas',
    componentConfigs: {
        'adobe-commerce-paas': {
            ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
        },
    },
};

const ACCS_PROJECT = {
    stackBackend: 'adobe-commerce-accs',
    componentConfigs: { 'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql' } },
};

describe('resolveCommerceCredentials', () => {
    describe('PaaS', () => {
        it('reads the admin pair already in componentConfigs', async () => {
            const result = await resolveCommerceCredentials({
                project: PAAS_PROJECT,
                secrets: makeSecrets(),
            });

            expect(result).toEqual({
                ok: true,
                credentials: { kind: 'paas', username: 'admin', password: 'fake-test-pw-not-a-secret' },
            });
        });

        it('finds the pair in ANY component, not just the backend one', async () => {
            const result = await resolveCommerceCredentials({
                project: {
                    stackBackend: 'adobe-commerce-paas',
                    componentConfigs: {
                        somewhere_else: {
                            ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                            ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                        },
                    },
                },
                secrets: makeSecrets(),
            });

            expect(result.ok).toBe(true);
        });

        it('reports what is missing rather than half a credential', async () => {
            const result = await resolveCommerceCredentials({
                project: {
                    stackBackend: 'adobe-commerce-paas',
                    componentConfigs: { x: { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' } },
                },
                secrets: makeSecrets(),
            });

            expect(result.ok).toBe(false);
            expect(result.ok === false && result.reason).toBe('missing-paas-admin');
        });

        // SecretStorage is the ACCS mechanism. A PaaS project must not silently
        // pick up a stale pair someone stored for a different project.
        it('never consults SecretStorage', async () => {
            const secrets = makeSecrets({ 'demoBuilder.dataInstaller.accs': '{"clientId":"x","clientSecret":"y"}' });

            const result = await resolveCommerceCredentials({ project: PAAS_PROJECT, secrets });

            expect(result.ok).toBe(true);
            expect(secrets.get).not.toHaveBeenCalled();
        });
    });

    describe('ACCS', () => {
        it('reads the OAuth pair from SecretStorage', async () => {
            const secrets = makeSecrets();
            await storeAccsCredentials({
                secrets,
                projectName: 'demo-a',
                clientId: 'cid',
                clientSecret: 'fake-test-pw-not-a-secret',
            });

            const result = await resolveCommerceCredentials({ project: ACCS_PROJECT, secrets, projectName: 'demo-a' });

            expect(result).toEqual({
                ok: true,
                credentials: { kind: 'accs', clientId: 'cid', clientSecret: 'fake-test-pw-not-a-secret' },
            });
        });

        it('keys the secret PER PROJECT — one project cannot read another pair', async () => {
            const secrets = makeSecrets();
            await storeAccsCredentials({
                secrets,
                projectName: 'demo-a',
                clientId: 'cid',
                clientSecret: 'fake-test-pw-not-a-secret',
            });

            const result = await resolveCommerceCredentials({ project: ACCS_PROJECT, secrets, projectName: 'demo-b' });

            expect(result.ok).toBe(false);
        });

        it('asks for credentials when none are stored', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT,
                secrets: makeSecrets(),
                projectName: 'demo-a',
            });

            expect(result.ok).toBe(false);
            expect(result.ok === false && result.reason).toBe('needs-accs-credentials');
        });

        it('treats a corrupted secret as missing rather than throwing', async () => {
            const secrets = makeSecrets({ 'demoBuilder.dataInstaller.accs.demo-a': 'not json' });

            const result = await resolveCommerceCredentials({ project: ACCS_PROJECT, secrets, projectName: 'demo-a' });

            expect(result.ok).toBe(false);
            expect(result.ok === false && result.reason).toBe('needs-accs-credentials');
        });

        // The whole reason SecretStorage was chosen: componentConfigs is exported
        // with the project unless the key is in SECRET_ENV_KEYS.
        it('never writes the pair into componentConfigs', async () => {
            const secrets = makeSecrets();
            const project = { ...ACCS_PROJECT, componentConfigs: { ...ACCS_PROJECT.componentConfigs } };

            await storeAccsCredentials({
                secrets,
                projectName: 'demo-a',
                clientId: 'cid',
                clientSecret: 'fake-test-pw-not-a-secret',
            });

            expect(JSON.stringify(project.componentConfigs)).not.toMatch(/cid|fake-test-pw/);
            expect(secrets.store).toHaveBeenCalledTimes(1);
        });
    });

    describe('unknown backend', () => {
        it('refuses rather than guessing a credential shape', async () => {
            const result = await resolveCommerceCredentials({
                project: { stackBackend: 'something-else', componentConfigs: {} },
                secrets: makeSecrets(),
            });

            expect(result.ok).toBe(false);
            expect(result.ok === false && result.reason).toBe('unsupported-backend');
        });
    });
});

describe('clearAccsCredentials', () => {
    it('removes the stored pair for one project only', async () => {
        const secrets = makeSecrets();
        await storeAccsCredentials({ secrets, projectName: 'a', clientId: 'i', clientSecret: 's' });
        await storeAccsCredentials({ secrets, projectName: 'b', clientId: 'i', clientSecret: 's' });

        await clearAccsCredentials({ secrets, projectName: 'a' });

        expect(secrets.size()).toBe(1);
    });
});
