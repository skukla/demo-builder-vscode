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

    /**
     * The shared-credential fallback.
     *
     * A demo project that selected no App Builder components has no Adobe I/O
     * workspace, so it can never hold an OAuth pair of its own. The broker asks
     * the shared discovery service for one instead.
     *
     * PRECEDENCE IS THE CONTRACT: a locally-configured pair always wins. Existing
     * projects stay on exactly the path they are on today, and a user who wants
     * their own credential gets it by supplying one.
     */
    describe('ACCS — the shared-credential broker', () => {
        const SHARED = { clientId: 'shared-id', clientSecret: 'fake-shared-secret-not-a-secret' };
        const served = () => jest.fn().mockResolvedValue({ ok: true, credentials: SHARED });
        const notConfigured = () => jest.fn().mockResolvedValue({ ok: false, reason: 'not-configured' });
        const unavailable = () => jest.fn().mockResolvedValue({ ok: false, reason: 'unavailable' });

        it('uses the shared pair when the project declares none', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT_NO_CREDS,
                broker: served(),
            });

            expect(result).toEqual({ ok: true, credentials: { kind: 'accs', ...SHARED } });
        });

        // The rule the whole design rests on.
        it('prefers a declared pair and never asks the broker', async () => {
            const broker = served();

            const result = await resolveCommerceCredentials({ project: ACCS_PROJECT, broker });

            expect(result).toEqual({
                ok: true,
                credentials: {
                    kind: 'accs',
                    clientId: 'client-id-value',
                    clientSecret: 'fake-test-secret-not-a-secret',
                },
            });
            expect(broker).not.toHaveBeenCalled();
        });

        // Half a declared pair is still "declared nothing usable", so the broker
        // gets its turn rather than the user being stuck behind a typo.
        it('falls through to the broker on half a declared pair', async () => {
            const broker = served();
            const half = {
                stackBackend: 'adobe-commerce-accs',
                componentConfigs: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_ID: 'only-the-id' } },
            };

            const result = await resolveCommerceCredentials({ project: half, broker });

            expect(result.ok).toBe(true);
            expect(broker).toHaveBeenCalled();
        });

        // No service configured is the user's to fix, and it is invisible
        // otherwise — riding on demoBuilder.accsDiscovery.services means someone
        // who never set up store discovery gets no broker and no hint one exists.
        it('reports no-credential-service when nothing is configured', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT_NO_CREDS,
                broker: notConfigured(),
            });

            expect(result).toEqual({ ok: false, reason: 'no-credential-service' });
        });

        // A service that answered and gave nothing (403, 503, timeout) leaves the
        // user the same remedy as before: supply a pair. Same reason, so the UI
        // branches on one thing and the HTTP detail stays in Debug Logs.
        it('reports needs-accs-credentials when the service had nothing', async () => {
            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT_NO_CREDS,
                broker: unavailable(),
            });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });

        // The four callers that have not been given a broker must behave exactly
        // as they did before this existed.
        it('is unchanged when no broker is supplied', async () => {
            const result = await resolveCommerceCredentials({ project: ACCS_PROJECT_NO_CREDS });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });

        it('never asks the broker for a PaaS project', async () => {
            const broker = served();

            const result = await resolveCommerceCredentials({
                project: { stackBackend: 'adobe-commerce-paas', componentConfigs: {} },
                broker,
            });

            expect(result).toEqual({ ok: false, reason: 'missing-paas-admin' });
            expect(broker).not.toHaveBeenCalled();
        });

        it('never asks the broker for an unknown backend', async () => {
            const broker = served();

            await resolveCommerceCredentials({
                project: { stackBackend: 'something-else', componentConfigs: {} },
                broker,
            });

            expect(broker).not.toHaveBeenCalled();
        });

        // Resolution runs in front of a modal and inside project creation. A
        // broker that throws must not take either down.
        it('degrades to needs-accs-credentials when the broker throws', async () => {
            const broker = jest.fn().mockRejectedValue(new Error('boom'));

            const result = await resolveCommerceCredentials({
                project: ACCS_PROJECT_NO_CREDS,
                broker,
            });

            expect(result).toEqual({ ok: false, reason: 'needs-accs-credentials' });
        });
    });
});
