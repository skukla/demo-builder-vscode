/**
 * `componentSelections` must not disagree with what is actually installed.
 *
 * The live dashboard add path is `appBuilderComponentRunner.addAppBuilderComponent`,
 * and it never wrote `componentSelections` at all. The only code that maintained
 * those lists lived in a parallel add/remove service from the singular model
 * with ZERO callers, deleted alongside this fix. So every mesh and every
 * integration added from the dashboard left the selections empty.
 *
 * Found on `demo-builder-test` (2026-08-10): a deployed mesh and a deployed
 * `order-sync` integration, with `dependencies: []` and `appBuilder: []`.
 *
 * The visible symptom was a missing "API Mesh" section in Configure, whose rail is
 * built purely from selections. The SERIOUS one is `projectResetService`, which
 * rebuilds the component list from those same lists — its own comment says reset
 * re-clones a dashboard-added app "instead of dropping it", and dropping it is
 * exactly what an empty list makes it do.
 *
 * ADDITIVE ONLY. "Installed implies selected" is sound; the converse is not — a
 * mesh selected in the wizard but not yet installed is a legitimate mid-creation
 * state (`my-commerce-demo` is sitting in it), and removal already expresses
 * itself by deleting the instance and the keyed entry.
 */

import { reconcileComponentSelections } from '@/core/state/componentSelectionReconcile';
import type { Project } from '@/types/base';

function project(overrides: Partial<Project> = {}): Project {
    return {
        name: 'p',
        path: '/p',
        componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' },
        ...overrides,
    } as Project;
}

const MESH_INSTANCE = {
    'eds-accs-mesh': {
        id: 'eds-accs-mesh',
        name: 'API Mesh',
        subType: 'mesh',
        path: '/p/components/eds-accs-mesh',
        status: 'deployed',
    },
} as unknown as Project['componentInstances'];

describe('reconcileComponentSelections — an installed mesh is a selected mesh', () => {
    it('adds an installed mesh missing from dependencies', () => {
        const p = project({ componentInstances: MESH_INSTANCE });

        expect(reconcileComponentSelections(p)).toBe(true);
        expect(p.componentSelections?.dependencies).toEqual(['eds-accs-mesh']);
    });

    it('leaves an already-correct selection alone and reports no change', () => {
        const p = project({
            componentInstances: MESH_INSTANCE,
            componentSelections: { dependencies: ['eds-accs-mesh'] },
        });

        expect(reconcileComponentSelections(p)).toBe(false);
        expect(p.componentSelections?.dependencies).toEqual(['eds-accs-mesh']);
    });

    it('preserves the other stack dependencies alongside it', () => {
        const p = project({
            componentInstances: MESH_INSTANCE,
            componentSelections: { dependencies: ['some-other-dep'] },
        });

        reconcileComponentSelections(p);

        expect(p.componentSelections?.dependencies).toEqual(['some-other-dep', 'eds-accs-mesh']);
    });

    it('does NOT remove a mesh selected but not yet installed', () => {
        // `my-commerce-demo` is in exactly this state: chosen in the wizard, never
        // installed. Additive-only is what keeps mid-creation intact.
        const p = project({ componentSelections: { dependencies: ['eds-accs-mesh'] } });

        expect(reconcileComponentSelections(p)).toBe(false);
        expect(p.componentSelections?.dependencies).toEqual(['eds-accs-mesh']);
    });
});

describe('reconcileComponentSelections — a deployed integration is a selected one', () => {
    const withIntegration = {
        'order-sync': {
            kind: 'integration',
            status: 'deployed',
            source: { owner: 'skukla', repo: 'order-sync' },
        },
    } as unknown as Project['appBuilderComponents'];

    it('adds a keyed integration missing from appBuilder', () => {
        const p = project({ appBuilderComponents: withIntegration });

        expect(reconcileComponentSelections(p)).toBe(true);
        expect(p.componentSelections?.appBuilder).toEqual(['order-sync']);
    });

    it('never lists a MESH entry under appBuilder', () => {
        // The persisted mesh rides `dependencies`; putting it in `appBuilder`
        // too would make reset clone it twice.
        const p = project({
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
            } as unknown as Project['appBuilderComponents'],
        });

        reconcileComponentSelections(p);

        expect(p.componentSelections?.appBuilder ?? []).toEqual([]);
    });
});

describe('reconcileComponentSelections — the live demo-builder-test shape', () => {
    it('restores both lists in one pass', () => {
        const p = project({
            componentSelections: {
                frontend: 'eds-storefront',
                backend: 'adobe-commerce-accs',
                dependencies: [],
                integrations: [],
                appBuilder: [],
            },
            componentInstances: {
                ...MESH_INSTANCE,
                'order-sync': {
                    id: 'order-sync',
                    name: 'Order Sync',
                    path: '/p/components/order-sync',
                    status: 'deployed',
                },
            } as unknown as Project['componentInstances'],
            appBuilderComponents: {
                'eds-accs-mesh': {
                    kind: 'mesh',
                    status: 'deployed',
                    source: { owner: '', repo: '' },
                },
                'order-sync': {
                    kind: 'integration',
                    status: 'deployed',
                    source: { owner: 'skukla', repo: 'order-sync' },
                },
            } as unknown as Project['appBuilderComponents'],
        });

        expect(reconcileComponentSelections(p)).toBe(true);
        expect(p.componentSelections?.dependencies).toEqual(['eds-accs-mesh']);
        expect(p.componentSelections?.appBuilder).toEqual(['order-sync']);
        // Untouched.
        expect(p.componentSelections?.backend).toBe('adobe-commerce-accs');
    });

    it('is a no-op on a project with nothing installed', () => {
        const p = project();

        expect(reconcileComponentSelections(p)).toBe(false);
    });
});
