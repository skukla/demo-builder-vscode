/**
 * A credential is never in neither place.
 *
 * Phase 2 of `.rptc/complete/component-secret-routing/`. The sequencing IS the
 * design — write, read back, and only then strip — and the tests that matter are
 * the ones where the write goes wrong, because that is where a bare eager strip
 * loses a user's credential with nothing to recover it from.
 *
 * Every failure mode below leaves the value exactly where it was. That is the
 * property; the migration succeeding is the easy half.
 */

import {
    commerceSecretKey,
    resolveAccsOAuthPair,
} from '@/features/components/services/commerceCredentialStore';
import {
    declaredSecretKeys,
    hydrateDeclaredSecrets,
    loadDeclaredSecretFlags,
    migrateDeclaredSecrets,
    reKeyProjectSecrets,
} from '@/features/components/services/commerceSecretMigration';

const PROJECT = '/Users/someone/projects/demo';
const FAKE_SECRET = 'fake-test-pw-not-a-secret';

/** SecretStorage that works. */
function workingStore() {
    const store = new Map<string, string>();
    return {
        store: jest.fn(async (k: string, v: string) => void store.set(k, v)),
        get: jest.fn(async (k: string) => store.get(k)),
        delete: jest.fn(async (k: string) => void store.delete(k)),
        _map: store,
    };
}

/** SecretStorage whose write throws. */
function throwingStore() {
    return {
        store: jest.fn(async () => {
            throw new Error('keychain unavailable');
        }),
        get: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
    };
}

/** The nastier one: write RESOLVES but nothing is stored. */
function lyingStore() {
    return {
        store: jest.fn(async () => undefined),
        get: jest.fn(async () => undefined),
        delete: jest.fn(async () => undefined),
    };
}

const configs = () => ({
    'adobe-commerce-accs': {
        ACCS_OAUTH_CLIENT_ID: 'public-id',
        ACCS_OAUTH_CLIENT_SECRET: FAKE_SECRET,
    },
});

describe('what the catalog declares', () => {
    it('treats both Commerce credentials as secret', () => {
        const keys = declaredSecretKeys();

        expect(keys.has('ACCS_OAUTH_CLIENT_SECRET')).toBe(true);
        // The PaaS password moved only once its three consumers were handled:
        // `.env` generation hydrates it at write time, the webview gates on an
        // `isSet` flag rather than the value, and the Configure field renders
        // "Saved" instead of an empty required box. Declaring it before any of
        // those existed silently killed store discovery and blanked the `.env`.
        expect(keys.has('ADOBE_COMMERCE_ADMIN_PASSWORD')).toBe(true);
    });

    it('does NOT treat the client id as secret — it is not one', () => {
        // The id is public and is what the UI shows to confirm which credential is
        // in use. Sweeping it into SecretStorage would blank that display.
        expect(declaredSecretKeys().has('ACCS_OAUTH_CLIENT_ID')).toBe(false);
    });
});

