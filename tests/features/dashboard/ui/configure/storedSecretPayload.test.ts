/**
 * Saving Configure must not destroy a stored credential.
 *
 * The interaction that makes this necessary, and it is not obvious from either
 * side alone:
 *
 * - A migrated secret lives in the OS keychain, so its Configure field renders
 *   EMPTY — the webview never receives the value.
 * - `migrateDeclaredSecrets` treats an empty declared secret as "the user cleared
 *   this" and DELETES the stored credential, which is how a rotated credential is
 *   meant to be removed.
 *
 * Put together without this filter, **every save of an untouched form silently
 * destroys the password.** The user changes a store code, presses Save, and the
 * demo stops authenticating with nothing on screen having suggested it would.
 *
 * `touchedFields` is the whole distinction: a blank the user typed is a clear, a
 * blank they never touched is an absence.
 */

import { withStoredSecretsPreserved } from '@/features/dashboard/ui/configure/storedSecretPayload';

const STORED = { 'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_PASSWORD: true } };

const configsWithBlankPassword = () => ({
    'adobe-commerce-paas': {
        ADOBE_COMMERCE_ADMIN_USERNAME: 'admin',
        ADOBE_COMMERCE_ADMIN_PASSWORD: '',
    },
});

describe('an untouched blank for a stored secret', () => {
    it('is DROPPED from the payload, so the migration never sees a clear', () => {
        const out = withStoredSecretsPreserved(
            configsWithBlankPassword(),
            STORED,
            new Set<string>(),
        );

        expect(out['adobe-commerce-paas']).not.toHaveProperty('ADOBE_COMMERCE_ADMIN_PASSWORD');
    });

    it('leaves every other field untouched', () => {
        const out = withStoredSecretsPreserved(
            configsWithBlankPassword(),
            STORED,
            new Set<string>(),
        );

        expect(out['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_USERNAME).toBe('admin');
    });

    it('does not mutate the caller’s configs', () => {
        const original = configsWithBlankPassword();

        withStoredSecretsPreserved(original, STORED, new Set<string>());

        expect(original['adobe-commerce-paas']).toHaveProperty('ADOBE_COMMERCE_ADMIN_PASSWORD');
    });
});

describe('a blank the user actually made', () => {
    it('SURVIVES, so clearing a rotated credential still works', () => {
        const out = withStoredSecretsPreserved(
            configsWithBlankPassword(),
            STORED,
            new Set(['ADOBE_COMMERCE_ADMIN_PASSWORD']),
        );

        expect(out['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe('');
    });
});

describe('everything else passes through', () => {
    it('keeps a typed replacement value', () => {
        const out = withStoredSecretsPreserved(
            { 'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_PASSWORD: 'new-one' } },
            STORED,
            new Set(['ADOBE_COMMERCE_ADMIN_PASSWORD']),
        );

        expect(out['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe('new-one');
    });

    it('keeps a blank for a field that is NOT a stored secret', () => {
        // Only a secret we are hiding gets this treatment. A blank ordinary field
        // is a real edit and must reach the save.
        const out = withStoredSecretsPreserved(
            { 'adobe-commerce-paas': { ADOBE_COMMERCE_ADMIN_URL: '' } },
            STORED,
            new Set<string>(),
        );

        expect(out['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_URL).toBe('');
    });

    it('is a no-op when the project holds no stored secrets', () => {
        const out = withStoredSecretsPreserved(configsWithBlankPassword(), {}, new Set<string>());

        expect(out['adobe-commerce-paas'].ADOBE_COMMERCE_ADMIN_PASSWORD).toBe('');
    });
});
