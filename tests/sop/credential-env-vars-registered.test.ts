/**
 * SOP: every credential env var is registered as a secret.
 *
 * `stripSecretValues` is what keeps a settings export honest — the export promises
 * "a secret-free copy" and delivers one by filtering `componentConfigs` against
 * `SECRET_ENV_KEYS`. That list is hand-maintained, so **the export is exactly as
 * safe as somebody's memory**. Its own docstring says so: *"Adding a Commerce
 * credential? Add it here, or it ships in a 'secret-free' file."*
 *
 * That instruction has no enforcement. This is the enforcement.
 *
 * WHY A SOURCE-READING TEST. The failure is a var that exists in the catalog and
 * not in the list. No runtime behaviour is wrong until someone exports a project
 * they then share, at which point the leak has already happened. It has to be asked
 * of the catalog, not of a running system.
 *
 * The rule deliberately keys off the var NAME rather than `type: 'password'`,
 * because `type` drives how the Configure field RENDERS, not whether the value is
 * sensitive — exactly one var in the catalog is typed `password` while three API
 * keys are typed `text`. Filtering on type would strip the admin password and ship
 * the keys.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SECRET_ENV_KEYS } from '@/core/config/envVarKeys';

const CATALOG = path.join(
    __dirname,
    '..',
    '..',
    'src',
    'features',
    'components',
    'config',
    'components.json',
);

/**
 * Name fragments that mean "this value is a credential".
 *
 * A name-based rule is crude and that is the point: it fires on the shape of a new
 * var before anyone has thought about it, which is when the omission happens.
 */
const CREDENTIAL_PATTERNS = [/PASSWORD/, /SECRET/, /_API_KEY$/, /CLIENT_ID$/, /_TOKEN$/];

/** Vars whose name looks like a credential but whose value is not one. */
const NOT_CREDENTIALS: Record<string, string> = {
    // A username is half a credential, not a secret — and the settings export stays
    // useful for re-import with it present. Documented in envVarKeys.ts.
    ADOBE_COMMERCE_ADMIN_USERNAME: 'a username is not a secret',
    // An OAuth client id is public by design; only the secret half is sensitive.
    ACCS_OAUTH_CLIENT_ID: 'an OAuth client id is not secret, its paired secret is',
};

function catalogEnvVarNames(): string[] {
    const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8')) as {
        envVars?: Record<string, unknown>;
    };
    return Object.keys(catalog.envVars ?? {});
}

describe('SOP: credential env vars are registered as secrets', () => {
    it('CONTROL: reads the catalog at all — the check is pointed somewhere real', () => {
        // Positive control. A wrong path makes every assertion below pass over an
        // empty list, which is the "clean result from a check that never ran"
        // failure this repo keeps hitting.
        expect(catalogEnvVarNames().length).toBeGreaterThan(20);
    });

    it('registers every credential-shaped env var in SECRET_ENV_KEYS', () => {
        const unregistered = catalogEnvVarNames()
            .filter((name) => CREDENTIAL_PATTERNS.some((p) => p.test(name)))
            .filter((name) => !NOT_CREDENTIALS[name])
            .filter((name) => !SECRET_ENV_KEYS.includes(name));

        expect(unregistered).toEqual([]);
    });

    it('lists nothing in SECRET_ENV_KEYS that the catalog no longer defines', () => {
        // A list that accumulates dead entries stops being read, and a list nobody
        // reads is the state this test exists to prevent.
        const names = new Set(catalogEnvVarNames());
        const stale = SECRET_ENV_KEYS.filter((key) => !names.has(key));

        expect(stale).toEqual([]);
    });

    it('documents every credential-shaped name it deliberately excuses', () => {
        // An exemption that stopped applying is how an allowlist rots into folklore.
        const names = new Set(catalogEnvVarNames());
        const gone = Object.keys(NOT_CREDENTIALS).filter((name) => !names.has(name));

        expect(gone).toEqual([]);
    });
});
