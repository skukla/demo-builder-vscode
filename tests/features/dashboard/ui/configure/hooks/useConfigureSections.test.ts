/**
 * useConfigureSections — the sections, global validation, the rail and canSave.
 *
 * No mocks: `validateServiceGroups`, `buildConfigureSections` and
 * `toStepRailTabs` are pure, and the invariants this hook carries (an error in a
 * HIDDEN section still blocks Save and marks its tab) are only proven by running
 * the real ones.
 */

import { act, renderHook } from '@testing-library/react';
import type { ServiceGroup, UniqueField } from '@/features/dashboard/ui/configure/configureTypes';
import {
    useConfigureSections,
    type UseConfigureSectionsProps,
} from '@/features/dashboard/ui/configure/hooks/useConfigureSections';

const catalogKey: UniqueField = {
    key: 'ADOBE_CATALOG_API_KEY',
    label: 'Catalog API Key',
    type: 'text',
    required: true,
    componentIds: ['catalog-service'],
};

const GROUPS: ServiceGroup[] = [
    { id: 'catalog-service', label: 'Catalog Service', fields: [catalogKey] },
];

const filled = (): string => 'key-123';
const empty = (): undefined => undefined;
const complete = (): boolean => true;

function render(overrides: Partial<UseConfigureSectionsProps> = {}) {
    const props: UseConfigureSectionsProps = {
        serviceGroups: GROUPS,
        getValueFromConfigs: filled,
        isFieldComplete: complete,
        isEds: false,
        projectNameError: undefined,
        ...overrides,
    };
    return renderHook(() => useConfigureSections(props));
}

describe('useConfigureSections', () => {
    it('opens on the Project section with every other section reachable', () => {
        const { result } = render();

        expect(result.current.activeSection.id).toBe('project-info');
        expect(result.current.railTabs).toStrictEqual([
            { id: 'project-info', title: 'Project', status: 'current', hasError: false },
            { id: 'catalog-service', title: 'Catalog Service', status: 'done', hasError: false },
        ]);
    });

    it('allows Save when nothing anywhere is invalid', () => {
        const { result } = render();

        expect(result.current.validationErrors).toStrictEqual({});
        expect(result.current.canSave).toBe(true);
    });

    it('blocks Save for an error in a section that is not on screen, and marks its tab', () => {
        const { result } = render({ getValueFromConfigs: empty });

        expect(result.current.activeSection.id).toBe('project-info');
        expect(result.current.validationErrors).toStrictEqual({
            ADOBE_CATALOG_API_KEY: 'Catalog API Key is required',
        });
        expect(result.current.canSave).toBe(false);
        expect(result.current.railTabs[1]).toMatchObject({ id: 'catalog-service', hasError: true });
    });

    it('blocks Save and marks the Project tab for a project-name error', () => {
        const { result } = render({ projectNameError: 'A project with this name already exists' });

        expect(result.current.canSave).toBe(false);
        expect(result.current.railTabs[0]).toMatchObject({ id: 'project-info', hasError: true });
    });

    it('switches the active section and the rail together', () => {
        const { result } = render();

        act(() => result.current.setActiveSectionId('catalog-service'));

        expect(result.current.activeSection.id).toBe('catalog-service');
        expect(result.current.railTabs.map((tab) => tab.status)).toStrictEqual(['done', 'current']);
    });

    it('falls back to the first section when the stored id no longer exists', () => {
        const { result } = render();

        act(() => result.current.setActiveSectionId('gone'));

        expect(result.current.activeSection.id).toBe('project-info');
    });

    it('adds the Authoring section for an EDS project', () => {
        const { result } = render({ isEds: true });

        expect(result.current.railTabs.map((tab) => tab.id)).toStrictEqual([
            'project-info',
            'catalog-service',
            'authoring-experience',
        ]);
    });
});
