/**
 * SECRET_ENV_KEYS — the gate behind the "secret-free copy" promise.
 *
 * `export_project_settings` with `includeSecrets: false` strips every key in
 * SECRET_ENV_KEYS. That list is maintained by hand, and a doc comment asking
 * people to add new credentials to it is not a gate — it is a hope. These tests
 * are the gate.
 *
 * They would have caught the state this session started in: `includeSecrets`
 * removed nothing at all, and the obvious fix (filter on `type: 'password'`)
 * would have shipped three API keys in a file stamped `includesSecrets: false`,
 * because only ONE catalog var is typed `password` and `type` describes how a
 * field RENDERS, not whether its value is sensitive.
 */

import componentsJson from '@/features/components/config/components.json';
import { SECRET_ENV_KEYS } from '@/core/config/envVarKeys';

/**
 * Names that read as a credential. Deliberately broad: a false positive costs
 * one line in SECRET_ENV_KEYS, a false negative ships a credential in a file
 * that says it carries none.
 */
const CREDENTIAL_SHAPED = /PASSWORD|SECRET|API_KEY|TOKEN|CREDENTIAL/;

const catalogKeys = Object.keys(
    (componentsJson as { envVars?: Record<string, unknown> }).envVars ?? {}
);

describe('SECRET_ENV_KEYS covers every credential in the catalog', () => {
    it('has a catalog to check — control, so the rest cannot pass vacuously', () => {
        // A mis-resolved import would make every assertion below trivially true.
        expect(catalogKeys.length).toBeGreaterThan(20);
        expect(catalogKeys).toContain('ADOBE_COMMERCE_ADMIN_PASSWORD');
    });

    it('the credential pattern actually matches something — control', () => {
        // A broken regex would make the real assertion pass while checking nothing.
        expect(catalogKeys.filter((k) => CREDENTIAL_SHAPED.test(k)).length).toBeGreaterThan(0);
    });

    it('declares every credential-shaped catalog key as secret', () => {
        const unlisted = catalogKeys
            .filter((key) => CREDENTIAL_SHAPED.test(key))
            .filter((key) => !SECRET_ENV_KEYS.includes(key));

        // Fails the moment someone adds e.g. COMMERCE_CLIENT_SECRET to
        // components.json without listing it here. Add it to SECRET_ENV_KEYS.
        expect(unlisted).toEqual([]);
    });

    it('lists no key that has left the catalog', () => {
        // The reverse direction, and the sneakier one: a renamed env var leaves
        // SECRET_ENV_KEYS pointing at nothing, so the strip silently stops
        // covering it while the list still looks populated.
        const stale = SECRET_ENV_KEYS.filter((key) => !catalogKeys.includes(key));

        expect(stale).toEqual([]);
    });

    it('does not claim App Builder component secrets', () => {
        // Those are `type: 'secret'` in the appBuilder catalog and are routed to
        // SecretStorage by splitAppBuilderComponentSecrets before anything reaches
        // componentConfigs. Listing them here would imply the export is what keeps
        // them safe, which would be the wrong mental model to leave behind.
        for (const key of SECRET_ENV_KEYS) {
            expect(catalogKeys).toContain(key);
        }
    });
});
