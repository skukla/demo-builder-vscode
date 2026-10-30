/**
 * The export screen's ACO choices (datapack-engine step 14 item 19): for an Adobe Commerce
 * Optimizer pack, which store views and which ACO kinds. Whether the pack is one is asked once,
 * before this screen, by "Create datapack" (`CreateDatapackModal`).
 *
 * The store views come from the same discovery the import's target picker reads
 * (`list-datapack-import-scopes`), asked only once the ACO choice is made. Every store view and
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
    /** The pack made is an ACO pack. */
    isAco: boolean;
    storeViews: AcoStoreViewChoice[];
    loadingViews: boolean;
    pickedViews: string[];
    toggleView: (code: string, on: boolean) => void;
    kinds: readonly string[];
    pickedKinds: string[];
    toggleKind: (kind: string, on: boolean) => void;
    /** At least one store view (when there are any) and one kind ticked. */
    ready: boolean;
    /** The request fields; every one ticked is sent as none named. */
    fields: () => AcoExportFields;
}

const EMPTY_WEBSITES: TargetWebsite[] = [];

const toggled = (list: string[], item: string, on: boolean) =>
    on ? [...new Set([...list, item])] : list.filter((x) => x !== item);

/**
 * @param isAco - the pack made is an ACO pack, as the SC chose in "Create datapack"
 *   (`CreateDatapackModal`); the store views are read only then
 */
export function useAcoExportChoice(isAco: boolean): AcoExportChoice {
    const [pickedViews, setPickedViews] = useState<string[]>([]);
    const [pickedKinds, setPickedKinds] = useState<string[]>([...ACO_EXPORT_KINDS]);
    const scopes = useDataInstallerRequest<{ websites: TargetWebsite[] }>(
        'list-datapack-import-scopes',
    );

    const loadScopes = scopes.load;
    useEffect(() => {
        if (isAco) loadScopes({});
    }, [isAco, loadScopes]);

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

    const ready =
        pickedKinds.length > 0 &&
        (storeViews.length === 0 || pickedViews.length > 0) &&
        !scopes.loading;

    return {
        isAco,
        storeViews,
        loadingViews: scopes.loading,
        pickedViews,
        toggleView,
        kinds: ACO_EXPORT_KINDS,
        pickedKinds,
        toggleKind,
        ready,
        fields,
    };
}
