/**
 * Wizard AppBuilderComponent-Selection State Tests (D2 Track B — Step 02)
 *
 * The pure state helper that carries selected appBuilderComponents from the
 * picker (Step 03) through Review and into the created project.
 * selectedAppBuilderComponents is the single wizard-side authority for App
 * Builder selections, mesh included (D3): serialization derives the wire's
 * dependencies from the mesh-kind ids in it via isMeshComponentId.
 */

import { withSelectedAppBuilderComponent } from '@/features/project-creation/ui/wizard/appBuilderComponentSelectionState';
import { hasMeshInDependencies, isMeshComponentId } from '@/core/constants';

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
// it. Required-mesh auto-include ships through onStackSelect's mesh seeding,
// and required-mesh REMOVAL is refused by the toggle guard.
//
// meshAppBuilderComponentToComponentIds (the dual-flow bridge, latterly an
// identity check) was deleted with D3 — mesh catalog ids ARE registry
// component ids, so the selection drives the mesh gates directly:

describe('mesh selection drives the mesh gates directly (D3)', () => {
    it('a selected mesh appBuilderComponent drives hasMeshInDependencies', () => {
        const selected = withSelectedAppBuilderComponent([], 'eds-commerce-mesh', true);
        expect(hasMeshInDependencies(selected.filter(isMeshComponentId))).toBe(true);
    });

    it('no mesh appBuilderComponent selected → no mesh in derived deps', () => {
        const selected = withSelectedAppBuilderComponent([], 'some-integration', true);
        expect(hasMeshInDependencies(selected.filter(isMeshComponentId))).toBe(false);
    });

    it('a retired catalog id is not a mesh anywhere', () => {
        expect(isMeshComponentId('commerce-paas-mesh')).toBe(false);
    });
});
