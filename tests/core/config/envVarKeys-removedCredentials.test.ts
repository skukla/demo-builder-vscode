/**
 * A credential whose field Demo Builder removed never leaves the machine (DI-6).
 *
 * `ACCS_OAUTH_CLIENT_SECRET` left `SECRET_ENV_KEYS` with its field on 2026-11-03
 * (2aea69b3e). An older project can still hold a value for it, and every export,
 * agent read and import strips through the functions below, so they must strip it too.
 */

import {
    maskEnvFileSecrets,
    stripManifestSecrets,
    stripSecretKeys,
    stripSecretValues,
} from '@/core/config/envVarKeys';

const FAKE_SECRET = 'fake-test-pw-not-a-secret';

describe('a removed credential is stripped like a live one', () => {
    it('from a componentConfigs map, which an export writes', () => {
        const stripped = stripSecretValues({
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql',
                ACCS_OAUTH_CLIENT_ID: 'old-client-id',
                ACCS_OAUTH_CLIENT_SECRET: FAKE_SECRET,
            },
        });

        expect(stripped).toStrictEqual({
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://example.invalid/graphql' },
        });
    });

    it('from a flat env snapshot', () => {
        expect(stripSecretKeys({ ACCS_OAUTH_CLIENT_SECRET: FAKE_SECRET, KEEP: 'x' })).toStrictEqual(
            { KEEP: 'x' }
        );
    });

    it('from a whole manifest, which get_project returns to an agent', () => {
        const safe = stripManifestSecrets({
            componentConfigs: { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: FAKE_SECRET } },
        });

        expect(safe.componentConfigs).toStrictEqual({ 'adobe-commerce-accs': {} });
    });

    it('from a .env file, keeping the key visible', () => {
        expect(maskEnvFileSecrets(`ACCS_OAUTH_CLIENT_SECRET=${FAKE_SECRET}\nKEEP=x`)).toBe(
            'ACCS_OAUTH_CLIENT_SECRET=[secret hidden]\nKEEP=x'
        );
    });
});
