/**
 * Deployable Catalog Loader Tests (Step 03)
 *
 * The 6th declarative config (deployables.json), mirroring block-libraries.json.
 * Filters by backend/frontend, resolves entry source + env schema, and the
 * seed validates against deployables.schema.json. The mesh entries'
 * requiredApis / providesEnvVars are load-bearing for steps 04 + 07.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
    getAvailableDeployables,
    getDeployableEntry,
    getDeployableSource,
    getDeployableEnvSchema,
    getDeployableName,
} from '@/features/project-creation/services/deployableCatalogLoader';

const CONFIG_DIR = path.join(__dirname, '../../../../src/features/project-creation/config');

describe('deployableCatalogLoader', () => {
    describe('getAvailableDeployables (backend/frontend filter)', () => {
        it('returns the PaaS mesh for an EDS + PaaS selection', () => {
            const result = getAvailableDeployables('adobe-commerce-paas', 'eds-storefront');
            const ids = result.map(d => d.id);
            expect(ids).toContain('commerce-paas-mesh');
            expect(ids).not.toContain('commerce-eds-mesh');
        });

        it('returns the ACCS mesh for an EDS + ACCS selection', () => {
            const result = getAvailableDeployables('adobe-commerce-accs', 'eds-storefront');
            const ids = result.map(d => d.id);
            expect(ids).toContain('commerce-eds-mesh');
            expect(ids).not.toContain('commerce-paas-mesh');
        });

        it('returns the headless mesh for a headless frontend (either backend)', () => {
            const paas = getAvailableDeployables('adobe-commerce-paas', 'headless').map(d => d.id);
            const accs = getAvailableDeployables('adobe-commerce-accs', 'headless').map(d => d.id);
            expect(paas).toContain('headless-commerce-mesh');
            expect(accs).toContain('headless-commerce-mesh');
        });

        it('returns [] for an unmatched backend/frontend combo', () => {
            expect(getAvailableDeployables('unknown-backend', 'unknown-frontend')).toEqual([]);
        });
    });

    describe('getDeployableEntry', () => {
        it('resolves a seeded entry by id', () => {
            const entry = getDeployableEntry('commerce-paas-mesh');
            expect(entry).toBeDefined();
            expect(entry?.kind).toBe('mesh');
        });

        it('returns undefined for an unknown id', () => {
            expect(getDeployableEntry('nope')).toBeUndefined();
        });
    });

    describe('getDeployableSource', () => {
        it('returns the {owner, repo, branch} source for a seeded entry', () => {
            const source = getDeployableSource('commerce-paas-mesh');
            expect(source).toEqual(
                expect.objectContaining({ owner: 'skukla', repo: 'commerce-paas-mesh' }),
            );
        });

        it('returns undefined for an unknown id', () => {
            expect(getDeployableSource('nope')).toBeUndefined();
        });
    });

    describe('getDeployableEnvSchema', () => {
        it('returns the env schema array for a seeded entry', () => {
            const schema = getDeployableEnvSchema('commerce-paas-mesh');
            expect(Array.isArray(schema)).toBe(true);
        });

        it('returns [] for an unknown id', () => {
            expect(getDeployableEnvSchema('nope')).toEqual([]);
        });
    });

    describe('getDeployableName', () => {
        it('returns the display name, falling back to id', () => {
            expect(getDeployableName('commerce-paas-mesh')).toBeTruthy();
            expect(getDeployableName('unknown-xyz')).toBe('unknown-xyz');
        });
    });

    describe('seed catalog ↔ schema validity', () => {
        const catalog = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'deployables.json'), 'utf-8'),
        );
        const schema = JSON.parse(
            fs.readFileSync(path.join(CONFIG_DIR, 'deployables.schema.json'), 'utf-8'),
        );

        it('declares the schema reference and a version', () => {
            expect(catalog.$schema).toBeDefined();
            expect(typeof catalog.version).toBe('string');
            expect(Array.isArray(catalog.deployables)).toBe(true);
        });

        it('every entry has the schema-required fields with valid kind', () => {
            const required: string[] = schema.definitions.deployable.required;
            for (const entry of catalog.deployables) {
                for (const field of required) {
                    expect(entry[field]).toBeDefined();
                }
                expect(['mesh', 'integration']).toContain(entry.kind);
            }
        });

        it('every env-schema item has {name, type} with type ∈ {text, secret}', () => {
            for (const entry of catalog.deployables) {
                for (const envVar of entry.envSchema ?? []) {
                    expect(typeof envVar.name).toBe('string');
                    expect(['text', 'secret']).toContain(envVar.type);
                }
            }
        });

        it('seeds exactly the three meshes with the spike-mapped sources', () => {
            const byId = Object.fromEntries(
                catalog.deployables.map((d: { id: string }) => [d.id, d]),
            );
            expect(byId['commerce-paas-mesh'].source.repo).toBe('commerce-paas-mesh');
            expect(byId['commerce-eds-mesh'].source.repo).toBe('commerce-eds-mesh');
            expect(byId['headless-commerce-mesh'].source.repo).toBe('headless-commerce-mesh');
        });
    });

    describe('load-bearing mesh API + env contracts (steps 04 + 07)', () => {
        it('every mesh entry requires GraphQLServiceSDK and provides MESH_ENDPOINT', () => {
            for (const id of ['commerce-paas-mesh', 'commerce-eds-mesh', 'headless-commerce-mesh']) {
                const entry = getDeployableEntry(id);
                expect(entry?.requiredApis).toContain('GraphQLServiceSDK');
                expect(entry?.providesEnvVars).toContain('MESH_ENDPOINT');
            }
        });
    });
});
