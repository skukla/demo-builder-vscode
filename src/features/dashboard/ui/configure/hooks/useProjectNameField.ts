/**
 * useProjectNameField Hook
 *
 * Owns the Configure screen's project-name field: the title as typed, whether the user
 * has touched it, and its validation error. Save reads the title from here to decide
 * whether to send a rename; the rail reads the error to mark the Project section.
 *
 * Moved out of ConfigureScreen (EDS-8) unchanged.
 *
 * @module features/dashboard/ui/configure/hooks/useProjectNameField
 */

import { useCallback, useMemo, useState } from 'react';
import { getProjectDisplayName } from '@/core/utils/projectDisplayName';
import { normalizeProjectName, getProjectNameError } from '@/core/validation/normalizers';
import type { Project } from '@/types/base';

export interface UseProjectNameFieldProps {
    /** The project being configured (seeds the field and is excluded from collisions). */
    project: Project;
    /** Slugs of the other projects, which a rename must not collide with. */
    existingProjectNames: string[];
}

export interface UseProjectNameFieldReturn {
    /** The title as typed (raw user input, not the slug). */
    projectName: string;
    /** Whether the user has typed in the field. */
    projectNameTouched: boolean;
    /** The validation error for the derived slug, once touched. */
    projectNameError: string | undefined;
    /** The folder slug the typed title derives to (what a rename would create). */
    projectFolder: string;
    /** Record a keystroke. */
    handleProjectNameChange: (value: string) => void;
}

/**
 * Manage the project-name field.
 *
 * @param props - the project and the other projects' slugs
 * @returns the typed title, its touched flag, error and folder slug, and the change handler
 */
export function useProjectNameField({
    project,
    existingProjectNames,
}: UseProjectNameFieldProps): UseProjectNameFieldReturn {
    // The TITLE as typed, not the slug. `handleRenameProject` derives the slug
    // from it on save, so this field never has to show hyphens.
    // Explicitly `string`: this holds RAW user input while they type. It is
    // seeded from the display name but stops being one the moment a key lands,
    // so branding the state would be a lie the compiler then enforces.
    const [projectName, setProjectName] = useState<string>(getProjectDisplayName(project));
    const [projectNameTouched, setProjectNameTouched] = useState(false);

    // Validate project name
    const projectNameError = useMemo(() => {
        if (!projectNameTouched) return undefined;
        // Validate the DERIVED slug: it is what has to be a legal folder and what
        // `existingProjectNames` holds. Validating the raw title would reject
        // every capital and space the field now exists to allow.
        return getProjectNameError(
            normalizeProjectName(projectName),
            existingProjectNames,
            project.name,
        );
    }, [projectName, existingProjectNames, project.name, projectNameTouched]);

    // Keep what was typed. It used to run `normalizeProjectName` on every
    // keystroke, so "My Bodea Demo" rewrote itself under the cursor.
    const handleProjectNameChange = useCallback((value: string) => {
        setProjectName(value);
        setProjectNameTouched(true);
    }, []);

    return {
        projectName,
        projectNameTouched,
        projectNameError,
        projectFolder: normalizeProjectName(projectName),
        handleProjectNameChange,
    };
}
