/**
 * configureEnvLoader Tests
 *
 * Tests the pure helper that merges root `.env` values and manifest component configs
 * for the Configure screen. This is extracted from `ConfigureProjectWebviewCommand.loadExistingEnvValues`
 * so the merge logic can be unit-tested without the VS Code webview machinery.
 *
 * Regression coverage: non-installed backend components (e.g. `adobe-commerce-accs`) store
 * their env values in the project manifest (`.demo-builder.json`) rather than root `.env`.
 * The helper must fall back to manifest values when the root `.env` lacks a key.
 */

import { mergeEnvValuesFromSources } from '@/features/dashboard/commands/configureEnvLoader';

describe('mergeEnvValuesFromSources', () => {
    it('returns the input envValues unchanged when componentConfigs is empty', () => {
        const envValues = { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } };
        const result = mergeEnvValuesFromSources(envValues, {}, {});
        expect(result).toEqual(envValues);
    });

    it('skips components that already have loaded entries from disk', () => {
        const envValues = { 'eds-storefront': { FOO: 'disk-value' } };
        const rootEnv = {};
        const componentConfigs = { 'eds-storefront': { FOO: 'manifest-value' } };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['eds-storefront']).toEqual({ FOO: 'disk-value' });
    });

    it('pulls values from the root .env when present', () => {
        const envValues = {};
        const rootEnv = { ACCS_GRAPHQL_ENDPOINT: 'https://root-env.example.com/graphql' };
        const componentConfigs = {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: '' },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['adobe-commerce-accs']).toEqual({
            ACCS_GRAPHQL_ENDPOINT: 'https://root-env.example.com/graphql',
        });
    });

    it('falls back to manifest value when key is absent from root .env (ACCS regression)', () => {
        // Bug regression: ACCS backend values live in .demo-builder.json, not root .env.
        // Without this fallback, the Configure screen renders the field with an empty value.
        const envValues = {};
        const rootEnv = {};
        const componentConfigs = {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/xyz/graphql',
                ACCS_WEBSITE_CODE: 'citisignal',
                ACCS_STORE_CODE: 'citisignal_store',
                ACCS_STORE_VIEW_CODE: 'citisignal_us',
            },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['adobe-commerce-accs']).toEqual({
            ACCS_GRAPHQL_ENDPOINT: 'https://na1-sandbox.api.commerce.adobe.com/xyz/graphql',
            ACCS_WEBSITE_CODE: 'citisignal',
            ACCS_STORE_CODE: 'citisignal_store',
            ACCS_STORE_VIEW_CODE: 'citisignal_us',
        });
    });

    it('prefers root .env over manifest when both have the key', () => {
        // On-disk values represent the latest user edits (after .env regeneration).
        // They take precedence over stale manifest values.
        const envValues = {};
        const rootEnv = { ACCS_GRAPHQL_ENDPOINT: 'https://fresh-from-disk.example.com' };
        const componentConfigs = {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://stale-manifest.example.com' },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['adobe-commerce-accs']?.ACCS_GRAPHQL_ENDPOINT).toBe('https://fresh-from-disk.example.com');
    });

    it('skips empty-string and undefined manifest values — treats them as unset', () => {
        const envValues = {};
        const rootEnv = {};
        const componentConfigs = {
            'adobe-commerce-accs': {
                ACCS_GRAPHQL_ENDPOINT: '',
                ACCS_WEBSITE_CODE: undefined,
                ACCS_STORE_CODE: 'citisignal_store',
            },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        // Only the populated key should appear
        expect(result['adobe-commerce-accs']).toEqual({ ACCS_STORE_CODE: 'citisignal_store' });
    });

    it('coerces non-string manifest values (boolean, number) to strings', () => {
        const envValues = {};
        const rootEnv = {};
        const componentConfigs = {
            'some-component': { FEATURE_FLAG: true, TIMEOUT_MS: 30000 },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['some-component']).toEqual({ FEATURE_FLAG: 'true', TIMEOUT_MS: '30000' });
    });

    it('does not create an envValues entry for a component with no extractable values', () => {
        // A component whose config is all-empty should not appear in the result at all.
        const envValues = { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } };
        const rootEnv = {};
        const componentConfigs = {
            'eds-storefront': { AEM_ASSETS_ENABLED: 'true' },
            'empty-component': { FOO: '', BAR: undefined },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(result['empty-component']).toBeUndefined();
    });

    it('does not mutate the input envValues object', () => {
        const envValues = { 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } };
        const rootEnv = {};
        const componentConfigs = {
            'adobe-commerce-accs': { ACCS_STORE_CODE: 'citisignal' },
        };

        const result = mergeEnvValuesFromSources(envValues, rootEnv, componentConfigs);

        expect(envValues).toEqual({ 'eds-storefront': { AEM_ASSETS_ENABLED: 'true' } });
        expect(result).not.toBe(envValues);
    });
});
