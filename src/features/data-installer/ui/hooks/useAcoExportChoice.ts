/**
 * An ACO pack's choices (datapack-engine step 14 item 19): for an Adobe Commerce Optimizer pack,
 * which store views and which ACO kinds, on Create a datapack's own screens (`ExportChoiceStages`).
 *
 * The store views come from the same discovery the import's target picker reads
 * (`list-datapack-import-scopes`), read once, when the SC first reaches them. Every store view and
 * every kind start ticked; all of them ticked is sent as "every one" (no list), which is exactly
 * what the Data Installer's own ACO export makes. A store that cannot be discovered shows no
 * store views and makes the pack for every one.
 *
 * @module features/data-installer/ui/hooks/useAcoExportChoice
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDataInstallerRequest } from './useDataInstallerRequest';
import type { TargetWebsite } from './useImportScopes';
import { ACO_EXPORT_KINDS } from '@/types/acoPack';

/** One store view to tick, with the website it belongs to. */
export interface AcoStoreViewChoice {
    code: string;
    name: string;
    websiteName: string;
}

/** What the ACO choice adds to `start-datapack-export`. */
export interface AcoExportFields {
    aco: true;
    storeViews?: string[];
    dataTypes?: string[];
}

export interface AcoExportChoice {
    storeViews: AcoStoreViewChoice[];
    loadingViews: boolean;
    pickedViews: string[];
    toggleView: (code: string, on: boolean) => void;
    kinds: readonly string[];
    pickedKinds: string[];
    toggleKind: (kind: string, on: boolean) => void;
    /** The store views are read, and at least one is ticked when there are any. */
    viewsChosen: boolean;
    /** The request fields; every one ticked is sent as none named. */
    fields: () => AcoExportFields;
}

const EMPTY_WEBSITES: TargetWebsite[] = [];

const toggled = (list: string[], item: string, on: boolean) =>
    on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

/**
 * @param wanted - the SC has reached an ACO pack's screens; the store views are read only then
 */
export function useAcoExportChoice(wanted: boolean): AcoExportChoice {
    const [pickedViews, setPickedViews] = useState<string[]>([]);
    const [pickedKinds, setPickedKinds] = useState<string[]>([...ACO_EXPORT_KINDS]);
    const scopes = useDataInstallerRequest<{ websites: TargetWebsite[] }>(
        'list-datapack-import-scopes',
    );

    const { load: loadScopes, settled } = scopes;
    useEffect(() => {
        // Once: Back and forward must keep what was ticked, and a new list would tick them all again.
        if (wanted && !settled) loadScopes({});
    }, [wanted, settled, loadScopes]);

    const websites = useMemo(() => scopes.value?.websites ?? EMPTY_WEBSITES, [scopes.value]);
    const storeViews = useMemo(
        () =>
            websites.flatMap((site) =>
                site.storeViews.map((view) => ({
                    code: view.code,
                    name: view.name,
                    websiteName: site.name,
                })),
            ),
        [websites],
    );

    // Every store view ticked as soon as the list arrives.
    useEffect(() => {
        setPickedViews(storeViews.map((view) => view.code));
    }, [storeViews]);

    const toggleView = useCallback(
        (code: string, on: boolean): void => setPickedViews((list) => toggled(list, code, on)),
        [],
    );
    const toggleKind = useCallback(
        (kind: string, on: boolean): void => setPickedKinds((list) => toggled(list, kind, on)),
        [],
    );

    const fields = useCallback((): AcoExportFields => {
        const someViews = pickedViews.length < storeViews.length;
        const someKinds = pickedKinds.length < ACO_EXPORT_KINDS.length;
        return {
            aco: true,
            ...(someViews ? { storeViews: pickedViews } : {}),
            ...(someKinds
                ? { dataTypes: ACO_EXPORT_KINDS.filter((k) => pickedKinds.includes(k)) }
                : {}),
        };
    }, [pickedViews, pickedKinds, storeViews.length]);

    // `!settled`: the read runs from an effect, so `loading` is still false on the first frame.
    const loadingViews = wanted && !settled;
    const viewsChosen = !loadingViews && (storeViews.length === 0 || pickedViews.length > 0);

    return {
        storeViews,
        loadingViews,
        pickedViews,
        toggleView,
        kinds: ACO_EXPORT_KINDS,
        pickedKinds,
        toggleKind,
        viewsChosen,
        fields,
    };
}
