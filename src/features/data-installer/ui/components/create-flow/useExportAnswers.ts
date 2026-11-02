/**
 * The answers an export is made from, the requests behind them, and its result, for the routes that
 * export (`aco` and `service`; see `datapackFlowStages`).
 *
 * **The user NAMES the target.** An import writes into a Commerce instance the project already
 * identifies; an export writes into a catalog that 23 curated entries share. Nothing here guesses a
 * name: both fields are typed and required.
 *
 * **The type list is the EXPORT one.** `list-datapack-data-types` is asked with
 * `operationMode: 'export'`, which is a genuinely different set: `giftcards` has an import processor
 * and no export counterpart, so it is simply absent rather than offered and silently skipped.
 *
 * **A failure carries its reason.** The service answers a failed export with an all-zero summary and
 * no explanation unless `verbose` is sent; the write client always sends it, and the result renders
 * what comes back (`ExportDatapackResult`). There is no activation id to watch, unlike an import,
 * because an export returns inline.
 *
 * Each list is read once, when the SC first reaches the screen that shows it, so Back and forward
 * keep what was ticked.
 *
 * @module features/data-installer/ui/components/create-flow/useExportAnswers
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { type AcoExportChoice, useAcoExportChoice } from '../../hooks/useAcoExportChoice';
import { type DataInstallerFailure, useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import { type ExportOutcome, exportResult } from '../ExportDatapackResult';
import type { ResultContent } from '../importResult';
import type { DatapackRoute } from './datapackFlowStages';
import type { DatapackId } from '@/types/datapack';

/** The Commerce data types an export can take, and how they stand. */
export interface TypeChoices {
    available: string[];
    selected: string[];
    allSelected: boolean;
    /** Waiting for the list. */
    loading: boolean;
    error?: string;
    onToggle: (dataType: string, isSelected: boolean) => void;
    onToggleAll: () => void;
}

export interface ExportAnswers {
    name: string;
    version: string;
    setName: (value: string) => void;
    setVersion: (value: string) => void;
    named: boolean;
    aco: AcoExportChoice;
    types: TypeChoices;
    running: boolean;
    start: () => void;
    /** Back from a result, to the form. */
    dismissResult: () => void;
    /** The outcome to show, once there is one. */
    result: ResultContent | null;
    /** What "Save as file" saves, once something was captured. */
    savable: DatapackId | null;
}

/** The result to show, unless Back was pressed on it. */
function resultOf(outcome: ExportOutcome | null, failure: DataInstallerFailure | null): ResultContent | null {
    return outcome || failure ? exportResult(outcome, failure?.message) : null;
}

/**
 * @param route - the route the SC is on, once a pack type is chosen
 * @param asked - the SC has gone past the pack type, so the route's lists are wanted
 */
export function useExportAnswers(route: DatapackRoute | undefined, asked: boolean): ExportAnswers {
    const [name, setName] = useState('');
    const [version, setVersion] = useState('');
    const [selected, setSelected] = useState<string[]>([]);
    const [dismissed, setDismissed] = useState(false);

    // `dataTypes` is a STRING ARRAY: `getProcessorOrder` returns names, not objects. An earlier
    // version read `entry.dataType` off each, which rendered an empty list; the fixture agreed
    // with the bug and the Extension Dev Host is what caught it.
    const types = useDataInstallerRequest<{ dataTypes?: string[] }>('list-datapack-data-types');
    const target = useDataInstallerRequest<{ instance?: string }>('get-datapack-import-target');
    const run = useDataInstallerRequest<ExportOutcome>('start-datapack-export');
    const aco = useAcoExportChoice(asked && route === 'aco');

    const wantsTypes = asked && route === 'service';
    const { load: loadTypes, settled: typesSettled } = types;
    const { load: loadTarget } = target;
    useEffect(() => {
        if (!wantsTypes || typesSettled) return;
        // `operationMode`, NOT `mode`: the handler refuses anything else, and a refusal here used
        // to render as an empty list with no explanation.
        loadTypes({ operationMode: 'export' });
        loadTarget({});
    }, [wantsTypes, typesSettled, loadTypes, loadTarget]);

    const available = useMemo(() => (types.value?.dataTypes ?? []).filter(Boolean), [types.value]);
    const onToggle = useCallback((dataType: string, isSelected: boolean): void => {
        setSelected((current) => (isSelected ? [...current, dataType] : current.filter((t) => t !== dataType)));
    }, []);
    const allSelected = available.length > 0 && selected.length === available.length;
    // Selecting all takes the service's own order, so the request carries the types in the
    // sequence the processors run rather than in click order.
    const onToggleAll = useCallback((): void => setSelected(allSelected ? [] : [...available]), [allSelected, available]);

    const start = (): void => {
        setDismissed(false);
        const id = { datapackName: name.trim(), version: version.trim() };
        const commerce = { commerceInstance: target.value?.instance ?? '', dataTypes: selected };
        run.load(route === 'aco' ? { ...id, ...aco.fields() } : { ...id, ...commerce });
    };
    const dismissResult = useCallback((): void => setDismissed(true), []);

    const outcome = dismissed ? null : run.value;
    const captured = outcome?.perType?.some((row) => row.success);
    return {
        name,
        version,
        setName,
        setVersion,
        named: name.trim().length > 0 && version.trim().length > 0,
        aco,
        types: {
            available,
            selected,
            allSelected,
            // `!settled` too: `loading` starts false and the fetch runs from an effect, so frame 1
            // would otherwise draw an empty list.
            loading: !types.failure && (types.loading || !types.settled),
            error: types.failure?.message,
            onToggle,
            onToggleAll,
        },
        running: run.loading,
        start,
        dismissResult,
        result: resultOf(outcome, dismissed ? null : run.failure),
        savable: captured ? { name: name.trim(), version: version.trim() } : null,
    };
}
