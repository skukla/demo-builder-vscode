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

import stacksConfig from '@/features/components/config/stacks.json';
import componentsConfig from '@/features/components/config/components.json';
import { deriveMeshCatalogEntries } from '@/features/components/services/meshCatalogDerivation';

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

// ---------------------------------------------------------------------------
// The derivation against configs the shipped ones do not contain.
//
// Every branch below is a rule about a config we could WRITE, not one we ship:
// a registry mesh with no source, a non-GitHub url, a mesh with no pinned ref, a
// stack listing an id the registry does not define. The shipped pair is uniform
// enough that none of these are reachable through it, and the rules exist so that
// editing either file cannot produce a catalog entry that clones nothing.
//
// Re-imports the module inside `jest.isolateModules` because both configs are
// read ONCE at module load, so a mocked config only lands on a fresh instance.
// ---------------------------------------------------------------------------
describe('deriveMeshCatalogEntries — against synthetic configs', () => {
    type Stack = {
        frontend?: string;
        backend?: string;
        dependencies?: string[];
        optionalDependencies?: string[];
    };
    type Mesh = {
        name: string;
        description?: string;
        source?: { url?: string; gitOptions?: { tag?: string; branch?: string } };
        configuration?: { providesEnvVars?: string[] };
    };

    /** Derive from the given configs instead of the shipped ones. */
    function deriveWith(stacks: Stack[], mesh: Record<string, Mesh>) {
        let derived: ReturnType<typeof deriveMeshCatalogEntries> = [];
        jest.isolateModules(() => {
            jest.doMock('@/features/components/config/stacks.json', () => ({ stacks }));
            jest.doMock('@/features/components/config/components.json', () => ({ mesh }));
            derived = (require('@/features/components/services/meshCatalogDerivation') as {
                deriveMeshCatalogEntries: typeof deriveMeshCatalogEntries;
            }).deriveMeshCatalogEntries();
        });
        return derived;
    }

    const EDS_STACK: Stack = {
        frontend: 'eds-storefront',
        backend: 'adobe-commerce-paas',
        optionalDependencies: ['a-mesh'],
    };
    const GITHUB_MESH: Mesh = {
        name: 'A Mesh',
        description: 'A described mesh',
        source: { url: 'https://github.com/acme/a-mesh', gitOptions: { tag: 'stable' } },
        configuration: { providesEnvVars: ['MESH_ENDPOINT'] },
    };

    afterEach(() => {
        jest.dontMock('@/features/components/config/stacks.json');
        jest.dontMock('@/features/components/config/components.json');
    });

    it('derives the entry when the config pair is well formed (the control)', () => {
        const derived = deriveWith([EDS_STACK], { 'a-mesh': GITHUB_MESH });

        expect(derived.map((e) => e.id)).toEqual(['a-mesh']);
        expect(derived[0].source).toEqual({ owner: 'acme', repo: 'a-mesh', branch: 'stable' });
        // The registry's own description, not the name standing in for it.
        expect(derived[0].description).toBe('A described mesh');
    });

    // A mesh offered by a stack that carries it as a REQUIRED dependency is
    // derived just the same. Both lists are read; today every shipped stack keeps
    // its mesh in `optionalDependencies`, so only this proves the other half runs.
    it('reads required dependencies as well as optional ones', () => {
        const derived = deriveWith(
            [{ frontend: 'headless', backend: 'adobe-commerce-paas', dependencies: ['a-mesh'] }],
            { 'a-mesh': GITHUB_MESH }
        );

        expect(derived.map((e) => e.id)).toEqual(['a-mesh']);
    });

    // Reachability through stacks.json is the definition of "the extension ships
    // this mesh" — and the reverse: a stack naming an id the registry does not
    // define derives nothing rather than a half-built entry.
    it('skips a stack dependency that is not a registry mesh', () => {
        const derived = deriveWith(
            [{ ...EDS_STACK, optionalDependencies: ['a-mesh', 'not-a-mesh'] }],
            { 'a-mesh': GITHUB_MESH }
        );

        expect(derived.map((e) => e.id)).toEqual(['a-mesh']);
    });

    it('does not derive a registry mesh no stack offers', () => {
        const derived = deriveWith([EDS_STACK], {
            'a-mesh': GITHUB_MESH,
            'unused-mesh': GITHUB_MESH,
        });

        expect(derived.map((e) => e.id)).toEqual(['a-mesh']);
    });

    // Nothing is derived without a clone source: an entry with no repo would put
    // a card in the Add picker that fails the moment it is used.
    it.each([
        ['no source at all', { name: 'B' } as Mesh],
        ['a source with no url', { name: 'B', source: {} } as Mesh],
        [
            'a url that is not GitHub',
            { name: 'B', source: { url: 'https://gitlab.com/acme/b-mesh' } } as Mesh,
        ],
    ])('does not derive a mesh with %s', (_label, mesh) => {
        const derived = deriveWith([{ ...EDS_STACK, optionalDependencies: ['b-mesh'] }], {
            'b-mesh': mesh,
        });

        expect(derived).toStrictEqual([]);
    });

    describe('the git ref a derived entry clones', () => {
        function branchOf(gitOptions: { tag?: string; branch?: string } | undefined) {
            const derived = deriveWith([EDS_STACK], {
                'a-mesh': { name: 'A', source: { url: 'https://github.com/acme/a-mesh', gitOptions } },
            });
            return derived[0]?.source.branch;
        }

        it('prefers the pinned tag over a branch', () => {
            expect(branchOf({ tag: 'stable', branch: 'main' })).toBe('stable');
        });

        it('takes the branch when there is no tag', () => {
            expect(branchOf({ branch: 'develop' })).toBe('develop');
        });

        it('falls back to main when the registry pins neither', () => {
            expect(branchOf({})).toBe('main');
            expect(branchOf(undefined)).toBe('main');
        });
    });

    describe('the compatibility axes', () => {
        it('unions the axes of every stack offering the same mesh', () => {
            const derived = deriveWith(
                [
                    EDS_STACK,
                    {
                        frontend: 'headless',
                        backend: 'adobe-commerce-accs',
                        optionalDependencies: ['a-mesh'],
                    },
                ],
                { 'a-mesh': GITHUB_MESH }
            );

            expect(derived[0].compatibleFrontends?.sort()).toEqual(['eds-storefront', 'headless']);
            expect(derived[0].compatibleBackends?.sort()).toEqual([
                'adobe-commerce-accs',
                'adobe-commerce-paas',
            ]);
        });

        // A stack that names no frontend contributes no frontend. Adding one
        // anyway puts an `undefined` in the list the Add picker filters on, which
        // matches nothing and reads as a compatible axis that does not exist.
        it('contributes nothing for an axis the stack leaves out', () => {
            const derived = deriveWith([{ optionalDependencies: ['a-mesh'] }], {
                'a-mesh': GITHUB_MESH,
            });

            expect(derived[0].compatibleFrontends).toStrictEqual([]);
            expect(derived[0].compatibleBackends).toStrictEqual([]);
        });
    });

    it('falls back to the name when the registry gives no description', () => {
        const derived = deriveWith([EDS_STACK], {
            'a-mesh': { ...GITHUB_MESH, description: undefined },
        });

        expect(derived[0].description).toBe('A Mesh');
    });

    it('provides nothing when the registry declares no env contract', () => {
        const derived = deriveWith([EDS_STACK], {
            'a-mesh': { name: 'A', source: { url: 'https://github.com/acme/a-mesh' } },
        });

        expect(derived[0].providesEnvVars).toStrictEqual([]);
    });
});
