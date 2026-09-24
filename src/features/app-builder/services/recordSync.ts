/**
 * Start a system's first sync from Commerce once the integration that serves it
 * is installed (the ERP integration's `POST erp/mirror?background=true`).
 *
 * The ERP's home screen says "the integration sends its records when it is
 * installed", and both READMEs said the same; until 2026-09-24 nothing made that
 * true. The install pass registered events and webhooks and stopped, and a fresh
 * pair sat empty (Bodea: five partners from the every-minute refresh, no
 * products, no import time) until someone found Sync records. This is that
 * button's call, made by the runner right after a SUCCESSFUL install. The
 * integration answers 202 at once and mirrors in the background, so the deploy
 * does not wait for it; the ERP's own last-import time says when it landed.
 *
 * @module features/app-builder/services/recordSync
 */

import type { AppManagementAuth } from './appManagementClient';
import { callWithIms } from './erpIntegrationClient';
import { deriveActionCallUrl } from './systemRecordsWipe';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';

export interface RecordSyncResult {
    /** skipped: the entry declares no sync, or its action was never deployed. */
    status: 'started' | 'skipped' | 'failed';
    /** Why it failed, in the action's words when it gave any. */
    detail?: string;
}

export interface RecordSyncDeps {
    getAuth: () => Promise<AppManagementAuth | undefined>;
    fetchImpl?: typeof fetch;
}

/**
 * Call the declared sync, when the entry declares one.
 *
 * @param entry - the integration's catalog entry
 * @param deployedUrls - the integration's per-action URL map
 * @param deps - sign-in and fetch
 * @returns what happened; never throws
 */
export async function startRecordSync(
    entry: Pick<AppBuilderComponentCatalogEntry, 'sync'>,
    deployedUrls: Record<string, string> | undefined,
    deps: RecordSyncDeps,
): Promise<RecordSyncResult> {
    const url = entry.sync && deriveActionCallUrl(entry.sync, deployedUrls);
    if (!url) {
        return { status: 'skipped' };
    }
    const auth = await deps.getAuth();
    if (!auth) {
        return { status: 'failed', detail: 'could not sign in' };
    }
    try {
        const answer = await callWithIms(url, 'POST', auth, deps.fetchImpl ?? globalThis.fetch);
        return answer.ok ? { status: 'started' } : { status: 'failed', detail: `${answer.status}: ${answer.detail}` };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}
