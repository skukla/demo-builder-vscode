/**
 * "What is installed" and "what happened", from both engines (datapack step 14, item 17).
 *
 * `list-installed-datapacks` and `get-datapack-activity` read the service, which knows only its
 * own installs and runs. Demo Builder's engine keeps its own beside the open project (its install
 * records and its activity log, `services/engineHistory.ts`), so these put those rows FIRST and
 * the service's after, each tagged with its `source`.
 *
 * Paging spans the two as one list: `skip` and `limit` count our rows first, and the service is
 * asked only for the part of the page that falls past them. That keeps the Activity tab's
 * "Load 50 more", which asks for `skip: <rows it has>`, from skipping or repeating a row.
 *
 * Either source failing costs only its own rows, and says why (`serviceError`, `engineError`),
 * as the catalog does for the library. With no rows of ours and nothing wrong with them, a
 * service failure is answered exactly as before, so its sign-in and settings fixes still show.
 *
 * @module features/data-installer/handlers/engineHistoryReads
 */

import { readProjectRecords, nodeRecordFiles } from '../services/demoBuilderEngine/installRecord';
import { nodeActivityFiles, readEngineActivity } from '../services/engineActivityLog';
import { type HistoryFilter, engineActivityRows, engineInstalledRows } from '../services/engineHistory';
import { deriveImportInstance } from '../services/importInstance';
import type { ActivityEntry, DatapackEngineId, HistoryPage, InstalledDatapack, Page } from '../types';
import type { Project } from '@/types/base';
import type { HandlerContext, HandlerResponse } from '@/types/handlers';

/** Paging as both reads take it. */
export interface HistoryPaging {
    limit?: number;
    skip?: number;
}

/** The service's half: one page of its rows for the paging asked, behind the usual guard. */
export type ServiceHistoryPage = (paging: HistoryPaging) => Promise<HandlerResponse>;

/** Our rows, or why they could not be read. */
interface EngineRows<T> {
    rows: T[];
    error?: string;
}

const LOG_PREFIX = '[Data Installer]';
const SERVICE_UNREAD = 'The Data Installer could not be read.';

async function engineRows<T>(
    context: HandlerContext,
    read: (project: Project, instance: string | undefined) => Promise<T[]>,
): Promise<EngineRows<T>> {
    const project = await context.stateManager.getCurrentProject();
    if (!project) return { rows: [] };
    try {
        return { rows: await read(project, deriveImportInstance(project.componentConfigs)) };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.warn(`${LOG_PREFIX} Demo Builder's datapack records could not be read: ${message}`);
        return { rows: [], error: `Demo Builder's own records could not be read: ${message}` };
    }
}

/** The service's ask for the part of the page past our rows, and whether it is only for its total. */
function servicePaging(rows: number, shown: number, paging: HistoryPaging): { query: HistoryPaging; totalOnly: boolean } {
    const room = paging.limit === undefined ? undefined : paging.limit - shown;
    return {
        query: {
            // No room left on the page: one row is asked for, only to learn the service's total.
            ...(room !== undefined ? { limit: Math.max(1, room) } : {}),
            ...(paging.skip !== undefined ? { skip: Math.max(0, paging.skip - rows) } : {}),
        },
        totalOnly: room === 0,
    };
}

/**
 * Our rows first, then the service's, paged as one list.
 *
 * @param ours - Demo Builder's rows for the filter, or why there are none
 * @param paging - the caller's `limit` and `skip`
 * @param servicePage - the service's page for an adjusted `limit` and `skip`
 */
export async function mergeHistory<T extends { source?: DatapackEngineId }>(
    ours: EngineRows<T>,
    paging: HistoryPaging,
    servicePage: ServiceHistoryPage,
): Promise<HandlerResponse> {
    const skip = paging.skip ?? 0;
    const shown = ours.rows.slice(skip, paging.limit === undefined ? undefined : skip + paging.limit);
    const { query, totalOnly } = servicePaging(ours.rows.length, shown.length, paging);
    const service = await servicePage(query);
    const engineError = ours.error ? { engineError: ours.error } : {};
    if (!service.success) {
        if (ours.rows.length === 0 && !ours.error) return service;
        const data: HistoryPage<T> = {
            items: shown,
            count: shown.length,
            total: ours.rows.length,
            serviceError: service.error ?? SERVICE_UNREAD,
            ...engineError,
        };
        return { success: true, data };
    }
    const theirs = service.data as Page<T>;
    const items = [...shown, ...(totalOnly ? [] : theirs.items.map((row) => ({ ...row, source: 'service' as const })))];
    const data: HistoryPage<T> = {
        items,
        count: items.length,
        ...(theirs.total !== undefined ? { total: theirs.total + ours.rows.length } : {}),
        ...(paging.limit !== undefined ? { limit: paging.limit } : {}),
        ...(paging.skip !== undefined ? { skip: paging.skip } : {}),
        ...engineError,
    };
    return { success: true, data };
}

/** `list-installed-datapacks`: the project's install records, then the service's tracking. */
export async function installedFromBoth(
    context: HandlerContext,
    payload: HistoryFilter & HistoryPaging,
    servicePage: ServiceHistoryPage,
): Promise<HandlerResponse> {
    const ours = await engineRows<InstalledDatapack>(context, async (project, instance) =>
        engineInstalledRows(await readProjectRecords(nodeRecordFiles, project.path), instance, payload),
    );
    return mergeHistory(ours, payload, servicePage);
}

/** `get-datapack-activity`: the project's activity log, then the service's request log. */
export async function activityFromBoth(
    context: HandlerContext,
    payload: HistoryFilter & HistoryPaging,
    servicePage: ServiceHistoryPage,
): Promise<HandlerResponse> {
    const ours = await engineRows<ActivityEntry>(context, async (project, instance) =>
        engineActivityRows(await readEngineActivity(nodeActivityFiles, project.path), instance, payload),
    );
    return mergeHistory(ours, payload, servicePage);
}
