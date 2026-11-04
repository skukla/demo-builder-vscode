/**
 * The catalog header's actions (owner, 2026-10-30): Create datapack, Load from file, and, set
 * apart at the end because it deletes, Clear demo data.
 *
 * Quiet buttons with icons (`ActionButton isQuiet`, the header's own refresh and view toggles;
 * glyphs from `renderMenuIcon`, so "delete" is one glyph everywhere). They were blue text links,
 * which read as navigation when every one is an action.
 *
 * Create datapack is here only with the service's engine, where it exports into the shared
 * catalog (`CreateDatapackModal`). With Demo Builder's engine a pack is made from the demo's own
 * card instead, Save As (`ProjectPackSection`, owner 2026-11-03): two doors to one save were how the
 * owner lost track of where it went. Clear demo data clears the stores the SC ticks of what Demo Builder did
 * not install (datapack-engine step 10), after its own confirmation, in the screen's progress
 * window.
 *
 * Each action owns the dialog it opens, so the catalog view carries no dialog's state.
 *
 * @module features/data-installer/ui/components/CatalogHeaderActions
 */

import { ActionButton, Divider, Text } from '@adobe/react-spectrum';
import React, { useCallback, useState } from 'react';
import { useClearDemoData } from '../hooks/useClearDemoData';
import { ClearDemoDataModal } from './ClearDemoDataModal';
import { CreateDatapackModal } from './CreateDatapackModal';
import { LoadDatapackFileModal } from './LoadDatapackFileModal';
import { renderMenuIcon } from '@/core/ui/components/ui/menuIcons';
import type { WipeStoreChoice } from '@/types/demoDataWipe';

export interface CatalogHeaderActionsProps {
    /** A file was loaded (or the load modal closed): the catalog may have changed. Stable. */
    onCatalogChanged: () => void;
    /** The engine chosen: Create Datapack is here only with the service's. */
    engine?: 'service' | 'demo-builder';
}

/** Which dialog the header has open. */
type Open = 'create' | 'load' | 'clear' | null;

export function CatalogHeaderActions({
    onCatalogChanged,
    engine,
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
            {engine !== 'demo-builder' ? (
                <ActionButton isQuiet onPress={() => setOpen('create')}>
                    {renderMenuIcon('add')}
                    <Text>Create Datapack</Text>
                </ActionButton>
            ) : null}
            <ActionButton isQuiet onPress={() => setOpen('load')}>
                {renderMenuIcon('openFile')}
                <Text>Load from File</Text>
            </ActionButton>
            <Divider orientation="vertical" size="S" />
            <ActionButton isQuiet onPress={() => setOpen('clear')}>
                {renderMenuIcon('delete')}
                <Text>Clear Demo Data</Text>
            </ActionButton>
            {open === 'create' ? <CreateDatapackModal engine={engine} onClose={close} /> : null}
            {open === 'load' ? <LoadDatapackFileModal onClose={closeLoad} /> : null}
            {open === 'clear' ? <ClearDemoDataModal onClose={close} onClear={startClear} /> : null}
            {progressWindow}
        </>
    );
}
