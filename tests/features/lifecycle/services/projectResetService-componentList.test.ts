/**
 * Project Reset Service - buildComponentList app-builder derivation (Part C)
 *
 * The list reset downloads again. It never holds an integration: reset leaves
 * integrations alone (AB-23 slice 7, owner 2026-09-21) — their code may be the SC's
 * own work, and their apps keep running in Adobe either way.
 */

import { buildComponentList } from '@/features/lifecycle/services/projectResetService';
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
    it('never includes an integration, even one the project selected', () => {
        const stack = createStack();
        const project = createMockProject({
            componentSelections: { appBuilder: ['my-app'] },
        });

        const list = buildComponentList(stack, project);

        expect(list.map((c) => c.id)).not.toContain('my-app');
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
        expect(appEntries).toStrictEqual([]);
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

        expect(buildComponentList(stack, project)).toStrictEqual([]);
    });

    it('produces no app-builder entry when appBuilder selection is empty/absent', () => {
        const stack = createStack();
        const project = createMockProject({ componentSelections: {} });

        const list = buildComponentList(stack, project);

        expect(list.filter((c) => c.type === 'app-builder')).toStrictEqual([]);
    });
});
