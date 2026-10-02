/**
 * The mock ERP's simulated downtime as its modal uses it (AB-59): read any downtime running once
 * as the modal opens, then start or end one and keep what the ERP answered.
 *
 * Every call is a request the extension ANSWERS (Pattern B): a refusal arrives as
 * `{ success: false, error }`, not a rejection, so the envelope is typed and branched on.
 *
 * @module features/dashboard/ui/hooks/useErpDemoControls
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { ErpDemoControlsResult, ErpMaintenance } from '@/types/erpDemoControls';

/** Which ERP the modal is open on: the integration that serves it, the ERP, its name. */
export interface ErpDemoControlTarget {
    /** The ERP integration's id (every ERP call goes through it). */
    id: string;
    /** The ERP's component id. */
    erp: string;
    name: string;
}

/** The ERP as the modal shows it: the downtime running now (or null). */
export interface ErpDemoState {
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

/** The state after an answer: the window changes only when the answer carries one. */
function merged(prev: ErpDemoState | null, data: ErpDemoControlsResult['data']): ErpDemoState {
    const next: ErpDemoState = prev ?? { maintenance: null };
    if (data?.maintenance === undefined) return next;
    return { maintenance: data.maintenance };
}

/**
 * Read the ERP as the modal opens, and run its controls.
 *
 * @param target - the ERP the modal is open on (it mounts per opening, so each starts fresh)
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
