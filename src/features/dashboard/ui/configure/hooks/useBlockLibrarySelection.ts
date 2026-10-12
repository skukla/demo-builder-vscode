/**
 * useBlockLibrarySelection Hook
 *
 * The block libraries ticked on the Configure screen's Authoring tab (EDS-39).
 * Seeded from what the project has recorded, and lifted to ConfigureScreen so a
 * tick survives switching tabs, like every other value on the screen.
 *
 * `changedSelection` is undefined until the SC touches the picker. Save sends
 * the selection only then: a Configure window that was opened before another
 * surface changed the libraries would otherwise write its old list back.
 *
 * @module features/dashboard/ui/configure/hooks/useBlockLibrarySelection
 */

import { useCallback, useMemo, useState } from 'react';
import type { Project } from '@/types/base';
import type { CustomBlockLibrary } from '@/types/blockLibraries';

/** The two recorded lists, in the shape `save-configuration` carries them. */
export interface BlockLibrarySelection {
    /** Catalog library ids. */
    selectedBlockLibraries: string[];
    /** Custom libraries, from the `demoBuilder.blockLibraries.custom` setting. */
    customBlockLibraries: CustomBlockLibrary[];
}

export interface UseBlockLibrarySelectionProps {
    /** The project being configured: its recorded libraries seed the picker. */
    project: Project;
}

export interface UseBlockLibrarySelectionReturn extends BlockLibrarySelection {
    /** Tick or untick a catalog library. */
    toggleBlockLibrary: (libraryId: string, isSelected: boolean) => void;
    /** Tick or untick a custom library (matched by owner and repository). */
    toggleCustomLibrary: (library: CustomBlockLibrary, isSelected: boolean) => void;
    /** The selection to save, or undefined while the picker is untouched. */
    changedSelection: BlockLibrarySelection | undefined;
}

function sameRepository(a: CustomBlockLibrary, b: CustomBlockLibrary): boolean {
    return a.source.owner === b.source.owner && a.source.repo === b.source.repo;
}

/**
 * Hold the block-library choice for the Configure screen.
 *
 * @param props - the project whose recorded libraries seed the choice
 * @returns the current lists, the two toggles, and what Save should send
 */
export function useBlockLibrarySelection({
    project,
}: UseBlockLibrarySelectionProps): UseBlockLibrarySelectionReturn {
    const [selectedBlockLibraries, setSelectedBlockLibraries] = useState<string[]>(
        () => project.selectedBlockLibraries ?? [],
    );
    const [customBlockLibraries, setCustomBlockLibraries] = useState<CustomBlockLibrary[]>(
        () => project.customBlockLibraries ?? [],
    );
    const [touched, setTouched] = useState(false);

    const toggleBlockLibrary = useCallback((libraryId: string, isSelected: boolean) => {
        setTouched(true);
        setSelectedBlockLibraries((current) => {
            const others = current.filter((id) => id !== libraryId);
            if (!isSelected) return others;
            return current.includes(libraryId) ? current : [...current, libraryId];
        });
    }, []);

    const toggleCustomLibrary = useCallback((library: CustomBlockLibrary, isSelected: boolean) => {
        setTouched(true);
        setCustomBlockLibraries((current) => {
            const others = current.filter((entry) => !sameRepository(entry, library));
            return isSelected ? [...others, library] : others;
        });
    }, []);

    const changedSelection = useMemo(
        () => (touched ? { selectedBlockLibraries, customBlockLibraries } : undefined),
        [touched, selectedBlockLibraries, customBlockLibraries],
    );

    return {
        selectedBlockLibraries,
        customBlockLibraries,
        toggleBlockLibrary,
        toggleCustomLibrary,
        changedSelection,
    };
}
