/**
 * Delete a system's records before it is removed (the ERP's `POST admin/wipe`).
 *
 * An undeploy removes a system's code, not the workspace database behind it.
 * Without this, a removed ERP's records stayed there with nothing left to reach
 * them, and a re-added ERP showed them again. The wipe action goes with the
 * undeploy, so removal calls it first. The ERP keeps its order-number counters
 * and settings through a wipe, by its own design.
 *
 * @module features/app-builder/services/systemRecordsWipe
 */

import type { AppManagementAuth } from './appManagementClient';
import { callWithIms } from './erpIntegrationClient';
import type { AppBuilderComponentCatalogEntry, WebActionCall } from '@/types/appBuilderComponents';

export interface SystemWipeResult {
    /** skipped: the entry declares no wipe, or its action was never deployed. */
    status: 'wiped' | 'skipped' | 'failed';
    /** Why it failed, in the action's words when it gave any. */
    detail?: string;
}

export interface SystemWipeDeps {
    getAuth: () => Promise<AppManagementAuth | undefined>;
    onProgress?: (message: string) => void;
    fetchImpl?: typeof fetch;
}

/**
 * A declared call's URL: the deployed URL of its action, plus its path. Shared
 * by the wipe (here) and the first sync (`recordSync.ts`).
 *
 * @param call - the entry's declared call
 * @param deployedUrls - the component's per-action URL map
 * @returns the URL, or undefined when that action was not deployed
 */
export function deriveActionCallUrl(
    call: WebActionCall,
    deployedUrls: Record<string, string> | undefined,
): string | undefined {
    const actionUrl = Object.values(deployedUrls ?? {}).find((url) => url.endsWith(`/${call.action}`));
    return actionUrl && `${actionUrl}/${call.path}`;
}

/**
 * Call the system's wipe, when it declares one.
 *
 * @param entry - the system's catalog entry
 * @param deployedUrls - the system's per-action URL map
 * @param name - what the SC calls the system, for the progress line
 * @param deps - sign-in, progress and fetch
 * @returns what happened; never throws
 */
export async function wipeSystemRecords(
    entry: Pick<AppBuilderComponentCatalogEntry, 'wipe'>,
    deployedUrls: Record<string, string> | undefined,
    name: string,
    deps: SystemWipeDeps,
): Promise<SystemWipeResult> {
    const url = entry.wipe && deriveActionCallUrl(entry.wipe, deployedUrls);
    if (!url) {
        return { status: 'skipped' };
    }
    deps.onProgress?.(`Deleting ${name}'s records`);
    const auth = await deps.getAuth();
    if (!auth) {
        return { status: 'failed', detail: 'could not sign in' };
    }
    try {
        const answer = await callWithIms(url, 'POST', auth, deps.fetchImpl ?? globalThis.fetch);
        return answer.ok ? { status: 'wiped' } : { status: 'failed', detail: `${answer.status}: ${answer.detail}` };
    } catch (error) {
        return { status: 'failed', detail: error instanceof Error ? error.message : String(error) };
    }
}
