/**
 * stackComponentCollector Tests
 *
 * The dependency rule that `useComponentConfig` applied in three hand-written
 * copies (duplication scan, 2026-07-31): take a dependency only when it resolves,
 * is not already collected, and has env vars worth configuring. The three sources
 * — a component's `required` deps, its `optional` deps, and the stack's own
 * `dependencies` — differ ONLY in that optional deps are gated on the stack having
 * selected them.
 *
 * These live here rather than on the hook because the collection was internal to
 * it: `selectedComponents` is never returned, so the rule was unreachable by any
 * test before extraction.
 */

import {
    collectStackComponents,
    hasConfigurableEnvVars,
} from '@/features/components/services/stackComponentCollector';

jest.mock('@/core/ui/utils/componentDataHelpers', () => ({
    findComponentById: jest.fn(),
}));

const { findComponentById } = jest.requireMock('@/core/ui/utils/componentDataHelpers');

/** A component with configurable env vars — qualifies as a Dependency. */
function withEnv(id: string, extra: Record<string, unknown> = {}) {
    return { id, configuration: { requiredEnvVars: ['A_VAR'] }, ...extra };
}
/** A component with nothing to configure — must be skipped. */
function withoutEnv(id: string, extra: Record<string, unknown> = {}) {
    return { id, configuration: {}, ...extra };
}

/** Resolve ids from a table; anything absent resolves to undefined. */
function lookup(table: Record<string, unknown>) {
    findComponentById.mockImplementation((_data: unknown, id: string) => table[id]);
}

function ids(result: Array<{ id: string }>): string[] {
    return result.map((entry) => entry.id);
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('hasConfigurableEnvVars', () => {
    it.each([
        ['required only', { requiredEnvVars: ['A'] }, true],
        ['optional only', { optionalEnvVars: ['B'] }, true],
        ['both', { requiredEnvVars: ['A'], optionalEnvVars: ['B'] }, true],
        ['empty arrays', { requiredEnvVars: [], optionalEnvVars: [] }, false],
        ['no configuration keys', {}, false],
    ])('%s → %s', (_label, configuration, expected) => {
        expect(hasConfigurableEnvVars({ id: 'x', configuration })).toBe(expected);
    });

    it('is false for a component that does not resolve', () => {
        expect(hasConfigurableEnvVars(undefined)).toBe(false);
    });
});

describe('collectStackComponents', () => {
    it('returns nothing without a stack', () => {
        expect(collectStackComponents(undefined, {})).toEqual([]);
    });

    it('collects the frontend and backend with their types', () => {
        lookup({});
        const data = { frontends: [withoutEnv('fe')], backends: [withoutEnv('be')] };

        const result = collectStackComponents({ frontend: 'fe', backend: 'be' }, data);

        expect(result).toEqual([
            { id: 'fe', data: data.frontends[0], type: 'Frontend' },
            { id: 'be', data: data.backends[0], type: 'Backend' },
        ]);
    });

    describe('the shared dependency rule', () => {
        it('includes a REQUIRED dependency that has env vars', () => {
            lookup({ 'dep-a': withEnv('dep-a') });
            const data = {
                frontends: [withoutEnv('fe', { dependencies: { required: ['dep-a'] } })],
            };

            const result = collectStackComponents({ frontend: 'fe' }, data);

            expect(ids(result)).toEqual(['fe', 'dep-a']);
            expect(result[1].type).toBe('Dependency');
        });

        it('SKIPS a dependency with nothing to configure', () => {
            lookup({ 'dep-a': withoutEnv('dep-a') });
            const data = {
                frontends: [withoutEnv('fe', { dependencies: { required: ['dep-a'] } })],
            };

            expect(ids(collectStackComponents({ frontend: 'fe' }, data))).toEqual(['fe']);
        });

        it('SKIPS an id that resolves to nothing', () => {
            lookup({});
            const data = {
                frontends: [withoutEnv('fe', { dependencies: { required: ['ghost'] } })],
            };

            expect(ids(collectStackComponents({ frontend: 'fe' }, data))).toEqual(['fe']);
        });

        it('never collects the same dependency twice', () => {
            lookup({ 'dep-a': withEnv('dep-a') });
            const data = {
                frontends: [withoutEnv('fe', { dependencies: { required: ['dep-a'] } })],
                backends: [withoutEnv('be', { dependencies: { required: ['dep-a'] } })],
            };

            const result = collectStackComponents(
                { frontend: 'fe', backend: 'be', dependencies: ['dep-a'] },
                data
            );

            expect(result.filter((entry) => entry.id === 'dep-a')).toHaveLength(1);
        });
    });

    // The ONE asymmetry between the three sources.
    describe('optional dependencies are gated on the stack', () => {
        const data = {
            frontends: [withoutEnv('fe', { dependencies: { optional: ['opt-a'] } })],
        };

        it('takes an optional dep the stack selected', () => {
            lookup({ 'opt-a': withEnv('opt-a') });

            const result = collectStackComponents(
                { frontend: 'fe', dependencies: ['opt-a'] },
                data
            );

            expect(ids(result)).toContain('opt-a');
        });

        it('LEAVES an optional dep the stack did not select', () => {
            lookup({ 'opt-a': withEnv('opt-a') });

            expect(ids(collectStackComponents({ frontend: 'fe' }, data))).toEqual(['fe']);
        });

        it('still applies the env-var rule to a selected optional dep', () => {
            lookup({ 'opt-a': withoutEnv('opt-a') });

            const result = collectStackComponents(
                { frontend: 'fe', dependencies: ['opt-a'] },
                data
            );

            expect(ids(result)).toEqual(['fe']);
        });
    });

    describe('stack-level dependencies', () => {
        it('collects one that has env vars', () => {
            lookup({ 'mesh-x': withEnv('mesh-x') });

            const result = collectStackComponents({ dependencies: ['mesh-x'] }, {});

            expect(ids(result)).toEqual(['mesh-x']);
        });

        // Searched across ALL registry sections, which is how mesh components
        // (eds-accs-mesh, eds-commerce-mesh) reach the Configure screen.
        it('resolves by id rather than from a dependencies section', () => {
            lookup({ 'eds-commerce-mesh': withEnv('eds-commerce-mesh') });

            const result = collectStackComponents(
                { dependencies: ['eds-commerce-mesh'] },
                { frontends: [], backends: [] }
            );

            expect(ids(result)).toEqual(['eds-commerce-mesh']);
        });
    });

    it('orders frontend, then backend, then stack dependencies', () => {
        lookup({ 'dep-a': withEnv('dep-a'), 'mesh-x': withEnv('mesh-x') });
        const data = {
            frontends: [withoutEnv('fe', { dependencies: { required: ['dep-a'] } })],
            backends: [withoutEnv('be')],
        };

        const result = collectStackComponents(
            { frontend: 'fe', backend: 'be', dependencies: ['mesh-x'] },
            data
        );

        expect(ids(result)).toEqual(['fe', 'dep-a', 'be', 'mesh-x']);
    });
});
