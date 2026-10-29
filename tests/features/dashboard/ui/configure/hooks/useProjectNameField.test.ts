/**
 * useProjectNameField — the Configure screen's project-name field.
 *
 * No mocks: the hook's collaborators (`getProjectDisplayName`,
 * `normalizeProjectName`, `getProjectNameError`) are pure, and driving the real
 * ones is what makes an assertion about the error mean anything.
 */

import { act, renderHook } from '@testing-library/react';
import { useProjectNameField } from '@/features/dashboard/ui/configure/hooks/useProjectNameField';
import type { Project } from '@/types/base';
import { createMockProject } from '../../../../../helpers/projectFake';

const project: Project = createMockProject({ name: 'bodea-demo', title: 'Bodea Demo' });

function render(existingProjectNames: string[] = ['bodea-demo', 'other-demo']) {
    return renderHook(() => useProjectNameField({ project, existingProjectNames }));
}

describe('useProjectNameField', () => {
    it('seeds the field with the display title, untouched and without an error', () => {
        const { result } = render();

        expect(result.current.projectName).toBe('Bodea Demo');
        expect(result.current.projectNameTouched).toBe(false);
        expect(result.current.projectNameError).toBeUndefined();
    });

    it('keeps exactly what was typed and marks the field touched', () => {
        const { result } = render();

        act(() => result.current.handleProjectNameChange('My New Demo'));

        expect(result.current.projectName).toBe('My New Demo');
        expect(result.current.projectFolder).toBe('my-new-demo');
        expect(result.current.projectNameTouched).toBe(true);
        expect(result.current.projectNameError).toBeUndefined();
    });

    it('rejects a title whose slug collides with another project', () => {
        const { result } = render();

        act(() => result.current.handleProjectNameChange('Other Demo'));

        expect(result.current.projectNameError).toBe('A project with this name already exists');
    });

    it('accepts a title whose slug is the project own name', () => {
        const { result } = render();

        act(() => result.current.handleProjectNameChange('BODEA DEMO'));

        expect(result.current.projectNameError).toBeUndefined();
    });

    it('reports an error for an empty name once touched', () => {
        const { result } = render([]);

        act(() => result.current.handleProjectNameChange(''));

        expect(result.current.projectNameError).toEqual(expect.any(String));
    });
});
