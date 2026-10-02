/**
 * The mock ERP's demo controls as a modal uses them (AB-59): read the ERP's look and any
 * simulated downtime once as the modal opens, then run a control and keep what the ERP answered.
 *
 * Every call is a request the extension ANSWERS (Pattern B): a refusal arrives as
 * `{ success: false, error }`, not a rejection, so the envelope is typed and branched on.
 *
 * @module features/dashboard/ui/hooks/useErpDemoControls
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type {
    ErpAppearance,
    ErpDemoControlsResult,
    ErpMaintenance,
} from '@/types/erpDemoControls';

/** Which ERP's which control is open: the integration that serves it, the ERP, its name. */
export interface ErpDemoControlTarget {
    /** The ERP integration's id (every ERP call goes through it). */
    id: string;
    /** The ERP's component id. */
    erp: string;
    name: string;
    control: 'appearance' | 'downtime';
}

/** The ERP as the controls show it: its look, and the downtime running now (or null). */
export interface ErpDemoState {
    appearance: ErpAppearance | null;
    maintenance: ErpMaintenance | null;
}

export interface ErpDemoControls {
    /** Null until the ERP has been read. */
    state: ErpDemoState | null;
    /** Why the last read or control did not go through, in the extension's words. */
    error: string | null;
    busy: boolean;
    /** Run one control; resolves whether the ERP took it. */
    run: (type: string, payload: object) => Promise<boolean>;
}

/**
 * One request, answered. A request that rejects did not reach an answer at all (the webview's
 * request timed out, say): an honest generic, never the transport's own words.
 */
async function ask(type: string, payload: object): Promise<ErpDemoControlsResult> {
    try {
        return await webviewClient.request<ErpDemoControlsResult>(type, payload);
    } catch {
        return { success: false, error: 'No answer came back from the ERP. Try again.' };
    }
}

/** The state after an answer: only the fields the answer carries change. */
function merged(prev: ErpDemoState | null, data: ErpDemoControlsResult['data']): ErpDemoState {
    const next: ErpDemoState = prev ?? { appearance: null, maintenance: null };
    if (!data) return next;
    return {
        appearance: data.appearance === undefined ? next.appearance : data.appearance,
        maintenance: data.maintenance === undefined ? next.maintenance : data.maintenance,
    };
}

/**
 * Read the ERP as the modal opens, and run its controls.
 *
 * @param target - the open control (the modal mounts per opening, so each starts fresh)
 * @returns the ERP's state, the last refusal, whether a call is in flight, and the runner
 */
export function useErpDemoControls(target: ErpDemoControlTarget): ErpDemoControls {
    const { id, erp } = target;
    const [state, setState] = useState<ErpDemoState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);

    useEffect(() => {
        let live = true;
        void ask('getErpDemoControls', { id, erp }).then((result) => {
            if (!live) return;
            if (result.success) setState((prev) => merged(prev, result.data));
            else setError(result.error ?? 'Could not read the ERP.');
            setBusy(false);
        });
        return () => {
            live = false;
        };
    }, [id, erp]);

    const run = useCallback(
        async (type: string, payload: object): Promise<boolean> => {
            setBusy(true);
            setError(null);
            const result = await ask(type, { id, erp, ...payload });
            setBusy(false);
            if (!result.success) {
                setError(result.error ?? 'The ERP did not take the change.');
                return false;
            }
            setState((prev) => merged(prev, result.data));
            return true;
        },
        [id, erp],
    );

    return { state, error, busy, run };
}
