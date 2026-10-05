/**
 * The Site access screen's service layer (ADR-017: hooks are the service layer).
 *
 * Every handler answers Pattern B — it RETURNS what the screen shows next —
 * and a refusal arrives as a `{success:false}` envelope rather than a rejection,
 * so both are flattened here into one `notice`.
 *
 * @module features/eds/ui/siteAccess/useSiteAccess
 */

import { useCallback, useState } from 'react';
import { useVSCodeMessage } from '@/core/ui/hooks/useVSCodeMessage';
import { webviewClient } from '@/core/ui/utils/WebviewClient';
import type { HandlerResponse } from '@/types/handlers';
import { SITE_ACCESS_PROGRESS_MESSAGE } from '@/types/messages';
import type {
    SiteAccessChangeResult,
    SiteAccessLink,
    SiteAccessNotice,
    SiteAccessView,
} from '@/types/webviewPayloads';

/** The wait polls for ~105s; the host also sends a timeout hint for it. */
const WAIT_TIMEOUT_MS = 180_000;

export interface SiteTarget {
    org: string;
    site: string;
}

export type ChangeType = 'addSiteAdmin' | 'removeSiteAdmin' | 'addContentReader' | 'removeContentReader';

export interface SiteAccessState {
    view: SiteAccessView | null;
    /** What the last action said — kept until the next one. */
    notice: SiteAccessNotice | null;
    /** What is running, in words; null when idle. */
    busy: string | null;
    /** The wait's own progress line ("Checking access 2 of 4"). */
    progress: string | null;
    load: (target?: SiteTarget) => Promise<void>;
    change: (type: ChangeType, email: string, target?: SiteTarget) => Promise<boolean>;
    waitForAccess: () => Promise<void>;
    openLink: (id: SiteAccessLink['id']) => void;
    repair: () => void;
}

function failureNotice(error: unknown): SiteAccessNotice {
    const message = error instanceof Error ? error.message : String(error);
    return { tone: 'error', message };
}

async function ask<T>(type: string, payload?: unknown, timeout?: number): Promise<T> {
    const response = await webviewClient.request<HandlerResponse>(type, payload, timeout);
    if (!response?.success) throw new Error(response?.error ?? 'The request did not succeed.');
    return response.data as T;
}

export function useSiteAccess(): SiteAccessState {
    const [view, setView] = useState<SiteAccessView | null>(null);
    const [notice, setNotice] = useState<SiteAccessNotice | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [progress, setProgress] = useState<string | null>(null);

    useVSCodeMessage<{ message?: string }>(SITE_ACCESS_PROGRESS_MESSAGE, (data) => setProgress(data?.message ?? null));

    const load = useCallback(async (target?: SiteTarget): Promise<void> => {
        setBusy('Reading site access');
        setNotice(null);
        try {
            setView(await ask<SiteAccessView>('getSiteAccess', { target }));
        } catch (error) {
            setNotice(failureNotice(error));
        } finally {
            setBusy(null);
        }
    }, []);

    const settle = useCallback(async (
        busyMessage: string,
        run: () => Promise<SiteAccessChangeResult>,
    ): Promise<boolean> => {
        setBusy(busyMessage);
        setNotice(null);
        try {
            const result = await run();
            setView(result.view);
            setNotice(result.notice);
            return result.notice.tone === 'success';
        } catch (error) {
            setNotice(failureNotice(error));
            return false;
        } finally {
            setBusy(null);
            setProgress(null);
        }
    }, []);

    const change = useCallback(
        (type: ChangeType, email: string, target?: SiteTarget): Promise<boolean> =>
            settle(type.startsWith('add') ? 'Adding' : 'Removing', () =>
                ask<SiteAccessChangeResult>(type, { email, target }),
            ),
        [settle],
    );

    const waitForAccess = useCallback(async (): Promise<void> => {
        await settle('Waiting for site access', () =>
            ask<SiteAccessChangeResult>('waitForSiteAccess', undefined, WAIT_TIMEOUT_MS),
        );
    }, [settle]);

    const openLink = useCallback((id: SiteAccessLink['id']): void => {
        void ask('openSiteAccessLink', { id }).catch((error: unknown) => setNotice(failureNotice(error)));
    }, []);

    const repair = useCallback((): void => {
        void ask('repairSiteConfiguration').catch((error: unknown) => setNotice(failureNotice(error)));
    }, []);

    return { view, notice, busy, progress, load, change, waitForAccess, openLink, repair };
}
