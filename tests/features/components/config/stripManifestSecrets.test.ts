/**
 * A manifest handed to an agent carries no credentials — from ANY of its fields.
 *
 * The first version of this strip covered `componentConfigs`, because that is
 * where a probe found a live `ACCS_OAUTH_CLIENT_SECRET` in a `get_project`
 * response. It was not the only place. Four staleness baselines keep flat env
 * snapshots of whatever was set when they were captured, and `PAAS_MESH_ENV_VARS`
 * includes `ADOBE_CATALOG_API_KEY` — so the same leak survived one field over,
 * under a comment saying it had been closed.
 *
 * These tests enumerate every field rather than testing the helper generically,
 * because the risk is a field NOBODY remembered, and a generic test would forget
 * it in exactly the same way.
 */

import { stripManifestSecrets, SECRET_ENV_KEYS } from '@/features/components/config/envVarKeys';

const SECRET = 'fake-test-pw-not-a-secret';

/** One manifest carrying a secret in every place a manifest can carry one. */
const manifest = () => ({
    name: 'demo',
    componentConfigs: {
        'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_PASSWORD: SECRET, WEBSITE: 'base' },
    },
    meshState: { envVars: { ADOBE_CATALOG_API_KEY: SECRET, OTHER: 'keep' }, sourceHash: 'h' },
    edsStorefrontState: { envVars: { ACO_API_KEY: SECRET }, lastPublished: 'x' },
    frontendEnvState: { envVars: { EXPERIENCE_PLATFORM_API_KEY: SECRET }, capturedAt: 'x' },
    appBuilderComponents: {
        mesh: {
            name: 'Mesh',
            envVars: { ADOBE_CATALOG_API_KEY: SECRET },
            providesEnvVars: { ACCS_OAUTH_CLIENT_SECRET: SECRET },
        },
    },
});

describe('every env-carrying field', () => {
    it('strips componentConfigs', () => {
        const safe = stripManifestSecrets(manifest());

        expect(safe.componentConfigs['adobe-commerce-paas']).not.toHaveProperty(
            'ADOBE_COMMERCE_ADMIN_PASSWORD',
        );
    });

    it.each([
        ['meshState', 'ADOBE_CATALOG_API_KEY'],
        ['edsStorefrontState', 'ACO_API_KEY'],
        ['frontendEnvState', 'EXPERIENCE_PLATFORM_API_KEY'],
    ])('strips %s.envVars', (field, key) => {
        const safe = stripManifestSecrets(manifest()) as unknown as Record<
            string,
            { envVars: object }
        >;

        expect(safe[field].envVars).not.toHaveProperty(key);
    });

    it('strips each appBuilderComponents entry, both env maps', () => {
        const safe = stripManifestSecrets(manifest());

        expect(safe.appBuilderComponents.mesh.envVars).not.toHaveProperty('ADOBE_CATALOG_API_KEY');
        expect(safe.appBuilderComponents.mesh.providesEnvVars).not.toHaveProperty(
            'ACCS_OAUTH_CLIENT_SECRET',
        );
    });

    // The catch-all: whatever the fields are, no secret KEY may survive anywhere
    // in the serialized result. This is the assertion that would have caught the
    // original miss.
    it('leaves no secret value anywhere in the serialized manifest', () => {
        const serialized = JSON.stringify(stripManifestSecrets(manifest()));

        expect(serialized).not.toContain(SECRET);
        for (const key of SECRET_ENV_KEYS) {
            expect(serialized).not.toContain(key);
        }
    });
});

describe('what it must not disturb', () => {
    it('keeps non-secret values in every field', () => {
        const safe = stripManifestSecrets(manifest());

        expect(safe.componentConfigs['adobe-commerce-paas'].WEBSITE).toBe('base');
        expect(safe.meshState.envVars.OTHER).toBe('keep');
        expect(safe.meshState.sourceHash).toBe('h');
        expect(safe.appBuilderComponents.mesh.name).toBe('Mesh');
        expect(safe.name).toBe('demo');
    });

    it('does not mutate the input — callers hand it the LIVE manifest', () => {
        const original = manifest();

        stripManifestSecrets(original);

        expect(original.meshState.envVars.ADOBE_CATALOG_API_KEY).toBe(SECRET);
        expect(original.componentConfigs['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe(
            SECRET,
        );
    });

    it('survives a manifest missing every optional field', () => {
        expect(stripManifestSecrets({ name: 'bare' })).toEqual({ name: 'bare' });
    });
});
