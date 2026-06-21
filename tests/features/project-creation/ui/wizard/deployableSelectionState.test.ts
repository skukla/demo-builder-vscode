/**
 * Wizard Deployable-Selection State Tests (D2 Track B — Step 02)
 *
 * The pure state helpers that carry selected deployables from the picker
 * (Step 03) through Review and into the created project. Mirrors the existing
 * selectedOptionalDependencies array-of-ids pattern. Includes the mesh
 * backward-compat round-trip: selecting a mesh deployable must still drive
 * hasMeshInDependencies (the Adobe-I/O wizard step-filter lock).
 */

import {
    withSelectedDeployable,
    computeSelectedDeployables,
    meshDeployableToComponentIds,
} from '@/features/project-creation/ui/wizard/deployableSelectionState';
import { hasMeshInDependencies } from '@/core/constants';

describe('withSelectedDeployable', () => {
    it('adds an id immutably when selected', () => {
        const before = ['a'];
        const after = withSelectedDeployable(before, 'b', true);
        expect(after).toEqual(['a', 'b']);
        expect(before).toEqual(['a']); // input not mutated
    });

    it('removes only the toggled id when deselected', () => {
        const after = withSelectedDeployable(['a', 'b', 'c'], 'b', false);
        expect(after).toEqual(['a', 'c']);
    });

    it('does not duplicate an already-present id when selected again', () => {
        const after = withSelectedDeployable(['a', 'b'], 'b', true);
        expect(after).toEqual(['a', 'b']);
    });

    it('handles an undefined current selection (module-level stable default)', () => {
        const after = withSelectedDeployable(undefined, 'a', true);
        expect(after).toEqual(['a']);
    });

    it('returns an empty array (not undefined) when removing the last id', () => {
        const after = withSelectedDeployable(['a'], 'a', false);
        expect(after).toEqual([]);
    });
});

describe('computeSelectedDeployables (required auto-included)', () => {
    const requiredIds = ['req-mesh'];

    it('always includes required ids even when the user never toggled them', () => {
        const result = computeSelectedDeployables([], requiredIds);
        expect(result).toContain('req-mesh');
    });

    it('keeps user-toggled optional ids alongside required ids', () => {
        const result = computeSelectedDeployables(['opt-1'], requiredIds);
        expect(result).toEqual(expect.arrayContaining(['req-mesh', 'opt-1']));
    });

    it('does not duplicate an id that is both selected and required', () => {
        const result = computeSelectedDeployables(['req-mesh', 'opt-1'], requiredIds);
        expect(result.filter(id => id === 'req-mesh')).toHaveLength(1);
    });

    it('toggling an optional off leaves required + other optionals', () => {
        const afterToggle = withSelectedDeployable(['opt-1', 'opt-2'], 'opt-1', false);
        const result = computeSelectedDeployables(afterToggle, requiredIds);
        expect(result).toEqual(expect.arrayContaining(['req-mesh', 'opt-2']));
        expect(result).not.toContain('opt-1');
    });
});

describe('meshDeployableToComponentIds (mesh dual-flow backward-compat)', () => {
    it('maps each seeded mesh catalog id to its mesh component id(s)', () => {
        expect(meshDeployableToComponentIds('commerce-paas-mesh')).toContain('eds-commerce-mesh');
        expect(meshDeployableToComponentIds('commerce-eds-mesh')).toContain('eds-accs-mesh');
        expect(meshDeployableToComponentIds('headless-commerce-mesh')).toContain(
            'headless-commerce-mesh',
        );
    });

    it('returns [] for a non-mesh deployable id', () => {
        expect(meshDeployableToComponentIds('some-integration')).toEqual([]);
    });

    it('round-trips: a selected mesh deployable drives hasMeshInDependencies', () => {
        // Selecting the PaaS mesh deployable must map to a mesh component id so
        // the existing Adobe-I/O step-filter (hasMeshInDependencies) still fires.
        const selected = withSelectedDeployable([], 'commerce-paas-mesh', true);
        const componentIds = selected.flatMap(meshDeployableToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(true);
    });

    it('round-trips negatively: no mesh deployable selected → no mesh in deps', () => {
        const selected = withSelectedDeployable([], 'some-integration', true);
        const componentIds = selected.flatMap(meshDeployableToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(false);
    });
});
