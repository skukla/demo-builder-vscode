/**
 * Configure reads the fields of the add-ons a project has chosen, not only its stack's own
 * components (PL-60): the ACO add-on's tab renders when `selectedAddons` holds it.
 */

import { renderHook } from '@testing-library/react';
import type { ComponentsData } from '@/features/dashboard/ui/configure/configureTypes';
import { useSelectedComponents } from '@/features/dashboard/ui/configure/hooks/useSelectedComponents';
import { createMockProject } from '../../../../../helpers/projectFake';

const componentsData: ComponentsData = {
    frontends: [{ id: 'eds-storefront', name: 'EDS', configuration: {} }],
    backends: [{ id: 'adobe-commerce-accs', name: 'ACCS', configuration: { requiredEnvVars: ['ACCS_GRAPHQL_ENDPOINT'] } }],
    dependencies: [],
    addons: [{ id: 'adobe-commerce-aco', name: 'Adobe Commerce Optimizer', configuration: { requiredEnvVars: ['ACO_TENANT_ID'] } }],
    envVars: {},
};

const projectWith = (selectedAddons?: string[]) =>
    createMockProject({ componentSelections: { frontend: 'eds-storefront', backend: 'adobe-commerce-accs' }, selectedAddons });

describe('useSelectedComponents', () => {
    it('adds a chosen add-on after the stack\'s components', () => {
        const { result } = renderHook(() => useSelectedComponents({ project: projectWith(['adobe-commerce-aco']), componentsData }));
        expect(result.current.map((c) => [c.id, c.type])).toStrictEqual([
            ['eds-storefront', 'Frontend'],
            ['adobe-commerce-accs', 'Backend'],
            ['adobe-commerce-aco', 'Add-on'],
        ]);
    });

    it('leaves an add-on out while the project has not chosen it', () => {
        const { result } = renderHook(() => useSelectedComponents({ project: projectWith(), componentsData }));
        expect(result.current.map((c) => c.id)).toStrictEqual(['eds-storefront', 'adobe-commerce-accs']);
    });
});
