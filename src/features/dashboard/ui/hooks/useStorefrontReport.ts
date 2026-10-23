/**
 * The storefront report's window on the dashboard (EDS-64): whether it is open, and what
 * it shows.
 *
 * It opens from the Storefront zone's tile, from a push when the dashboard is already
 * open (`showStorefrontReport`), or because the dashboard was opened for it
 * (`takeStorefrontReportRequest`, asked once on mount: a push would arrive before this
 * listener). The report is read each time it opens, so it never shows a stale one.
 *
 * @module features/dashboard/ui/hooks/useStorefrontReport
 */

import { useCallback, useEffect, useState } from 'react';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type {
    GetStorefrontReportResponse,
    StorefrontReportView,
    TakeStorefrontReportRequestResponse,
} from '@/types/webviewPayloads';

/** What the window shows: the read under way, why it failed, or the report. */
export type StorefrontReportState =
    | { phase: 'loading' }
    | { phase: 'error'; message: string }
    | { phase: 'ready'; view: StorefrontReportView };

export interface StorefrontReportDialog {
    isOpen: boolean;
    open: () => void;
    close: () => void;
}

/**
 * The window's open state and the three ways it opens.
 *
 * @returns the state and the callbacks the screen binds
 */
export function useStorefrontReportDialog(): StorefrontReportDialog {
    const [isOpen, setOpen] = useState(false);
    const open = useCallback(() => setOpen(true), []);
    const close = useCallback(() => setOpen(false), []);

    useEffect(() => webviewClient.onMessage('showStorefrontReport', open), [open]);
    useEffect(() => {
        webviewClient.request<TakeStorefrontReportRequestResponse>('takeStorefrontReportRequest').then(
            (response) => {
                // A reply from a handler that failed carries no data: nothing to open.
                if (response?.data?.show) open();
            },
            () => undefined,
        );
    }, [open]);

    return { isOpen, open, close };
}

/**
 * Read the report for the window: once when it mounts, and again on `reload`.
 *
 * @returns what to show, and a way to read it again
 */
export function useStorefrontReport(): { state: StorefrontReportState; reload: () => void } {
    const [state, setState] = useState<StorefrontReportState>({ phase: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const reload = useCallback(() => setAttempt((n) => n + 1), []);

    useEffect(() => {
        let current = true;
        setState({ phase: 'loading' });
        webviewClient.request<GetStorefrontReportResponse>('getStorefrontReport').then(
            (response) => {
                if (!current) return;
                setState(
                    response?.success
                        ? { phase: 'ready', view: response.data }
                        : { phase: 'error', message: response?.error ?? 'No answer from Demo Builder.' },
                );
            },
            (error: unknown) => {
                if (current) setState({ phase: 'error', message: (error as Error).message });
            },
        );
        return () => {
            current = false;
        };
    }, [attempt]);

    return { state, reload };
}