describe('the happy path', () => {
    it('moves the secret and strips it from configs', async () => {
        const secrets = workingStore();

        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        expect(out.moved).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        expect(out.retained).toEqual([]);
        expect(
            out.sanitizedConfigs?.['adobe-commerce-accs'],
        ).not.toHaveProperty('ACCS_OAUTH_CLIENT_SECRET');
    });

    it('leaves non-secret fields exactly where they are', async () => {
        const out = await migrateDeclaredSecrets(configs(), PROJECT, workingStore());

        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_ID).toBe('public-id');
    });

    it('verifies by READING BACK, not by trusting the write', async () => {
        const secrets = workingStore();

        await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        expect(secrets.store).toHaveBeenCalled();
        expect(secrets.get).toHaveBeenCalled();
    });

    it('does not mutate the caller’s object', async () => {
        // The caller may still persist the original on a failure path elsewhere,
        // and it must see the credential it had.
        const original = configs();
        await migrateDeclaredSecrets(original, PROJECT, workingStore());

        expect(original['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(FAKE_SECRET);
    });
});

describe('the credential is never lost', () => {
    it('keeps it in configs when the write THROWS', async () => {
        const out = await migrateDeclaredSecrets(configs(), PROJECT, throwingStore());

        expect(out.moved).toEqual([]);
        expect(out.retained).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });

    it('keeps it in configs when the write SUCCEEDS but stores nothing', async () => {
        // The dangerous one. A resolved promise is not evidence, and without the
        // read-back this case strips a credential into the void.
        const out = await migrateDeclaredSecrets(configs(), PROJECT, lyingStore());

        expect(out.retained).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });

    it('keeps it when the store reads back a DIFFERENT value', async () => {
        const secrets = {
            store: jest.fn(async () => undefined),
            get: jest.fn(async () => 'something-else'),
            delete: jest.fn(async () => undefined),
        };

        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        expect(out.retained).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });
});

describe('nothing to do', () => {
    it('is a no-op without a projectId — an unsaved project has no key', async () => {
        const secrets = workingStore();

        const out = await migrateDeclaredSecrets(configs(), undefined, secrets);

        expect(secrets.store).not.toHaveBeenCalled();
        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });

    it('is a no-op without SecretStorage', async () => {
        const out = await migrateDeclaredSecrets(configs(), PROJECT, undefined);

        expect(out.moved).toEqual([]);
        expect(out.sanitizedConfigs?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(
            FAKE_SECRET,
        );
    });

    it('skips an empty value rather than storing a blank secret', async () => {
        const secrets = workingStore();

        await migrateDeclaredSecrets(
            { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: '' } },
            PROJECT,
            secrets,
        );

        expect(secrets.store).not.toHaveBeenCalled();
    });

    it('handles a project with no configs at all', async () => {
        const out = await migrateDeclaredSecrets(undefined, PROJECT, workingStore());

        expect(out.moved).toEqual([]);
    });
});

describe('the seam: migrate, then read back', () => {
    // The one shape neither suite covered alone, and the shape the migration
    // actually PRODUCES: id in componentConfigs, secret in SecretStorage. Testing
    // each side in isolation let a bug live where the read applied
    // both-halves-or-nothing to the FALLBACK, so the id became unreadable the
    // moment the secret moved — the credential was lost the instant the migration
    // succeeded, with 30+ tests green.
    it('a migrated ACCS pair is still resolvable', async () => {
        const secrets = workingStore();

        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);
        const pair = await resolveAccsOAuthPair(
            { secrets, projectId: PROJECT },
            out.sanitizedConfigs,
        );

        expect(pair).toEqual({ clientId: 'public-id', clientSecret: FAKE_SECRET });
    });

    it('stays resolvable after a SECOND migration pass', async () => {
        const secrets = workingStore();

        const first = await migrateDeclaredSecrets(configs(), PROJECT, secrets);
        const second = await migrateDeclaredSecrets(first.sanitizedConfigs, PROJECT, secrets);
        const pair = await resolveAccsOAuthPair(
            { secrets, projectId: PROJECT },
            second.sanitizedConfigs,
        );

        expect(pair).toEqual({ clientId: 'public-id', clientSecret: FAKE_SECRET });
    });

    it('a RETAINED secret is still resolvable — nothing moved, nothing lost', async () => {
        const secrets = throwingStore();

        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);
        const pair = await resolveAccsOAuthPair(
            { secrets, projectId: PROJECT },
            out.sanitizedConfigs,
        );

        expect(pair).toEqual({ clientId: 'public-id', clientSecret: FAKE_SECRET });
    });
});

describe('clearing a credential', () => {
    it('deletes it from SecretStorage, so it stops being used', async () => {
        // Without this, a user who rotates the org-wide pair and clears the field
        // sees an empty box while every later import keeps writing with the old
        // credential — a state they cannot detect or fix from inside the product.
        const secrets = workingStore();
        const migrated = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const cleared = await migrateDeclaredSecrets(
            {
                'adobe-commerce-accs': {
                    ...migrated.sanitizedConfigs?.['adobe-commerce-accs'],
                    ACCS_OAUTH_CLIENT_SECRET: '',
                },
            },
            PROJECT,
            secrets,
        );

        expect(cleared.cleared).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        const pair = await resolveAccsOAuthPair(
            { secrets, projectId: PROJECT },
            cleared.sanitizedConfigs,
        );
        expect(pair).toBeUndefined();
    });
});

