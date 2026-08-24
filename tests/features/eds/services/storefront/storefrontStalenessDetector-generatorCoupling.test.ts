/**
 * The watch list must cover every env key configGenerator reads.
 *
 * `STOREFRONT_CONFIG_ENV_VARS` (storefrontStalenessDetector) decides "the
 * storefront config changed, prompt a republish". `extractConfigParamsFromConfigs`
 * (configGenerator) decides what actually lands in `config.json`. Two
 * hand-maintained lists over one schema, and the detector's own docstring names
 * the coupling — so a key the generator reads but the detector ignores is a
 * silent wrong-endpoint storefront: no stale flag, no prompt, no error.
 *
 * That is exactly what happened. `PAAS_GRAPHQL_ENDPOINT` and
 * `PAAS_CATALOG_SERVICE_ENDPOINT` were absent from the watch list while the
 * generator read both on the PaaS path. The ACCS arm was complete, which is why
 * the common path hid it (found 2026-08-04 by audit, not by a user).
 *
 * This test drives the coupling MECHANICALLY rather than restating the lists:
 * feed the generator nothing but what the detector watches, and every param the
 * backend supports must still come out defined. A param sourced from an
 * unwatched key resolves to undefined and fails here — including params that do
 * not exist yet.
 */

import { extractConfigParamsFromConfigs } from '@/features/eds/services/configGenerator';
import { getStorefrontEnvVars } from '@/features/eds/services/storefront/storefrontStalenessDetector';
import * as ENV from '@/features/components/config/envVarKeys';

jest.mock('@/core/logging', () => ({
    getLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        trace: jest.fn(),
    }),
}));

/**
 * Every env key in the schema, each holding a distinct sentinel — passed through
 * `getStorefrontEnvVars`, which keeps ONLY the watched subset. Whatever survives
 * is precisely what a republish prompt would be triggered by.
 */
function watchedSubsetOfEverything(): Record<string, string> {
    const everything: Record<string, string> = {};
    for (const [name, key] of Object.entries(ENV)) {
        if (typeof key === 'string') {
            everything[key] = `sentinel:${name}`;
        }
    }
    // AEM_ASSETS_ENABLED has no envVarKeys constant (it is watched by the
    // detector and read as a boolean by the generator), so set it directly —
    // 'true' so the boolean read is exercised too.
    everything.AEM_ASSETS_ENABLED = 'true';
    return getStorefrontEnvVars(everything);
}

/**
 * Params the generator returns as `undefined` BY DESIGN on a given backend
 * (`isAccs ? undefined : …`) — an asymmetry that is correct, not a gap.
 */
const STRUCTURALLY_ABSENT: Record<'accs' | 'paas', readonly string[]> = {
    accs: ['catalogServiceEndpoint', 'commerceApiKey', 'commerceEnvironmentId'],
    paas: [],
};

describe('watch list covers every key configGenerator reads', () => {
    it.each([
        ['accs', 'adobe-commerce-accs'],
        ['paas', 'adobe-commerce-paas'],
    ] as const)(
        'every %s param the generator produces is sourced from a WATCHED key',
        (backend, backendComponentId) => {
            const watched = watchedSubsetOfEverything();

            const params = extractConfigParamsFromConfigs(
                { backend: watched },
                undefined,
                backendComponentId
            );

            const missing = Object.entries(params)
                .filter(([name, value]) => {
                    if (name === 'environmentType') return false;
                    if (STRUCTURALLY_ABSENT[backend].includes(name)) return false;
                    return value === undefined;
                })
                .map(([name]) => name);

            expect(missing).toEqual([]);
        }
    );

    it('is not vacuous — an unwatched key really does surface as a gap', () => {
        // Drop one watched key and the param it feeds must go undefined, proving
        // the assertion above would catch a real omission rather than passing on
        // an empty or all-defaulted result.
        const watched = watchedSubsetOfEverything();
        delete watched[ENV.PAAS_STORE_CODE];

        const params = extractConfigParamsFromConfigs(
            { backend: watched },
            undefined,
            'adobe-commerce-paas'
        );

        expect(params.storeCode).toBeUndefined();
    });
});
