/**
 * Wizard AppBuilderComponent-Selection State Tests (D2 Track B — Step 02)
 *
 * The pure state helpers that carry selected appBuilderComponents from the picker
 * (Step 03) through Review and into the created project. Mirrors the existing
 * selectedOptionalDependencies array-of-ids pattern. Includes the mesh
 * backward-compat round-trip: selecting a mesh appBuilderComponent must still drive
 * hasMeshInDependencies (the Adobe-I/O wizard step-filter lock).
 */

import {
    withSelectedAppBuilderComponent,
    meshAppBuilderComponentToComponentIds,
} from '@/features/project-creation/ui/wizard/appBuilderComponentSelectionState';
import { hasMeshInDependencies } from '@/core/constants';

describe('withSelectedAppBuilderComponent', () => {
    it('adds an id immutably when selected', () => {
        const before = ['a'];
        const after = withSelectedAppBuilderComponent(before, 'b', true);
        expect(after).toEqual(['a', 'b']);
        expect(before).toEqual(['a']); // input not mutated
    });

    it('removes only the toggled id when deselected', () => {
        const after = withSelectedAppBuilderComponent(['a', 'b', 'c'], 'b', false);
        expect(after).toEqual(['a', 'c']);
    });

    it('does not duplicate an already-present id when selected again', () => {
        const after = withSelectedAppBuilderComponent(['a', 'b'], 'b', true);
        expect(after).toEqual(['a', 'b']);
    });

    it('handles an undefined current selection (module-level stable default)', () => {
        const after = withSelectedAppBuilderComponent(undefined, 'a', true);
        expect(after).toEqual(['a']);
    });

    it('returns an empty array (not undefined) when removing the last id', () => {
        const after = withSelectedAppBuilderComponent(['a'], 'a', false);
        expect(after).toEqual([]);
    });
});

// computeSelectedAppBuilderComponents (required union) was deleted 2026-08-23:
// its only reference in the whole tree was this suite — no production caller
// ever existed, even the orphaned AppBuilderComponentsStepContent never used
// it. Required-mesh auto-include ships through onStackSelect's dependency
// seeding, and required-mesh REMOVAL is refused by the toggle guard.

describe('meshAppBuilderComponentToComponentIds (mesh dual-flow backward-compat)', () => {
    // Mesh catalog entries are derived from the registry now, so a mesh
    // appBuilderComponent id IS its component id — this is an identity check
    // rather than the translation table it replaced. The table was correct,
    // which is how the mismatched source.repo beside it survived unnoticed.
    it('maps each mesh id to itself', () => {
        expect(meshAppBuilderComponentToComponentIds('eds-commerce-mesh')).toEqual([
            'eds-commerce-mesh',
        ]);
        expect(meshAppBuilderComponentToComponentIds('eds-accs-mesh')).toEqual(['eds-accs-mesh']);
        expect(meshAppBuilderComponentToComponentIds('headless-commerce-mesh')).toEqual([
            'headless-commerce-mesh',
        ]);
    });

    it('returns [] for a non-mesh appBuilderComponent id', () => {
        expect(meshAppBuilderComponentToComponentIds('some-integration')).toEqual([]);
    });

    it('returns [] for a retired catalog id (no longer a mesh anywhere)', () => {
        expect(meshAppBuilderComponentToComponentIds('commerce-paas-mesh')).toEqual([]);
    });

    it('round-trips: a selected mesh appBuilderComponent drives hasMeshInDependencies', () => {
        // Selecting a mesh appBuilderComponent must yield a mesh component id so
        // the existing Adobe-I/O step-filter (hasMeshInDependencies) still fires.
        const selected = withSelectedAppBuilderComponent([], 'eds-commerce-mesh', true);
        const componentIds = selected.flatMap(meshAppBuilderComponentToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(true);
    });

    it('round-trips negatively: no mesh appBuilderComponent selected → no mesh in deps', () => {
        const selected = withSelectedAppBuilderComponent([], 'some-integration', true);
        const componentIds = selected.flatMap(meshAppBuilderComponentToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(false);
    });
});
