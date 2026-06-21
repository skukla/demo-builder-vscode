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
} from '@/features/project-creation/services/appBuilderComponentCatalogLoader';

const CONFIG_DIR = path.join(__dirname, '../../../../src/features/project-creation/config');

describe('appBuilderComponentCatalogLoader', () => {
    describe('getAvailableAppBuilderComponents (backend/frontend filter)', () => {
        it('returns the PaaS mesh for an EDS + PaaS selection', () => {
            const result = getAvailableAppBuilderComponents('adobe-commerce-paas', 'eds-storefront');
            const ids = result.map(d => d.id);
            expect(ids).toContain('commerce-paas-mesh');
            expect(ids).not.toContain('commerce-eds-mesh');
        });

        it('returns the ACCS mesh for an EDS + ACCS selection', () => {
            const result = getAvailableAppBuilderComponents('adobe-commerce-accs', 'eds-storefront');
            const ids = result.map(d => d.id);
            expect(ids).toContain('commerce-eds-mesh');
            expect(ids).not.toContain('commerce-paas-mesh');
        });

        it('returns the headless mesh for a headless frontend (either backend)', () => {
            const paas = getAvailableAppBuilderComponents('adobe-commerce-paas', 'headless').map(d => d.id);
            const accs = getAvailableAppBuilderComponents('adobe-commerce-accs', 'headless').map(d => d.id);
            expect(paas).toContain('headless-commerce-mesh');
            expect(accs).toContain('headless-commerce-mesh');
        });

        it('returns [] for an unmatched backend/frontend combo', () => {
            expect(getAvailableAppBuilderComponents('unknown-backend', 'unknown-frontend')).toEqual([]);
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
                expect.objectContaining({ owner: 'skukla', repo: 'commerce-paas-mesh' }),
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

    describe('seed catalog ↔ schema validity', () => {
        const catalog = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.json'), 'utf-8'),
        );
        const schema = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'app-builder-components.schema.json'), 'utf-8'),
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

        it('seeds exactly the three meshes with the spike-mapped sources', () => {
            const byId = Object.fromEntries(
                catalog.appBuilderComponents.map((d: { id: string }) => [d.id, d]),
            );
            expect(byId['commerce-paas-mesh'].source.repo).toBe('commerce-paas-mesh');
            expect(byId['commerce-eds-mesh'].source.repo).toBe('commerce-eds-mesh');
            expect(byId['headless-commerce-mesh'].source.repo).toBe('headless-commerce-mesh');
        });
    });

    describe('load-bearing mesh API + env contracts (steps 04 + 07)', () => {
        it('every mesh entry requires GraphQLServiceSDK and provides MESH_ENDPOINT', () => {
            for (const id of ['commerce-paas-mesh', 'commerce-eds-mesh', 'headless-commerce-mesh']) {
                const entry = getAppBuilderComponentEntry(id);
                expect(entry?.requiredApis).toContain('GraphQLServiceSDK');
                expect(entry?.providesEnvVars).toContain('MESH_ENDPOINT');
            }
        });
    });
});
