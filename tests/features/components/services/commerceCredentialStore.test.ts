/**
 * One place knows where a Commerce credential lives.
 *
 * Phase 1 of `.rptc/complete/component-secret-routing/` — a read that checks
 * SecretStorage and falls back to `componentConfigs`. Nothing writes to
 * SecretStorage yet, so in production every lookup misses and falls through.
 *
 * **That is exactly why the SecretStorage branch is tested directly here.** It is
 * unreachable in production until phase 2, which makes it the kind of code that
 * ships broken and is discovered by the migration that depends on it. These tests
 * are the only thing standing behind it until then.
 *
 * The other rule under test is both-halves-or-nothing. A project half-migrated —
 * id moved, secret not — must read as "no credential", never as a usable pair with
 * an empty secret, because the service answers a blank secret with a 401 that
 * looks like a bad credential rather than a missing one.
 */

import {
    commerceSecretKey,
    resolveAccsOAuthPair,
    resolvePaasAdminPair,
} from '@/features/components/services/commerceCredentialStore';

const PROJECT_ID = '/Users/someone/projects/demo';
const FAKE_SECRET = 'fake-test-pw-not-a-secret';

/** A SecretStorage stand-in holding exactly what it is given. */
function secretStore(entries: Record<string, string> = {}) {
    return {
        get: jest.fn(async (key: string) => entries[key]),
    };
}

const accsConfigs = {
    'adobe-commerce-accs': {
        ACCS_OAUTH_CLIENT_ID: 'id-from-config',
        ACCS_OAUTH_CLIENT_SECRET: 'secret-from-config',
    },
};

const paasConfigs = {
    'adobe-commerce-paas': {
        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
        ADOBE_COMMERCE_ADMIN_PASSWORD: FAKE_SECRET,
    },
};

describe('the key scheme', () => {
    it('is per-project and per-component, so two projects never collide', () => {
        const a = commerceSecretKey('/p/one', 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET');
        const b = commerceSecretKey('/p/two', 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET');

        expect(a).not.toBe(b);
    });

    it('does NOT share the App Builder namespace', () => {
        // Sharing it would silently reinterpret every already-stored App Builder
        // secret, whose middle segment is a component id from a different catalog.
        expect(commerceSecretKey('p', 'c', 'V')).not.toContain('appBuilderComponentSecret');
    });
});

describe('falling back to componentConfigs (today, every read)', () => {
    it('reads the ACCS pair from config when SecretStorage is absent', async () => {
        const pair = await resolveAccsOAuthPair({}, accsConfigs);

        expect(pair).toEqual({ clientId: 'id-from-config', clientSecret: 'secret-from-config' });
    });

    it('reads the PaaS pair from config when SecretStorage is absent', async () => {
        const pair = await resolvePaasAdminPair({}, paasConfigs);

        expect(pair).toEqual({ username: 'admin', password: FAKE_SECRET });
    });

    it('falls through when SecretStorage holds nothing — the state shipping today', async () => {
        const secrets = secretStore();

        const pair = await resolveAccsOAuthPair({ secrets, projectId: PROJECT_ID }, accsConfigs);

        expect(secrets.get).toHaveBeenCalled(); // it really looked
        expect(pair).toEqual({ clientId: 'id-from-config', clientSecret: 'secret-from-config' });
    });

    it('never consults the store without a projectId — there would be no key', async () => {
        const secrets = secretStore();

        await resolveAccsOAuthPair({ secrets }, accsConfigs);

        expect(secrets.get).not.toHaveBeenCalled();
    });
});

describe('SecretStorage wins (phase 2, unreachable in production today)', () => {
    it('prefers the stored ACCS secret over the config copy', async () => {
        const secrets = secretStore({
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET')]:
                'secret-from-storage',
        });

        const pair = await resolveAccsOAuthPair({ secrets, projectId: PROJECT_ID }, accsConfigs);

        // The id still comes from config — a half-migrated project is the NORMAL
        // state during phase 2's write-through, not an edge case.
        expect(pair).toEqual({ clientId: 'id-from-config', clientSecret: 'secret-from-storage' });
    });

    it('prefers the stored PaaS password over the config copy', async () => {
        const secrets = secretStore({
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-paas', 'ADOBE_COMMERCE_ADMIN_PASSWORD')]:
                'password-from-storage',
        });

        const pair = await resolvePaasAdminPair({ secrets, projectId: PROJECT_ID }, paasConfigs);

        expect(pair).toEqual({ username: 'admin', password: 'password-from-storage' });
    });

    it('resolves a pair that lives ENTIRELY in storage, with no config at all', async () => {
        // The end state phase 3 converges on. If this fails, the migration has
        // nowhere to land.
        const secrets = secretStore({
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_ID')]: 'sid',
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET')]:
                'ssecret',
        });

        const pair = await resolveAccsOAuthPair({ secrets, projectId: PROJECT_ID }, {});

        expect(pair).toEqual({ clientId: 'sid', clientSecret: 'ssecret' });
    });
});

describe('both halves or nothing', () => {
    it('returns undefined when only the ACCS id is present', async () => {
        const pair = await resolveAccsOAuthPair({}, {
            'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_ID: 'lonely' },
        });

        expect(pair).toBeUndefined();
    });

    it('returns undefined when only the PaaS username is present', async () => {
        const pair = await resolvePaasAdminPair({}, {
            'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_USERNAME: 'admin' },
        });

        expect(pair).toBeUndefined();
    });

    it('returns undefined for a half-migrated project with a missing secret', async () => {
        // id in storage, secret nowhere. Reporting this as configured would send a
        // blank secret to the service, whose 401 reads as "wrong credential".
        const secrets = secretStore({
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_ID')]: 'sid',
        });

        const pair = await resolveAccsOAuthPair({ secrets, projectId: PROJECT_ID }, {});

        expect(pair).toBeUndefined();
    });

    it('treats an empty stored value as absent, not as a credential', async () => {
        const secrets = secretStore({
            [commerceSecretKey(PROJECT_ID, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET')]: '',
        });

        const pair = await resolveAccsOAuthPair({ secrets, projectId: PROJECT_ID }, accsConfigs);

        // Empty falls through to config rather than winning as ''.
        expect(pair?.clientSecret).toBe('secret-from-config');
    });
});

describe('no credential anywhere', () => {
    it('returns undefined rather than a partial object', async () => {
        expect(await resolveAccsOAuthPair({}, {})).toBeUndefined();
        expect(await resolvePaasAdminPair({}, {})).toBeUndefined();
        expect(await resolveAccsOAuthPair({}, undefined)).toBeUndefined();
    });
});
