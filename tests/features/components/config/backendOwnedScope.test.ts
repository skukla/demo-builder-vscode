/**
 * The BACKEND component owns the Commerce store scope wherever `componentConfigs`
 * is resolved. `BACKEND_OWNED_SCOPE_KEYS` says so in prose — "any new resolver
 * over componentConfigs must consult the backend first for these keys" — and
 * three resolvers now call this module instead of each re-implementing it.
 */

import {
    applyBackendOwnedScope,
    resolveBackendOwnedScopeValue,
    stripDuplicateBackendOwnedScope,
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

/**
 * `stripDuplicateBackendOwnedScope` — the migration half.
 *
 * The write side now sends store scope to the backend only, so existing manifests
 * are the last place duplicates live. The load-time strip removes them, and its
 * one hard rule is that it must never remove the last copy of a value.
 */
describe('stripDuplicateBackendOwnedScope', () => {
    it('removes the duplicate from every non-backend component', () => {
        const configs: Record<string, Record<string, unknown>> = {
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: 'citisignal' },
            'eds-accs-mesh': { ACCS_WEBSITE_CODE: 'base', OTHER: 'keep' },
        };

        const changed = stripDuplicateBackendOwnedScope(configs, 'adobe-commerce-accs');

        expect(changed).toBe(true);
        // The stale copy is what the 2026-08-10 bug read.
        expect('ACCS_WEBSITE_CODE' in configs['eds-accs-mesh']).toBe(false);
        expect(configs['eds-accs-mesh'].OTHER).toBe('keep');
        expect(configs['adobe-commerce-accs'].ACCS_WEBSITE_CODE).toBe('citisignal');
    });

    it('KEEPS a copy the backend does not define — that is the only copy, not a duplicate', () => {
        // Without this guard the migration deletes the value rather than the
        // duplicate: nothing else holds it and .env generation falls to empty.
        const configs: Record<string, Record<string, unknown>> = {
            'adobe-commerce-accs': { ACCS_STORE_CODE: 'store' },
            'eds-accs-mesh': { ACCS_WEBSITE_CODE: 'citisignal' },
        };

        const changed = stripDuplicateBackendOwnedScope(configs, 'adobe-commerce-accs');

        expect(changed).toBe(false);
        expect(configs['eds-accs-mesh'].ACCS_WEBSITE_CODE).toBe('citisignal');
    });

    it('removes a duplicate even when the backend value is blank', () => {
        // `in`, matching applyBackendOwnedScope: a blank backend value is still
        // the backend's answer, so the duplicate must not survive to fill it.
        const configs: Record<string, Record<string, unknown>> = {
            'adobe-commerce-accs': { ACCS_WEBSITE_CODE: '' },
            'eds-accs-mesh': { ACCS_WEBSITE_CODE: 'base' },
        };

        stripDuplicateBackendOwnedScope(configs, 'adobe-commerce-accs');

        expect('ACCS_WEBSITE_CODE' in configs['eds-accs-mesh']).toBe(false);
    });

    it('leaves non-scope keys alone', () => {
        const configs: Record<string, Record<string, unknown>> = {
            'adobe-commerce-accs': { ACCS_GRAPHQL_ENDPOINT: 'https://a' },
            'eds-accs-mesh': { ACCS_GRAPHQL_ENDPOINT: 'https://a' },
        };

        const changed = stripDuplicateBackendOwnedScope(configs, 'adobe-commerce-accs');

        // Not backend-owned — a separate audit item, deliberately untouched here.
        expect(changed).toBe(false);
        expect(configs['eds-accs-mesh'].ACCS_GRAPHQL_ENDPOINT).toBe('https://a');
    });

    it('is a no-op with no backend id, no backend config, or no configs', () => {
        const configs: Record<string, Record<string, unknown>> = {
            'eds-accs-mesh': { ACCS_WEBSITE_CODE: 'base' },
        };

        expect(stripDuplicateBackendOwnedScope(configs, undefined)).toBe(false);
        expect(stripDuplicateBackendOwnedScope(configs, 'adobe-commerce-accs')).toBe(false);
        expect(stripDuplicateBackendOwnedScope(undefined, 'adobe-commerce-accs')).toBe(false);
        expect(configs['eds-accs-mesh'].ACCS_WEBSITE_CODE).toBe('base');
    });
});
