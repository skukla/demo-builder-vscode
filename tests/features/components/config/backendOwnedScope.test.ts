/**
 * The BACKEND component owns the Commerce store scope wherever `componentConfigs`
 * is resolved. `BACKEND_OWNED_SCOPE_KEYS` says so in prose — "any new resolver
 * over componentConfigs must consult the backend first for these keys" — and
 * three resolvers now call this module instead of each re-implementing it.
 */

import {
    applyBackendOwnedScope,
    resolveBackendOwnedScopeValue,
} from '@/features/components/config/backendOwnedScope';

const BACKEND_CONFIG = {
    ACCS_WEBSITE_CODE: 'citisignal',
    ACCS_GRAPHQL_ENDPOINT: 'https://backend.example/graphql',
};

describe('resolveBackendOwnedScopeValue', () => {
    it('returns the backend value for a scope key', () => {
        expect(resolveBackendOwnedScopeValue('ACCS_WEBSITE_CODE', BACKEND_CONFIG)).toBe(
            'citisignal'
        );
    });

    it('returns undefined for a key the backend does NOT own', () => {
        // The control. Without it, "backend always wins" would pass every other
        // case here while silently changing the rule for every key. MESH_ENDPOINT
        // is PROVIDED by the mesh — the backend has no claim on it.
        expect(resolveBackendOwnedScopeValue('MESH_ENDPOINT', BACKEND_CONFIG)).toBeUndefined();
    });

    it('returns undefined when the backend does not define the scope key', () => {
        expect(resolveBackendOwnedScopeValue('ACCS_STORE_CODE', BACKEND_CONFIG)).toBeUndefined();
    });

    it('returns undefined when there is no backend config at all', () => {
        expect(resolveBackendOwnedScopeValue('ACCS_WEBSITE_CODE', undefined)).toBeUndefined();
    });
});

describe('applyBackendOwnedScope', () => {
    it('overwrites scope keys the merged record took from somewhere else', () => {
        const merged = {
            ACCS_WEBSITE_CODE: 'base',
            ACCS_GRAPHQL_ENDPOINT: 'https://mesh.example/graphql',
        };

        applyBackendOwnedScope(merged, BACKEND_CONFIG);

        expect(merged.ACCS_WEBSITE_CODE).toBe('citisignal');
    });

    it('leaves NON-scope keys untouched — the control', () => {
        // Only the scope keys change hands here. The Commerce endpoint is
        // duplicated too, but who wins it is the caller's tiebreak: the `.env`
        // generator takes first-wins and `mergeComponentConfigs` deliberately
        // lets the mesh win, so this must not decide it for either of them.
        const merged = {
            ACCS_WEBSITE_CODE: 'base',
            ACCS_GRAPHQL_ENDPOINT: 'https://mesh.example/graphql',
        };

        applyBackendOwnedScope(merged, BACKEND_CONFIG);

        expect(merged.ACCS_GRAPHQL_ENDPOINT).toBe('https://mesh.example/graphql');
    });

    it('leaves scope keys the backend does not define', () => {
        const merged = { ACCS_STORE_CODE: 'main_website_store' };

        applyBackendOwnedScope(merged, BACKEND_CONFIG);

        expect(merged.ACCS_STORE_CODE).toBe('main_website_store');
    });

    it('copies a scope key the backend defines as undefined', () => {
        // `in`, not `!== undefined`: an explicitly-blank backend value is still
        // the backend's answer, and this preserves the behaviour configGenerator
        // had before the extraction.
        const merged: Record<string, unknown> = { ACCS_WEBSITE_CODE: 'base' };

        applyBackendOwnedScope(merged, { ACCS_WEBSITE_CODE: undefined });

        expect('ACCS_WEBSITE_CODE' in merged).toBe(true);
        expect(merged.ACCS_WEBSITE_CODE).toBeUndefined();
    });

    it('is a no-op without a backend config', () => {
        const merged = { ACCS_WEBSITE_CODE: 'base' };

        applyBackendOwnedScope(merged, undefined);

        expect(merged.ACCS_WEBSITE_CODE).toBe('base');
    });
});
