/**
 * AppBuilderComponent Catalog Loader Tests (Step 03)
 *
 * The 6th declarative config (app-builder-components.json), mirroring block-libraries.json.
 * Filters by backend/frontend, resolves entry source + env schema, and the
 * seed validates against app-builder-components.schema.json. The mesh entries'
 * requiredApis / providesEnvVars are load-bearing for steps 04 + 07.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    getAvailableAppBuilderComponents,
    getAppBuilderComponentEntry,
    getAppBuilderComponentSource,
    getAppBuilderComponentEnvSchema,
    getAppBuilderComponentName,
    buildCustomIntegrationEntry,
} from '@/features/project-creation/services/appBuilderComponentCatalogLoader';

const CONFIG_DIR = path.join(__dirname, '../../../../src/features/project-creation/config');

describe('appBuilderComponentCatalogLoader', () => {
    describe('getAvailableAppBuilderComponents (backend/frontend filter)', () => {
        it('returns the PaaS mesh for an EDS + PaaS selection', () => {
            const result = getAvailableAppBuilderComponents(
                'adobe-commerce-paas',
                'eds-storefront'
            );
            const ids = result.map((d) => d.id);
            expect(ids).toContain('commerce-paas-mesh');
            expect(ids).not.toContain('commerce-eds-mesh');
        });

        it('returns the ACCS mesh for an EDS + ACCS selection', () => {
            const result = getAvailableAppBuilderComponents(
                'adobe-commerce-accs',
                'eds-storefront'
            );
            const ids = result.map((d) => d.id);
            expect(ids).toContain('commerce-eds-mesh');
            expect(ids).not.toContain('commerce-paas-mesh');
        });

        it('returns the headless mesh for a headless frontend (either backend)', () => {
            const paas = getAvailableAppBuilderComponents('adobe-commerce-paas', 'headless').map(
                (d) => d.id
            );
            const accs = getAvailableAppBuilderComponents('adobe-commerce-accs', 'headless').map(
                (d) => d.id
            );
            expect(paas).toContain('headless-commerce-mesh');
            expect(accs).toContain('headless-commerce-mesh');
        });

        it('returns the blank shell on every backend/frontend combo (no axis restrictions)', () => {
            for (const [backend, frontend] of [
                ['adobe-commerce-paas', 'eds-storefront'],
                ['adobe-commerce-accs', 'eds-storefront'],
                ['adobe-commerce-paas', 'headless'],
                ['adobe-commerce-accs', 'headless'],
            ]) {
                const ids = getAvailableAppBuilderComponents(backend, frontend).map((d) => d.id);
                expect(ids).toContain('app-builder-shell');
            }
        });

        it('returns only axis-unrestricted entries for an unmatched backend/frontend combo', () => {
            const ids = getAvailableAppBuilderComponents('unknown-backend', 'unknown-frontend').map(
                (d) => d.id
            );
            expect(ids).toEqual(['app-builder-shell']);
        });
    });

    describe('getAppBuilderComponentEntry', () => {
        it('resolves a seeded entry by id', () => {
            const entry = getAppBuilderComponentEntry('commerce-paas-mesh');
            expect(entry).toBeDefined();
            expect(entry?.kind).toBe('mesh');
        });

        it('returns undefined for an unknown id', () => {
            expect(getAppBuilderComponentEntry('nope')).toBeUndefined();
        });
    });

    describe('getAppBuilderComponentSource', () => {
        it('returns the {owner, repo, branch} source for a seeded entry', () => {
            const source = getAppBuilderComponentSource('commerce-paas-mesh');
            expect(source).toEqual(
                expect.objectContaining({ owner: 'skukla', repo: 'commerce-paas-mesh' })
            );
        });

        it('returns undefined for an unknown id', () => {
            expect(getAppBuilderComponentSource('nope')).toBeUndefined();
        });
    });

    describe('getAppBuilderComponentEnvSchema', () => {
        it('returns the env schema array for a seeded entry', () => {
            const schema = getAppBuilderComponentEnvSchema('commerce-paas-mesh');
            expect(Array.isArray(schema)).toBe(true);
        });

        it('returns [] for an unknown id', () => {
            expect(getAppBuilderComponentEnvSchema('nope')).toEqual([]);
        });
    });

    describe('getAppBuilderComponentName', () => {
        it('returns the display name, falling back to id', () => {
            expect(getAppBuilderComponentName('commerce-paas-mesh')).toBeTruthy();
            expect(getAppBuilderComponentName('unknown-xyz')).toBe('unknown-xyz');
        });
    });

    describe('buildCustomIntegrationEntry (shell-injection + traversal gate)', () => {
        // owner/repo/branch are interpolated into a shell-executed `git clone`
        // downstream (componentInstallation) and into componentDef.id (a path
        // segment) — the entry builder is the extension-side chokepoint that
        // must reject anything outside the safe charset, mirroring the
        // dashboard's resolvePublicRepo gate.
        it('builds a valid entry with the default branch', () => {
            const entry = buildCustomIntegrationEntry({ owner: 'acme-co', repo: 'my.app_2' });

            expect(entry.id).toBe('acme-co-my.app_2');
            expect(entry.kind).toBe('integration');
            expect(entry.source).toEqual({ owner: 'acme-co', repo: 'my.app_2', branch: 'main' });
        });

        it('accepts a branch with slashes, dots, and hyphens', () => {
            const entry = buildCustomIntegrationEntry({
                owner: 'acme',
                repo: 'app',
                branch: 'feature/x-1.0',
            });

            expect(entry.source.branch).toBe('feature/x-1.0');
        });

        it('rejects an owner carrying shell metacharacters', () => {
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'o$(touch pwned)', repo: 'repo' })
            ).toThrow(/invalid/i);
        });

        it('rejects a repo carrying shell metacharacters', () => {
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'repo;rm -rf ~' })
            ).toThrow(/invalid/i);
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: 'repo`id`' })).toThrow(
                /invalid/i
            );
        });

        it('rejects dot-only names (path traversal via componentDef.id)', () => {
            expect(() => buildCustomIntegrationEntry({ owner: '..', repo: 'repo' })).toThrow(
                /invalid/i
            );
            expect(() => buildCustomIntegrationEntry({ owner: '.', repo: 'repo' })).toThrow(
                /invalid/i
            );
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: '..' })).toThrow(
                /invalid/i
            );
        });

        it('rejects a branch carrying shell metacharacters or dot-dot', () => {
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'app', branch: 'x$(id)' })
            ).toThrow(/invalid/i);
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'app', branch: 'a/../b' })
            ).toThrow(/invalid/i);
        });
    });

    describe('buildCustomIntegrationEntry (instance identity — shell instancing)', () => {
        // The shell repo is a TEMPLATE: N named instances share one source but
        // carry distinct instance ids (the sources-map key). The explicit id
        // becomes a components/<id>/ folder and a deriveOwPackage input, so it
        // is charset-gated like owner/repo.
        const SHELL_SOURCE = {
            owner: 'skukla',
            repo: 'app-builder-shell',
            name: 'Firefly Image Gen',
        };

        it('uses the explicit id (the sources-map key) instead of the owner-repo derivation', () => {
            const entry = buildCustomIntegrationEntry(SHELL_SOURCE, 'firefly-image-gen');

            expect(entry.id).toBe('firefly-image-gen');
            expect(entry.kind).toBe('integration');
            expect(entry.source).toEqual({
                owner: 'skukla',
                repo: 'app-builder-shell',
                branch: 'main',
            });
        });

        it('resolves the display name from source.name', () => {
            const entry = buildCustomIntegrationEntry(SHELL_SOURCE, 'firefly-image-gen');

            expect(entry.name).toBe('Firefly Image Gen');
        });

        it('falls back to the repo name when the source carries no name', () => {
            const entry = buildCustomIntegrationEntry(
                { owner: 'skukla', repo: 'app-builder-shell' },
                'order-sync'
            );

            expect(entry.name).toBe('app-builder-shell');
        });

        it('uses source.name even without an explicit id (name resolution is unconditional)', () => {
            const entry = buildCustomIntegrationEntry({
                owner: 'acme',
                repo: 'erp-bridge',
                name: 'ERP Bridge',
            });

            expect(entry.id).toBe('acme-erp-bridge');
            expect(entry.name).toBe('ERP Bridge');
        });

        it('produces two DISTINCT integration entries for two instances of the same shell source', () => {
            const orderSync = buildCustomIntegrationEntry(
                { owner: 'skukla', repo: 'app-builder-shell', name: 'Order Sync' },
                'order-sync'
            );
            const firefly = buildCustomIntegrationEntry(SHELL_SOURCE, 'firefly-image-gen');

            expect(orderSync.id).toBe('order-sync');
            expect(firefly.id).toBe('firefly-image-gen');
            expect(orderSync.id).not.toBe(firefly.id);
            expect(orderSync.name).toBe('Order Sync');
            expect(firefly.name).toBe('Firefly Image Gen');
            expect(orderSync.kind).toBe('integration');
            expect(firefly.kind).toBe('integration');
        });

        it('keeps the no-id call byte-identical to today (dashboard add-door pin)', () => {
            const entry = buildCustomIntegrationEntry({ owner: 'acme-co', repo: 'my.app_2' });

            expect(entry).toEqual({
                id: 'acme-co-my.app_2',
                name: 'my.app_2',
                description: 'Custom App Builder component from acme-co/my.app_2',
                kind: 'integration',
                source: { owner: 'acme-co', repo: 'my.app_2', branch: 'main' },
            });
        });

        it('accepts explicit ids within the GitHub-name charset', () => {
            expect(
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, 'My.App_2-x').id
            ).toBe('My.App_2-x');
        });

        it('rejects an explicit id with whitespace or shell metacharacters (folder + ow.package input)', () => {
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, 'a b')).toThrow(
                /invalid/i
            );
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, 'x;rm')
            ).toThrow(/invalid/i);
        });

        it('rejects an explicit id carrying path traversal', () => {
            expect(() =>
                buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, '../up')
            ).toThrow(/invalid/i);
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, '..')).toThrow(
                /invalid/i
            );
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, '.')).toThrow(
                /invalid/i
            );
        });

        it('rejects an empty explicit id', () => {
            expect(() => buildCustomIntegrationEntry({ owner: 'acme', repo: 'app' }, '')).toThrow(
                /invalid/i
            );
        });
    });

    describe('seed catalog ↔ schema validity', () => {
        const catalog = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.json'), 'utf-8')
        );
        const schema = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.schema.json'), 'utf-8')
        );

        it('declares the schema reference and a version', () => {
            expect(catalog.$schema).toBeDefined();
            expect(typeof catalog.version).toBe('string');
            expect(Array.isArray(catalog.appBuilderComponents)).toBe(true);
        });

        it('every entry has the schema-required fields with valid kind', () => {
            const required: string[] = schema.definitions.appBuilderComponent.required;
            for (const entry of catalog.appBuilderComponents) {
                for (const field of required) {
                    expect(entry[field]).toBeDefined();
                }
                expect(['mesh', 'integration']).toContain(entry.kind);
            }
        });

        it('every env-schema item has {name, type} with type ∈ {text, secret}', () => {
            for (const entry of catalog.appBuilderComponents) {
                for (const envVar of entry.envSchema ?? []) {
                    expect(typeof envVar.name).toBe('string');
                    expect(['text', 'secret']).toContain(envVar.type);
                }
            }
        });

        it('seeds the three meshes (spike-mapped sources) plus the blank shell integration', () => {
            const byId = Object.fromEntries(
                catalog.appBuilderComponents.map((d: { id: string }) => [d.id, d])
            );
            expect(byId['commerce-paas-mesh'].source.repo).toBe('commerce-paas-mesh');
            expect(byId['commerce-eds-mesh'].source.repo).toBe('commerce-eds-mesh');
            expect(byId['headless-commerce-mesh'].source.repo).toBe('headless-commerce-mesh');
            expect(byId['app-builder-shell'].source.repo).toBe('app-builder-shell');
            expect(byId['app-builder-shell'].kind).toBe('integration');
        });

        it('the shell integration is unrestricted: no axis filters, no APIs, no env schema', () => {
            const shell = catalog.appBuilderComponents.find(
                (d: { id: string }) => d.id === 'app-builder-shell'
            );
            // Omitted axes mean "available on every stack"; APIs arrive at
            // runtime (plan step 3), not from the catalog.
            expect(shell.compatibleBackends).toBeUndefined();
            expect(shell.compatibleFrontends).toBeUndefined();
            expect(shell.requiredApis).toBeUndefined();
            expect(shell.envSchema).toBeUndefined();
        });
    });

    describe('load-bearing mesh API + env contracts (steps 04 + 07)', () => {
        it('every mesh entry requires GraphQLServiceSDK and provides MESH_ENDPOINT', () => {
            for (const id of [
                'commerce-paas-mesh',
                'commerce-eds-mesh',
                'headless-commerce-mesh',
            ]) {
                const entry = getAppBuilderComponentEntry(id);
                expect(entry?.requiredApis).toContain('GraphQLServiceSDK');
                expect(entry?.providesEnvVars).toContain('MESH_ENDPOINT');
            }
        });
    });
});
