/**
 * The catalog header's actions (owner, 2026-10-30): Create datapack, Load from file, and, set
 * apart at the end because it deletes, Clear demo data.
 *
 * Quiet buttons with icons (`ActionButton isQuiet`, the header's own refresh and view toggles;
 * glyphs from `renderMenuIcon`, so "delete" is one glyph everywhere). They were blue text links,
 * which read as navigation when every one is an action.
 *
 * Create datapack is Save As with no name yet (`onCreate`): the new pack's name, then what goes
 * in it, and the demo then uses it; once a demo has a pack of the SC's, its flyout's Save Changes
 * saves it (owner, 2026-11-04). The service's own export into its shared catalog was deleted on
 * 2026-11-06 (DI-12): a pack goes there by Copy to the Data Installer. Clear demo data clears the
 * stores the SC ticks of what Demo Builder did not install (datapack-engine step 10), after its own confirmation, in the screen's progress
 * window.
 *
 * Each action owns the dialog it opens, so the catalog view carries no dialog's state.
 *
 * The Datapack Library (no `onCreate`) offers Load from File alone: Create Datapack reads a project's
 * store and Clear Demo Data clears stores, and the library touches none (owner, 2026-11-07).
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { ActionButton, Divider, Text } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { useClearDemoData } from '../hooks/useClearDemoData';
import { ClearDemoDataModal } from './ClearDemoDataModal';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import type { WipeStoreChoice } from '@/types/demoDataWipe';

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /**
     * Create Datapack, or Save Changes once the demo has a pack (owner, 2026-11-09): the save of the
     * demo's pack, as its flyout's button. Absent in the Datapack Library. Stable.
     */
    onCreate?: () => void;
    /**
     * What `onCreate` does once the demo has a pack, in the flyout's own words: `into` saves into the
     * SC's own pack (Save Changes), `as-new` makes a new pack from a team or colleague's pack (Save
     * As New Datapack). Absent: Create Datapack, from nothing.
     */
    demoSave?: 'into' | 'as-new';
}

/** Which dialog the header has open. */
type Open = 'load' | 'clear' | null;

export function CatalogHeaderActions({
    onCatalogChanged,
    onCreate,
    demoSave,
}: CatalogHeaderActionsProps): React.JSX.Element {
    const [open, setOpen] = useState<Open>(null);
    const { clear, progressWindow } = useClearDemoData(onCatalogChanged);

    const close = useCallback((): void => setOpen(null), []);
    const startClear = useCallback(
        (stores: WipeStoreChoice[], token: string): void => {
            setOpen(null);
            clear(stores, token);
        },
        [clear],
    );
    // Stable, because the load modal's effect depends on it.
    const closeLoad = useCallback((): void => {
        setOpen(null);
        onCatalogChanged();
    }, [onCatalogChanged]);

    return (
        <>
            {onCreate ? (
                <ActionButton isQuiet onPress={onCreate}>
                    {renderMenuIcon(demoSave ? 'capture' : 'add')}
                    {demoSave === 'into' ? <Text>Save Changes</Text> : null}
                    {demoSave === 'as-new' ? <Text>Save As New Datapack</Text> : null}
                    {demoSave ? null : <Text>Create Datapack</Text>}
                </ActionButton>
            ) : null}
            <ActionButton isQuiet onPress={() => setOpen('load')}>
                {renderMenuIcon('openFile')}
                <Text>Load from File</Text>
            </ActionButton>
            {onCreate ? (
                <>
                    <Divider orientation="vertical" size="S" />
                    <ActionButton isQuiet onPress={() => setOpen('clear')}>
                        {renderMenuIcon('delete')}
                        <Text>Clear Demo Data</Text>
                    </ActionButton>
                </>
            ) : null}
            {open === 'load' ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
            {open === 'clear' ? <ClearDemoDataModal onClose={close} onClear={startClear} /> : null}
            {progressWindow}
        </>
    );
}