describe('re-keying after a rename', () => {
    it('follows the credential to the new project path', async () => {
        const secrets = workingStore();
        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const moved = await reKeyProjectSecrets(PROJECT, '/p/renamed', ['adobe-commerce-accs'], secrets);

        expect(moved).toEqual(['ACCS_OAUTH_CLIENT_SECRET']);
        const pair = await resolveAccsOAuthPair(
            { secrets, projectId: '/p/renamed' },
            out.sanitizedConfigs,
        );
        expect(pair?.clientSecret).toBe(FAKE_SECRET);
    });

    it('leaves nothing readable at the old key', async () => {
        const secrets = workingStore();
        await migrateDeclaredSecrets(configs(), PROJECT, secrets);
        await reKeyProjectSecrets(PROJECT, '/p/renamed', ['adobe-commerce-accs'], secrets);

        const atOldKey = await resolveAccsOAuthPair({ secrets, projectId: PROJECT }, {});

        expect(atOldKey).toBeUndefined();
    });

    it('keeps the value at the OLD key when the copy cannot be verified', async () => {
        // Copy-verify-delete: an interrupted move must leave the value readable
        // somewhere, and the old key is the only somewhere available.
        const entries: Record<string, string> = {};
        const secrets = {
            store: jest.fn(async (k: string, v: string) => {
                if (!k.includes('renamed')) entries[k] = v;
            }),
            get: jest.fn(async (k: string) => entries[k]),
            delete: jest.fn(async (k: string) => void delete entries[k]),
        };
        await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const moved = await reKeyProjectSecrets(PROJECT, '/p/renamed', ['adobe-commerce-accs'], secrets);

        expect(moved).toEqual([]);
        expect(secrets.delete).not.toHaveBeenCalled();
        // Assert the STORED value directly: the pair cannot assemble from storage
        // alone here (the client id lives in configs, which this case does not
        // carry), and "the pair is undefined" would pass even if the secret were
        // gone — which is the very thing this test exists to rule out.
        expect(
            await secrets.get(
                commerceSecretKey(PROJECT, 'adobe-commerce-accs', 'ACCS_OAUTH_CLIENT_SECRET'),
            ),
        ).toBe(FAKE_SECRET);
    });
});

describe('hydrate — the write-time inverse', () => {
    // `.env` is how a PaaS demo actually RECEIVES its admin password. Migrating the
    // value out of componentConfigs without this writes `KEY=` and breaks the demo
    // at runtime, with nothing failing at the call site.
    it('restores a migrated secret for a write', async () => {
        const secrets = workingStore();
        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const hydrated = await hydrateDeclaredSecrets(out.sanitizedConfigs, PROJECT, secrets);

        expect(hydrated?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(FAKE_SECRET);
    });

    it('does NOT mutate the configs it was given — the copy must never be persisted', async () => {
        const secrets = workingStore();
        const out = await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        await hydrateDeclaredSecrets(out.sanitizedConfigs, PROJECT, secrets);

        expect(out.sanitizedConfigs?.['adobe-commerce-accs']).not.toHaveProperty(
            'ACCS_OAUTH_CLIENT_SECRET',
        );
    });

    it('leaves a present value alone rather than overwriting from storage', async () => {
        const secrets = workingStore();
        await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const hydrated = await hydrateDeclaredSecrets(
            { 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: 'just-typed' } },
            PROJECT,
            secrets,
        );

        expect(hydrated?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe('just-typed');
    });

    it('is a no-op without a store — the value simply is not there to restore', async () => {
        const hydrated = await hydrateDeclaredSecrets(configs(), PROJECT, undefined);

        expect(hydrated?.['adobe-commerce-accs'].ACCS_OAUTH_CLIENT_SECRET).toBe(FAKE_SECRET);
    });
});

describe('isSet flags — what the webview is allowed to know', () => {
    it('reports presence, never the value', async () => {
        const secrets = workingStore();
        await migrateDeclaredSecrets(configs(), PROJECT, secrets);

        const flags = await loadDeclaredSecretFlags(['adobe-commerce-accs'], PROJECT, secrets);

        expect(flags).toEqual({ 'adobe-commerce-accs': { ACCS_OAUTH_CLIENT_SECRET: true } });
        expect(JSON.stringify(flags)).not.toContain(FAKE_SECRET);
    });

    it('omits a component that holds nothing', async () => {
        const flags = await loadDeclaredSecretFlags(
            ['adobe-commerce-accs'],
            PROJECT,
            workingStore(),
        );

        expect(flags).toEqual({});
    });

    it('is empty without a project id or a store', async () => {
        expect(await loadDeclaredSecretFlags(['x'], undefined, workingStore())).toEqual({});
        expect(await loadDeclaredSecretFlags(['x'], PROJECT, undefined)).toEqual({});
    });
});

describe('idempotence', () => {
    it('a second run over already-migrated configs does nothing', async () => {
        const secrets = workingStore();

        const first = await migrateDeclaredSecrets(configs(), PROJECT, secrets);
        secrets.store.mockClear();

        const second = await migrateDeclaredSecrets(first.sanitizedConfigs, PROJECT, secrets);

        expect(secrets.store).not.toHaveBeenCalled();
        expect(second.moved).toEqual([]);
        expect(second.retained).toEqual([]);
    });
});
