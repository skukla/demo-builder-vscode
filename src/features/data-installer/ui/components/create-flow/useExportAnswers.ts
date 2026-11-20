/**
 * The answers an ACO export is made from, the request behind it, and its result (the `aco` route;
 * see `datapackFlowStages`). The Data Installer service's own export, with its list of Commerce
 * data types, was deleted on 2026-11-06 with its engine (DI-12).
 *
 * **The user NAMES the pack.** Nothing here guesses a name: both fields are typed and required.
 *
 * There is no activation id to watch, unlike an import, because an export returns inline. The
 * store views are read once, when the SC first reaches the screen that shows them, so Back and
 * forward keep what was ticked.
 *
 * @module features/data-installer/ui/components/create-flow/useExportAnswers
 */

import { useCallback, useState } from 'react';
import { type AcoExportChoice, useAcoExportChoice } from '../../hooks/useAcoExportChoice';
import { type DataInstallerFailure, useDataInstallerRequest } from '../../hooks/useDataInstallerRequest';
import { type ExportOutcome, exportResult } from '../ExportDatapackResult';
import type { ResultContent } from '../importResult';
import type { DatapackRoute } from './datapackFlowStages';
import type { DatapackId } from '@/types/datapack';

export interface ExportAnswers {
    name: string;
    version: string;
    setName: (value: string) => void;
    setVersion: (value: string) => void;
    named: boolean;
    aco: AcoExportChoice;
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
    const [dismissed, setDismissed] = useState(false);
    const run = useDataInstallerRequest<ExportOutcome>('start-datapack-export');
    const aco = useAcoExportChoice(asked && route === 'aco');

    const start = (): void => {
        setDismissed(false);
        run.load({ datapackName: name.trim(), version: version.trim(), ...aco.fields() });
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
        running: run.loading,
        start,
        dismissResult,
        result: resultOf(outcome, dismissed ? null : run.failure),
        savable: captured ? { name: name.trim(), version: version.trim() } : null,
    };
}
