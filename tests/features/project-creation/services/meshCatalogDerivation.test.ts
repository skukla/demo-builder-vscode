/**
 * Mesh Catalog Derivation Tests
 *
 * Mesh catalog entries are DERIVED from stacks.json (which mesh a frontend+backend
 * pair uses) and components.json (that mesh's name, repo, git ref, env contract) —
 * never hand-authored. These tests pin the derivation against the defect it
 * replaces: three hand-authored rows whose `source.repo` was filled in to match
 * each row's own id string rather than the registry component it stood for, so
 * both EDS rows cloned the wrong repository.
 */

import stacksConfig from '@/features/project-creation/config/stacks.json';
import componentsConfig from '@/features/components/config/components.json';
import { deriveMeshCatalogEntries } from '@/features/project-creation/services/meshCatalogDerivation';

/** The registry is the authority on which repo a mesh id lives in. */
const REGISTRY_MESH = (componentsConfig as { mesh: Record<string, { source: { url: string } }> })
    .mesh;

describe('deriveMeshCatalogEntries', () => {
    const entries = deriveMeshCatalogEntries();
    const byId = new Map(entries.map((e) => [e.id, e]));

    it('derives one entry per registry mesh reachable from a stack', () => {
        expect([...byId.keys()].sort()).toEqual([
            'eds-accs-mesh',
            'eds-commerce-mesh',
            'headless-commerce-mesh',
        ]);
    });

    it('every entry is kind "mesh"', () => {
        expect(entries.every((e) => e.kind === 'mesh')).toBe(true);
    });

    // THE regression guard. Each derived source must name the repo the REGISTRY
    // points at — not a repo whose name happens to match the catalog id. The
    // deleted rows failed exactly here: `commerce-eds-mesh` (the EDS+ACCS row)
    // cloned skukla/commerce-eds-mesh, the PaaS mesh, instead of eds-accs-mesh.
    it.each([
        ['eds-commerce-mesh', 'commerce-eds-mesh'],
        ['eds-accs-mesh', 'eds-accs-mesh'],
        ['headless-commerce-mesh', 'headless-commerce-mesh'],
    ])('%s clones the repo the registry names (%s)', (id, expectedRepo) => {
        expect(byId.get(id)?.source).toEqual(
            expect.objectContaining({ owner: 'skukla', repo: expectedRepo })
        );
        // …and that repo is literally the one in the registry's git url.
        expect(REGISTRY_MESH[id].source.url).toContain(`/${expectedRepo}`);
    });

    it('pins the registry git ref (tag "stable"), not a floating branch', () => {
        for (const entry of entries) {
            expect(entry.source.branch).toBe('stable');
        }
    });

    describe('compatibility axes come from the stacks that reference the mesh', () => {
        it.each([
            ['eds-commerce-mesh', ['eds-storefront'], ['adobe-commerce-paas']],
            ['eds-accs-mesh', ['eds-storefront'], ['adobe-commerce-accs']],
            [
                'headless-commerce-mesh',
                ['headless'],
                ['adobe-commerce-paas', 'adobe-commerce-accs'],
            ],
        ])('%s fits %s / %s', (id, frontends, backends) => {
            const entry = byId.get(id);
            expect(entry?.compatibleFrontends?.sort()).toEqual([...frontends].sort());
            expect(entry?.compatibleBackends?.sort()).toEqual([...backends].sort());
        });

        it('matches stacks.json rather than restating it', () => {
            // Derivation must agree with the config, not a copy of it: for every
            // stack that lists a mesh, that mesh must accept the stack's axes.
            for (const stack of stacksConfig.stacks) {
                for (const dep of stack.optionalDependencies ?? []) {
                    const entry = byId.get(dep);
                    if (!entry) continue;
                    expect(entry.compatibleFrontends).toContain(stack.frontend);
                    expect(entry.compatibleBackends).toContain(stack.backend);
                }
            }
        });
    });

    it('carries the registry providesEnvVars (MESH_ENDPOINT) for the wiring path', () => {
        for (const entry of entries) {
            expect(entry.providesEnvVars).toContain('MESH_ENDPOINT');
        }
    });

    it('declares the API Mesh subscription every mesh deploy needs', () => {
        for (const entry of entries) {
            expect(entry.requiredApis).toContain('GraphQLServiceSDK');
        }
    });

    // The deleted rows each declared a single `COMMERCE_ENDPOINT` env var that no
    // mesh repo reads — verified against all four .env.example and mesh.config.js
    // files. The real contract is the registry's requiredEnvVars, consumed by
    // generateComponentEnvFile. A derived entry must not resurrect the fiction.
    it('declares no envSchema — the registry owns the env contract', () => {
        for (const entry of entries) {
            expect(entry.envSchema ?? []).toEqual([]);
        }
    });

    it('does not derive commerce-paas-mesh (untagged spike, in no stack)', () => {
        expect(byId.has('commerce-paas-mesh')).toBe(false);
    });

    // The link that makes the .env write possible. `regenerateComponentEnvFile`
    // looks a component up in the registry BY THE ID it is given; the dashboard
    // gives it a derived catalog id. When those namespaces diverged, the lookup
    // found nothing — which is the second half of why a dashboard mesh add
    // deployed against no .env at all.
    describe('derived ids resolve in the registry that generates the .env', () => {
        const REGISTRY = componentsConfig as unknown as {
            mesh: Record<string, { configuration?: { requiredEnvVars?: string[] } }>;
        };

        it.each([['eds-commerce-mesh'], ['eds-accs-mesh'], ['headless-commerce-mesh']])(
            '%s is a registry mesh id with a non-empty env contract',
            (id) => {
                expect(REGISTRY.mesh[id]).toBeDefined();
                expect(REGISTRY.mesh[id].configuration?.requiredEnvVars?.length).toBeGreaterThan(0);
            }
        );

        it('every derived entry id is a registry mesh id', () => {
            for (const entry of entries) {
                expect(Object.keys(REGISTRY.mesh)).toContain(entry.id);
            }
        });
    });
});
