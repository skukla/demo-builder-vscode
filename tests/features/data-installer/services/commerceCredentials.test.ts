/**
 * Commerce credential resolution — backend-conditional, and asymmetric on purpose.
 *
 * PaaS has no gap: the admin username and password are already in
 * `componentConfigs`, put there when the project was built. ACCS has nothing —
 * its REST API accepts only IMS OAuth2, and the client_id/client_secret pair
 * comes from a Developer Console OAuth S2S credential. Auto-provisioning the
 * pair IS possible — proven live 2026-08-13: create the credential, subscribe
 * `ACCS-REST-API` (grants commerce.accs + projectedProductContext), read the
 * pair back from the workspace download. An earlier claim here that it "cannot
 * be auto-provisioned (product-profile gated)" was wrong.
 *
 * **Both pairs are DECLARED config, read the same way.** ACCS declares its OAuth
 * pair on the `adobe-commerce-accs` component, exactly as PaaS declares its admin
 * pair — so the user supplies it on the surfaces that already exist (the wizard's
 * config step and Configure) rather than through anything this feature owns.
 *
 * The earlier design put the ACCS pair in SecretStorage instead. It had no writer:
 * `storeAccsCredentials` was called only from tests, so the modal told users to add
 * credentials there was nowhere to add. Declared config is what the repo actually
 * does for Commerce; the secret half is kept out of exports by `SECRET_ENV_KEYS`,
 * which a SOP test now enforces rather than trusting to a docstring.
 *
 * What this module does NOT do: decide whether a credential is correct. For PaaS
 * `getAdminToken` is the real check, and for ACCS nothing local can validate the
 * pair — which is why the write client's `operation_mode: 'validate'` exists.
 * Resolution answers "do we have something to try?", never "will it work?".
 *
 * Strict TDD: written BEFORE the module exists.
 */

import { resolveCommerceCredentials } from '@/features/data-installer/services/commerceCredentials';

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
    componentConfigs: {
        'adobe-commerce-accs': {
            ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql',
            ACCS_OAUTH_CLIENT_ID: 'client-id-value',
            ACCS_OAUTH_CLIENT_SECRET: 'fake-test-secret-not-a-secret',
        },
    },
};

/** The same project before anyone has supplied the OAuth pair. */
const ACCS_PROJECT_NO_CREDS = {
    stackBackend: 'adobe-commerce-accs',
    componentConfigs: {
        'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://x.api.commerce.adobe.com/t/graphql' },
    },
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
        it('reads the OAuth pair declared on the component', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT,
                secrets: makeSecrets(),
            });

            expect(result).toEqual({
                ok: true,
                credentials: {
                    kind: 'accs',
                    clientId: 'client-id-value',
                    clientSecret: 'fake-test-secret-not-a-secret',
                },
            });
        });

        it('asks for credentials when the pair has not been supplied', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT_NO_CREDS,
                secrets: makeSecrets(),
            });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });

        // Half a credential is a failure, not a partial success — the same rule
        // PaaS follows, so a half-filled form cannot start a doomed request.
        it('refuses half a pair', async () => {
            const half = {
                stackBackend: 'adobe-commerce-accs',
                componentConfigs: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_ID: 'only-the-id' } },
            };

            const result = await resolveCommerceCredentials({ project: half, secrets: makeSecrets() });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });

        // The OAuth pair is the ACCS best practice — the IMS model for SaaS. The
        // service also accepts an admin pair, which is the legacy path; accepting
        // it here would quietly make the worse credential the easy one.
        it('does not fall back to an admin pair', async () => {
            const withAdmin = {
                stackBackend: 'adobe-commerce-accs',
                componentConfigs: {
                    'adobe-commerce-accs': {
                        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
                        ADOBE_COMMERCE_ADMIN_PASSWORD: 'fake-test-pw-not-a-secret',
                    },
                },
            };

            const result = await resolveCommerceCredentials({
                project: withAdmin,
                secrets: makeSecrets(),
            });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });

        it('never consults SecretStorage', async () => {
            const secrets = makeSecrets();

            await resolveCommerceCredentials({ project: ACCS_PROJECT, secrets });

            expect(secrets.get).not.toHaveBeenCalled();
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
