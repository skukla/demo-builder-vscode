/**
 * Which datapack the flyout shows, and the read of its details (walk F77, 2026-11-08).
 *
 * A card opens the flyout on the version it shows. The demo's own pack shows the demo's version,
 * but only once the screen has read which one that is (`get-datapack-import-target`); before then
 * the card shows its default, "main". Luma's flyout once opened on "main" while its card showed
 * eds-compatible, with no version chosen. So when the demo's version arrives and the flyout shows
 * the demo's own pack on another version the SC did not pick, the flyout moves to the demo's
 * version, provided the pack still lists it.
 *
 * Each read says why that version, and the extension writes it to Debug Logs, so the next
 * question of this kind has an answer there.
 *
 * @module features/data-installer/ui/hooks/useDetailFlyout
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DatapackGroup } from '../../services/datapackCatalog';
import { versionHistoryOf } from '../versionHistory';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { DatapackId, DatapackStoreName, ProjectDatapack } from '@/types/datapack';

/** Why the flyout opened on its version, as Debug Logs say it. */
export const OPEN_WHY = {
    card: 'the version its card showed',
    demo: 'the version this demo uses',
} as const;

/** What the flyout's detail read is sent. */
export interface DetailRead {
    datapackName: string;
    version: string;
    store: DatapackStoreName;
    why?: string;
}

/**
 * The flyout's pack, and opening and closing it.
 *
 * @param a.load - the detail read (`get-datapack-detail`)
 * @param a.held - the pack the open project records, once read
 * @param a.versions - the versions the SC picked on the cards, by card key
 * @param a.groups - the cards, to check the demo's version is still listed
 */
export function useDetailFlyout(a: {
    load: (read: DetailRead) => void;
    held: ProjectDatapack | undefined;
    versions: Record<string, string>;
    groups: readonly DatapackGroup[];
}): {
    selected: DatapackId | undefined;
    selectedStore: DatapackStoreName;
    open: (id: DatapackId, store: DatapackStoreName) => void;
    close: () => void;
    /** The open pack's saves and the one in use, for its Version History (walk F99). */
    history: ReturnType<typeof versionHistoryOf>;
} {
    const { load, held, versions, groups } = a;
    const [selected, setSelected] = useState<DatapackId | undefined>(undefined);
    const [selectedStore, setSelectedStore] = useState<DatapackStoreName>('installer');

    const show = useCallback(
        (id: DatapackId, store: DatapackStoreName, why: string): void => {
            setSelected(id);
            setSelectedStore(store);
            load({ datapackName: id.name, version: id.version, store, why });
        },
        [load],
    );
    const open = useCallback(
        (id: DatapackId, store: DatapackStoreName): void => show(id, store, OPEN_WHY.card),
        [show],
    );
    const close = useCallback((): void => setSelected(undefined), []);

    useEffect(() => {
        if (!selected || !held) return;
        const heldStore = held.store ?? 'installer';
        if (
            selected.name !== held.name ||
            selectedStore !== heldStore ||
            selected.version === held.version
        )
            return;
        if (versions[`${heldStore}:${held.name}`] !== undefined) return;
        const group = groups.find((g) => g.name === held.name && g.store === heldStore);
        if (!group?.versions.some((v) => v.id.version === held.version)) return;
        show({ name: held.name, version: held.version }, heldStore, OPEN_WHY.demo);
    }, [selected, selectedStore, held, versions, groups, show]);

    const history = useMemo(() => versionHistoryOf(groups, selected, selectedStore, held), [groups, selected, selectedStore, held]);
    return { selected, selectedStore, open, close, history };
}

/**
 * Rename the SC's own library pack (step 07), the inline field's contract: null on success,
 * the reason otherwise. The field is the confirmation, so it is sent confirmed.
 */
export async function requestDatapackRename(id: DatapackId, displayName: string): Promise<string | null> {
    try {
        const response = await webviewClient.request<{ success: boolean; error?: string }>('rename-library-datapack', {
            datapackName: id.name,
            displayName,
            confirm: true,
        });
        return response?.success ? null : (response?.error ?? 'Rename failed');
    } catch (error) {
        return error instanceof Error ? error.message : 'Rename failed';
    }
}
