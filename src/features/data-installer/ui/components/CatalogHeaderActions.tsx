/**
 * The catalog header's actions (owner, 2026-10-30): Create datapack, Load from file, and, set
 * apart at the end because it deletes, Clear demo data.
 *
 * Quiet buttons with icons (`ActionButton isQuiet`, the header's own refresh and view toggles;
 * glyphs from `renderMenuIcon`, so "delete" is one glyph everywhere). They were blue text links,
 * which read as navigation when every one is an action.
 *
 * Create datapack replaced "Export from this instance" and "Save from this store", which
 * overlapped, and named a store where they read an instance. Its dialog asks the pack type and
 * routes (`CreateDatapackModal`): a Commerce pack with Demo Builder's engine goes to the pick
 * screen, which the view hosts with the save's progress window (`useHeldPack`), so it is raised
 * as `onSaveFromStore`. Clear demo data clears the stores the SC ticks of what Demo Builder did
 * not install (datapack-engine step 10), after its own confirmation, in the screen's progress
 * window.
 *
 * Each action owns the dialog it opens, so the catalog view carries no dialog's state.
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { ActionButton, Divider, Text } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import type { StorePicks } from '../../pickableKinds';
import { useClearDemoData } from '../hooks/useClearDemoData';
import { ClearDemoDataModal } from './ClearDemoDataModal';
import { CreateDatapackModal } from './CreateDatapackModal';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import type { WipeStoreChoice } from '@/types/demoDataWipe';

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /** The engine chosen, which decides where a Commerce pack is made (`CreateDatapackModal`). */
    engine?: 'service' | 'demo-builder';
    /** Demo Builder's engine, a Commerce pack: open the pick screen with no pack. Stable. */
    onSaveFromStore: (picks: StorePicks) => void;
}

/** Which dialog the header has open. */
type Open = 'create' | 'load' | 'clear' | null;

export function CatalogHeaderActions({
    onCatalogChanged,
    engine,
    onSaveFromStore,
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
            <ActionButton isQuiet onPress={() => setOpen('create')}>
                {renderMenuIcon('add')}
                <Text>Create datapack</Text>
            </ActionButton>
            <ActionButton isQuiet onPress={() => setOpen('load')}>
                {renderMenuIcon('openFile')}
                <Text>Load from file</Text>
            </ActionButton>
            <Divider orientation="vertical" size="S" />
            <ActionButton isQuiet onPress={() => setOpen('clear')}>
                {renderMenuIcon('delete')}
                <Text>Clear demo data</Text>
            </ActionButton>
            {open === 'create' ? <CreateDatapackModal engine={engine} onClose={close} onSaveFromStore={onSaveFromStore} /> : null}
            {open === 'load' ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
            {open === 'clear' ? <ClearDemoDataModal onClose={close} onClear={startClear} /> : null}
            {progressWindow}
        </>
    );
}
