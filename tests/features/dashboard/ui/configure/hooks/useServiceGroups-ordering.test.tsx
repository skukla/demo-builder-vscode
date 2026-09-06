/**
 * useServiceGroups Tests — the order the rail's tabs come out in
 *
 * `SERVICE_GROUP_DEFINITIONS` declares each group's position twice: once by
 * where the entry sits in the array, once by its `order` number. Today those
 * two agree, which is exactly why nothing here could be measured from the real
 * list — the sort had no work to do, and every decision inside it was
 * unconstrained.
 *
 * So this suite mocks the definitions into an array whose POSITIONS disagree
 * with its `order` numbers. `toServiceGroupWithSortedFields` stays real
 * (`requireActual`) — the subject is the hook's ordering, not a stand-in for it.
 *
 * Lives in its own file because a `jest.mock` is file-wide and the rest of the
 * family must see the real list.
 */

jest.mock('@/features/components/services/serviceGroupTransforms', () => ({
    ...jest.requireActual('@/features/components/services/serviceGroupTransforms'),
    SERVICE_GROUP_DEFINITIONS: [
        // Array position says gamma, alpha, beta. `order` says alpha, beta,
        // gamma — and `order` is the one that decides.
        { id: 'gamma', label: 'Gamma', order: 3 },
        { id: 'alpha', label: 'Alpha', order: 1 },
        { id: 'beta', label: 'Beta', order: 2 },
        // No `order` at all: falls back to 99 and lands last, ahead of nothing.
        { id: 'delta', label: 'Delta' },
    ],
}));

// Below the mock on purpose: the factory hoists above it, so the hook binds to
// the mocked definitions. `import/first` is NOT a registered rule in
// eslint.config.mjs — do not add a disable comment for it, that itself errors.
import { renderHook } from '@testing-library/react';
import { useServiceGroups } from '@/features/dashboard/ui/configure/hooks/useServiceGroups';
import type { ComponentsData } from '@/features/dashboard/ui/configure/configureTypes';
import type { SelectedComponent } from '@/features/dashboard/ui/configure/hooks/useSelectedComponents';

const ALL_KEYS = ['DELTA_VAR', 'GAMMA_VAR', 'ALPHA_VAR', 'BETA_VAR'];

const componentsData: ComponentsData = {
    frontends: [],
    backends: [],
    dependencies: [],
    mesh: [],
    envVars: Object.fromEntries(
        ALL_KEYS.map((key) => [
            key,
            {
                key,
                label: key,
                type: 'text',
                required: true,
                group: key.split('_')[0].toLowerCase(),
            },
        ])
    ) as ComponentsData['envVars'],
};

/** One component declaring `keys`, so each named group has exactly one field. */
function componentDeclaring(keys: string[]): SelectedComponent {
    return {
        id: 'comp',
        type: 'Backend',
        data: {
            id: 'comp',
            name: 'comp',
            configuration: { requiredEnvVars: keys, optionalEnvVars: [] },
        },
    } as SelectedComponent;
}

function groupIdsFor(keys: string[]): string[] {
    const { result } = renderHook(() =>
        useServiceGroups({ selectedComponents: [componentDeclaring(keys)], componentsData })
    );
    return result.current.map((g) => g.id);
}

describe('useServiceGroups — group ordering', () => {
    it('orders groups by their declared order, not by their position in the list', () => {
        expect(groupIdsFor(['GAMMA_VAR', 'ALPHA_VAR', 'BETA_VAR'])).toStrictEqual([
            'alpha',
            'beta',
            'gamma',
        ]);
    });

    it('puts a group that declares no order last', () => {
        expect(groupIdsFor(ALL_KEYS)).toStrictEqual(['alpha', 'beta', 'gamma', 'delta']);
    });

    it('still drops the groups that ended up with no fields', () => {
        expect(groupIdsFor(['BETA_VAR'])).toStrictEqual(['beta']);
    });
});
