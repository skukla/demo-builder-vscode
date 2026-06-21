/**
 * AppBuilderComponent Selection Model Tests (D2 Track B — Step 01)
 *
 * Pure selection backbone shared by the wizard picker (Step 03), Configure
 * (Step 04), and the dashboard list (Step 05). Turns the axis-filtered catalog
 * into a required/optional list, generalizing today's mesh `requiresMesh` toggle
 * to any appBuilderComponent and mirroring block-libraries' nativeForPackages /
 * onlyForPackages scoping. No UI, no I/O.
 *
 * The axis + mesh-requirement tests run against the REAL seed catalog (proving
 * the generalization round-trips on the shipped meshes). The package-scoping
 * tests mock the catalog loader so they can exercise nativeForPackages /
 * onlyForPackages without coupling the seed app-builder-components.json to packages.
 */

import { getSelectableAppBuilderComponents } from '@/features/project-creation/services/appBuilderComponentSelection';
import * as catalogLoader from '@/features/project-creation/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { DemoPackage, GitSource } from '@/types/demoPackages';

// getAvailableAppBuilderComponents is mockable per-test (scoping tests override it). The
// default delegates to the REAL loader so the axis + mesh-requirement tests run
// against the shipped seed catalog.
jest.mock('@/features/project-creation/services/appBuilderComponentCatalogLoader', () => {
    const actual = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader',
    );
    return {
        ...actual,
        getAvailableAppBuilderComponents: jest.fn(actual.getAvailableAppBuilderComponents),
    };
});

// ---------------------------------------------------------------------------
// Fixtures — a minimal package; only the requirement-relevant fields matter.
// ---------------------------------------------------------------------------

const gitSource: GitSource = {
    type: 'git',
    url: 'https://github.com/test/repo',
    branch: 'main',
    gitOptions: { shallow: true },
};

/** Build a minimal DemoPackage with the fields the selection model reads. */
function makePackage(overrides: Partial<DemoPackage> = {}): DemoPackage {
    return {
        id: 'citisignal',
        name: 'CitiSignal',
        description: 'Test package',
        configDefaults: {},
        storefronts: {
            'eds-paas': {
                name: 'EDS PaaS',
                description: 'EDS on PaaS',
                source: gitSource,
            },
        },
        ...overrides,
    };
}

// EDS + PaaS → seeded catalog has the `commerce-paas-mesh` mesh entry.
const EDS_PAAS = { backend: 'adobe-commerce-paas', frontend: 'eds-storefront' };

describe('getSelectableAppBuilderComponents (real seed catalog)', () => {
    describe('axis filtering (delegates to getAvailableAppBuilderComponents)', () => {
        it('returns the catalog filtered by backend + frontend', () => {
            const result = getSelectableAppBuilderComponents(
                makePackage(),
                EDS_PAAS.backend,
                EDS_PAAS.frontend,
            );
            const ids = result.map(d => d.id);
            expect(ids).toContain('commerce-paas-mesh');
            expect(ids).not.toContain('commerce-eds-mesh');
            expect(ids).not.toContain('headless-commerce-mesh');
        });

        it('returns [] when no catalog entry matches the axis (Edge)', () => {
            const result = getSelectableAppBuilderComponents(
                makePackage(),
                'unknown-backend',
                'unknown-frontend',
            );
            expect(result).toEqual([]);
        });
    });

    describe('mesh requirement generalization (requiresMesh → requirement)', () => {
        it("annotates the mesh entry as 'optional' when the package requiresMesh:'optional'", () => {
            const result = getSelectableAppBuilderComponents(
                makePackage({ requiresMesh: 'optional' }),
                EDS_PAAS.backend,
                EDS_PAAS.frontend,
            );
            const mesh = result.find(d => d.id === 'commerce-paas-mesh');
            expect(mesh?.requirement).toBe('optional');
        });

        it("annotates the mesh entry as 'required' when the package requiresMesh:true", () => {
            const result = getSelectableAppBuilderComponents(
                makePackage({ requiresMesh: true }),
                EDS_PAAS.backend,
                EDS_PAAS.frontend,
            );
            const mesh = result.find(d => d.id === 'commerce-paas-mesh');
            expect(mesh?.requirement).toBe('required');
        });

        it("defaults the mesh entry to 'optional' when requiresMesh is undefined", () => {
            const result = getSelectableAppBuilderComponents(
                makePackage(),
                EDS_PAAS.backend,
                EDS_PAAS.frontend,
            );
            const mesh = result.find(d => d.id === 'commerce-paas-mesh');
            // No package requirement and no native scoping → user-toggleable.
            expect(mesh?.requirement).toBe('optional');
        });
    });
});

describe('getSelectableAppBuilderComponents (package scoping, mocked catalog)', () => {
    const nativeEntry: AppBuilderComponentCatalogEntry = {
        id: 'native-thing',
        name: 'Native Thing',
        description: 'Native to citisignal',
        kind: 'integration',
        source: { owner: 'o', repo: 'native-thing', branch: 'main' },
        nativeForPackages: ['citisignal'],
    };

    const restrictedEntry: AppBuilderComponentCatalogEntry = {
        id: 'buildright-only',
        name: 'BuildRight Only',
        description: 'Only for buildright',
        kind: 'integration',
        source: { owner: 'o', repo: 'buildright-only', branch: 'main' },
        onlyForPackages: ['buildright'],
    };

    const mockGetAvailable = catalogLoader.getAvailableAppBuilderComponents as jest.Mock;
    const realGetAvailable = jest.requireActual(
        '@/features/project-creation/services/appBuilderComponentCatalogLoader',
    ).getAvailableAppBuilderComponents;

    afterEach(() => {
        // Restore the real delegate so other describe blocks/tests are unaffected.
        mockGetAvailable.mockImplementation(realGetAvailable);
    });

    it("marks a nativeForPackages entry as 'required' for that package", () => {
        mockGetAvailable.mockReturnValue([nativeEntry]);

        const result = getSelectableAppBuilderComponents(makePackage({ id: 'citisignal' }), 'b', 'f');
        const entry = result.find(d => d.id === 'native-thing');
        expect(entry?.requirement).toBe('required');
    });

    it('excludes an entry restricted to OTHER packages via onlyForPackages', () => {
        mockGetAvailable.mockReturnValue([restrictedEntry]);

        const result = getSelectableAppBuilderComponents(makePackage({ id: 'citisignal' }), 'b', 'f');
        expect(result.map(d => d.id)).not.toContain('buildright-only');
    });

    it("includes an onlyForPackages entry for its OWN package (as 'optional')", () => {
        mockGetAvailable.mockReturnValue([restrictedEntry]);

        const result = getSelectableAppBuilderComponents(makePackage({ id: 'buildright' }), 'b', 'f');
        const entry = result.find(d => d.id === 'buildright-only');
        expect(entry?.requirement).toBe('optional');
    });
});
