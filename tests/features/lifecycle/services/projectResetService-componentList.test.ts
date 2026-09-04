/**
 * Project Reset Service - buildComponentList app-builder derivation (Part C)
 *
 * Reset must PRESERVE a dashboard-added app: the reset component list reads
 * `project.componentSelections.appBuilder` (mirroring the executor Step-4 change)
 * instead of deriving app-builder entries from `selectedAddons`. This makes reset
 * re-clone the app rather than drop it.
 *
 * Strict TDD: written BEFORE the implementation change.
 */

import {
    buildComponentList,
    buildAppBuilderDefinitionFromInstance,
} from '@/features/lifecycle/services/projectResetService';
import type { Stack } from '@/types/stacks';
import { createMockProject } from '../../../helpers/projectFake';

function createStack(overrides: Partial<Stack> = {}): Stack {
    return {
        id: 'headless-paas',
        frontend: 'citisignal',
        backend: 'paas',
        dependencies: ['commerce-mesh'],
        optionalAddons: [],
        ...overrides,
    } as unknown as Stack;
}

describe('buildComponentList — app-builder derivation', () => {
    it('includes the app from componentSelections.appBuilder', () => {
        const stack = createStack();
        const project = createMockProject({
            componentSelections: { appBuilder: ['my-app'] },
        });

        const list = buildComponentList(stack, project);

        expect(list).toContainEqual({ id: 'my-app', type: 'app-builder' });
    });

    it('produces NO app-builder entry from selectedAddons', () => {
        const stack = createStack({
            optionalAddons: [{ id: 'opt-addon' }],
        });
        const project = createMockProject({
            // An addon that is NOT in optionalAddons used to leak into app-builder.
            selectedAddons: ['some-addon'],
            componentSelections: {},
        });

        const list = buildComponentList(stack, project);

        const appEntries = list.filter((c) => c.type === 'app-builder');
        expect(appEntries).toEqual([]);
    });

    it('still includes frontend and dependencies unchanged', () => {
        const stack = createStack();
        const project = createMockProject({
            componentSelections: { appBuilder: ['my-app'], dependencies: ['commerce-mesh'] },
        });

        const list = buildComponentList(stack, project);

        expect(list).toContainEqual({ id: 'citisignal', type: 'frontend' });
        expect(list).toContainEqual({ id: 'commerce-mesh', type: 'dependency' });
    });

    it('is EMPTY for a stack with no frontend and no dependencies when the project saved none', () => {
        const stack = createStack({ frontend: undefined, dependencies: undefined });
        const project = createMockProject({ componentSelections: undefined });

        expect(buildComponentList(stack, project)).toEqual([]);
    });

    it('produces no app-builder entry when appBuilder selection is empty/absent', () => {
        const stack = createStack();
        const project = createMockProject({ componentSelections: {} });

        const list = buildComponentList(stack, project);

        expect(list.filter((c) => c.type === 'app-builder')).toEqual([]);
    });
});

describe('buildAppBuilderDefinitionFromInstance — runtime app reconstruction', () => {
    // A dashboard-added app is NOT in the static registry, so reset must rebuild
    // its definition (with a git source) from the saved componentInstance — else
    // it is dropped from the re-clone and silently lost on reset.
    it('reconstructs a git component definition from the saved instance', () => {
        const project = createMockProject({
            componentInstances: {
                'my-app': {
                    id: 'my-app',
                    name: 'my-app',
                    status: 'ready',
                    subType: 'app',
                    repoUrl: 'https://github.com/acme/my-app.git',
                    branch: 'main',
                    path: '/tmp/proj/my-app',
                },
            },
        });

        const def = buildAppBuilderDefinitionFromInstance(project, 'my-app');

        expect(def).toBeDefined();
        expect(def?.id).toBe('my-app');
        expect(def?.type).toBe('app-builder');
        expect(def?.subType).toBe('app');
        expect(def?.source).toEqual(
            expect.objectContaining({ type: 'git', url: 'https://github.com/acme/my-app.git', branch: 'main' }),
        );
    });

    it('defaults the branch to main when the saved instance has none', () => {
        const project = createMockProject({
            componentInstances: {
                'my-app': { id: 'my-app', name: 'my-app', status: 'ready', repoUrl: 'https://github.com/acme/my-app.git' },
            },
        });

        const def = buildAppBuilderDefinitionFromInstance(project, 'my-app');

        expect(def?.source).toEqual(expect.objectContaining({ branch: 'main' }));
    });

    it('returns undefined for a project that has no instances at all', () => {
        const project = createMockProject({ componentInstances: undefined });

        expect(buildAppBuilderDefinitionFromInstance(project, 'my-app')).toBeUndefined();
    });

    it('returns undefined when no instance exists for the id', () => {
        const project = createMockProject({ componentInstances: {} });

        expect(buildAppBuilderDefinitionFromInstance(project, 'my-app')).toBeUndefined();
    });

    it('returns undefined when the saved instance has no repoUrl (nothing to clone)', () => {
        const project = createMockProject({
            componentInstances: {
                'my-app': { id: 'my-app', name: 'my-app', status: 'ready', subType: 'app' },
            },
        });

        expect(buildAppBuilderDefinitionFromInstance(project, 'my-app')).toBeUndefined();
    });
});
