/**
 * projectRequiresAppBuilder predicate tests.
 *
 * The predicate is the single source of truth for "does this demo include
 * any App Builder components?" Callers use it to gate Developer-role checks
 * — so the cases it can get wrong are load-bearing for the dev-permission
 * UX.
 */

import { projectRequiresAppBuilder } from '@/features/components/services/projectAppBuilderPredicate';
import type { Project, ComponentInstance } from '@/types/base';
import type { ComponentRegistry, TransformedComponentDefinition } from '@/types/components';

function makeDefinition(id: string): TransformedComponentDefinition {
    return { id, name: id } as TransformedComponentDefinition;
}

function makeRegistry(opts: {
    mesh?: string[];
    appBuilder?: string[];
} = {}): ComponentRegistry {
    return {
        version: 'test',
        components: {
            frontends: [makeDefinition('eds-storefront')],
            backends: [makeDefinition('adobe-commerce-paas')],
            dependencies: [],
            mesh: (opts.mesh ?? ['eds-commerce-mesh', 'eds-accs-mesh', 'headless-commerce-mesh']).map(makeDefinition),
            appBuilder: (opts.appBuilder ?? []).map(makeDefinition),
            integrations: [],
        },
    };
}

function makeInstance(id: string): ComponentInstance {
    return { id, name: id, status: 'ready', path: `/path/${id}` } as unknown as ComponentInstance;
}

function makeProject(componentIds: string[]): Project {
    const componentInstances: Record<string, ComponentInstance> = {};
    for (const id of componentIds) componentInstances[id] = makeInstance(id);
    return {
        name: 'test',
        created: new Date(),
        lastModified: new Date(),
        path: '/test',
        status: 'ready',
        componentInstances,
    } as unknown as Project;
}

describe('projectRequiresAppBuilder', () => {
    it('returns false when project is null', () => {
        expect(projectRequiresAppBuilder(null, makeRegistry())).toBe(false);
    });

    it('returns false when project has no componentInstances', () => {
        const project = { name: 't', status: 'ready' } as unknown as Project;
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(false);
    });

    it('returns false for a storefront-only project (no mesh, no app builder)', () => {
        const project = makeProject(['eds-storefront', 'adobe-commerce-paas']);
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(false);
    });

    it('returns true when project includes an EDS Commerce mesh', () => {
        const project = makeProject(['eds-storefront', 'adobe-commerce-paas', 'eds-commerce-mesh']);
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(true);
    });

    it('returns true when project includes an EDS ACCS mesh', () => {
        const project = makeProject(['eds-storefront', 'adobe-commerce-accs', 'eds-accs-mesh']);
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(true);
    });

    it('returns true when project includes a headless commerce mesh', () => {
        const project = makeProject(['headless', 'adobe-commerce-paas', 'headless-commerce-mesh']);
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(true);
    });

    it('returns false when a non-App-Builder component happens to share a name fragment with one', () => {
        // The match is by exact ID, not by substring. Guards against future
        // components named "mesh-config" or similar that aren't App Builder.
        const project = makeProject(['eds-storefront', 'mesh-config-display']);
        expect(projectRequiresAppBuilder(project, makeRegistry())).toBe(false);
    });

    it('returns true when project includes an app-builder component (appBuilder set)', () => {
        const project = makeProject(['eds-storefront', 'custom-app']);
        const registry = makeRegistry({ appBuilder: ['custom-app'] });
        expect(projectRequiresAppBuilder(project, registry)).toBe(true);
    });

    it('returns true for a mesh-only project even when appBuilder set is non-empty', () => {
        const project = makeProject(['eds-storefront', 'eds-commerce-mesh']);
        const registry = makeRegistry({ appBuilder: ['custom-app'] });
        expect(projectRequiresAppBuilder(project, registry)).toBe(true);
    });

    it('returns false for a storefront-only project even when appBuilder set is non-empty', () => {
        const project = makeProject(['eds-storefront', 'adobe-commerce-paas']);
        const registry = makeRegistry({ appBuilder: ['custom-app'] });
        expect(projectRequiresAppBuilder(project, registry)).toBe(false);
    });

    it('handles a registry where appBuilder is undefined', () => {
        const project = makeProject(['eds-storefront', 'eds-commerce-mesh']);
        const registry: ComponentRegistry = {
            version: 'test',
            components: {
                frontends: [],
                backends: [],
                dependencies: [],
                mesh: [makeDefinition('eds-commerce-mesh')],
                // appBuilder intentionally omitted
            },
        };
        expect(projectRequiresAppBuilder(project, registry)).toBe(true);
    });

    it('returns false when registry has empty mesh section', () => {
        const project = makeProject(['eds-storefront', 'eds-commerce-mesh']);
        const emptyRegistry = makeRegistry({ mesh: [] });
        expect(projectRequiresAppBuilder(project, emptyRegistry)).toBe(false);
    });

    it('handles a registry where mesh is undefined', () => {
        const project = makeProject(['eds-storefront']);
        const registry: ComponentRegistry = {
            version: 'test',
            components: {
                frontends: [],
                backends: [],
                dependencies: [],
                // mesh intentionally omitted
            },
        };
        expect(projectRequiresAppBuilder(project, registry)).toBe(false);
    });
});
