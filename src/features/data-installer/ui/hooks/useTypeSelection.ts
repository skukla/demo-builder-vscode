/**
 * Which of a pack's data types the import modal has ticked, and why each is ticked. Split out of
 * `ImportDatapackModal` (its own job, and that file was at its size limit).
 *
 * One state, not two: the provenance record only means anything alongside the selection it
 * describes, and splitting them invites an update that moves one without the other.
 *
 * @module features/data-installer/ui/hooks/useTypeSelection
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { deselectType, selectType, type TypeSelection } from '../importDependencies';

export interface TypeChoices {
    selected: string[];
    allSelected: boolean;
    toggle: (type: string, isSelected: boolean) => void;
    toggleAll: () => void;
}

/**
 * @param availableTypes - the types the pack holds
 * @param replacing - the import replaces the demo's pack: every type starts ticked (walk F103), since
 *   the pack replaced goes whole and nothing else would put its place back. Known only once the
 *   project's pack is read, so it ticks then, and only while the SC has ticked nothing.
 */
export function useTypeSelection(availableTypes: string[], replacing = false): TypeChoices {
    // A pack with one type has nothing to choose, so it starts ticked; a larger one is opt-in.
    const [selection, setSelection] = useState<TypeSelection>(() => ({
        selected: availableTypes.length === 1 ? availableTypes : [],
        auto: [],
    }));
    const selected = selection.selected as string[];

    const ticked = useRef(false);
    useEffect(() => {
        if (!replacing || ticked.current || availableTypes.length === 0) return;
        ticked.current = true;
        setSelection((current) => (current.selected.length === 0 ? { selected: [...availableTypes], auto: [] } : current));
    }, [replacing, availableTypes]);

    const toggle = useCallback(
        (type: string, isSelected: boolean): void => {
            // Both transitions are pure and live in `importDependencies` — the
            // provenance rule they implement is the whole reason this is not a
            // one-line filter, and it is worth testing without React.
            setSelection((current) =>
                isSelected ? selectType(current, type, availableTypes) : deselectType(current, type),
            );
        },
        [availableTypes],
    );

    // A pack ships up to 14 types (Bodea does), so ticking them one at a time
    // is a chore for what is usually "all of it".
    const allSelected = availableTypes.length > 0 && selected.length === availableTypes.length;
    const toggleAll = useCallback((): void => {
        // Everything or nothing, and either way the user chose all of it — so
        // nothing is `auto` and Clear all genuinely clears.
        setSelection(allSelected ? { selected: [], auto: [] } : { selected: [...availableTypes], auto: [] });
    }, [allSelected, availableTypes]);

    return { selected, allSelected, toggle, toggleAll };
}
