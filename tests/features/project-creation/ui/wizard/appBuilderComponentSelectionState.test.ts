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
    computeSelectedAppBuilderComponents,
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

describe('computeSelectedAppBuilderComponents (required auto-included)', () => {
    const requiredIds = ['req-mesh'];

    it('always includes required ids even when the user never toggled them', () => {
        const result = computeSelectedAppBuilderComponents([], requiredIds);
        expect(result).toContain('req-mesh');
    });

    it('keeps user-toggled optional ids alongside required ids', () => {
        const result = computeSelectedAppBuilderComponents(['opt-1'], requiredIds);
        expect(result).toEqual(expect.arrayContaining(['req-mesh', 'opt-1']));
    });

    it('does not duplicate an id that is both selected and required', () => {
        const result = computeSelectedAppBuilderComponents(['req-mesh', 'opt-1'], requiredIds);
        expect(result.filter(id => id === 'req-mesh')).toHaveLength(1);
    });

    it('toggling an optional off leaves required + other optionals', () => {
        const afterToggle = withSelectedAppBuilderComponent(['opt-1', 'opt-2'], 'opt-1', false);
        const result = computeSelectedAppBuilderComponents(afterToggle, requiredIds);
        expect(result).toEqual(expect.arrayContaining(['req-mesh', 'opt-2']));
        expect(result).not.toContain('opt-1');
    });
});

describe('meshAppBuilderComponentToComponentIds (mesh dual-flow backward-compat)', () => {
    it('maps each seeded mesh catalog id to its mesh component id(s)', () => {
        expect(meshAppBuilderComponentToComponentIds('commerce-paas-mesh')).toContain('eds-commerce-mesh');
        expect(meshAppBuilderComponentToComponentIds('commerce-eds-mesh')).toContain('eds-accs-mesh');
        expect(meshAppBuilderComponentToComponentIds('headless-commerce-mesh')).toContain(
            'headless-commerce-mesh',
        );
    });

    it('returns [] for a non-mesh appBuilderComponent id', () => {
        expect(meshAppBuilderComponentToComponentIds('some-integration')).toEqual([]);
    });

    it('round-trips: a selected mesh appBuilderComponent drives hasMeshInDependencies', () => {
        // Selecting the PaaS mesh appBuilderComponent must map to a mesh component id so
        // the existing Adobe-I/O step-filter (hasMeshInDependencies) still fires.
        const selected = withSelectedAppBuilderComponent([], 'commerce-paas-mesh', true);
        const componentIds = selected.flatMap(meshAppBuilderComponentToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(true);
    });

    it('round-trips negatively: no mesh appBuilderComponent selected → no mesh in deps', () => {
        const selected = withSelectedAppBuilderComponent([], 'some-integration', true);
        const componentIds = selected.flatMap(meshAppBuilderComponentToComponentIds);
        expect(hasMeshInDependencies(componentIds)).toBe(false);
    });
});
