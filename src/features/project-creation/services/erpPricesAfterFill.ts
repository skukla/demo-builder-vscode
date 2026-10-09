/**
 * The prices step that ends every ERP fill (AB-26z): the integration publishes the filled
 * ERP's customer prices into each company's shared catalog (`POST erp/prices`). What it says
 * afterwards is the fill's `warning` (the SC retries), its `note` (nothing to do) or neither.
 *
 * @module features/project-creation/services/erpPricesAfterFill
 */

import { ErpActionStillRunningError } from '@/features/app-builder/services/erpActionRun';
import { clause } from '@/features/app-builder/services/erpFillMapping';
import {
    ErpIntegrationApiError,
    type ErpIntegrationClient,
} from '@/features/app-builder/services/erpIntegrationClient';

/** The prices the integration published after a fill: tier prices written, removed, kept, and companies skipped. */
export interface ErpPricesPublished {
    written: number;
    removed: number;
    unchanged: number;
    skipped: number;
}

/** The warning for prices that did not get published after a fill that did: the SC retries. */
function pricesWarning(reason: string): string {
    return `Demo data loaded; ${reason}. Load demo data again to retry.`;
}

/**
 * The gateway's answer when a web call passes the 60 s it may wait: the action keeps running
 * (to its own limit, 300 s) and the writes land. Measured 2026-10-01: a publish of 72
 * contract prices answered this twice and landed both times. The client follows the run to
 * its end when the integration records price runs; against one that does not, the 504 comes
 * back as it is and is not a publish that failed.
 */
const ANSWER_CUT_OFF = 504;

/**
 * The note for a publish still running once the fill has answered: nothing for the SC to
 * do, so no plumbing words (owner, 2026-10-09: the first wording named Runtime, a 60-second
 * limit and a ledger, and showed as a warning for something going fine).
 */
const STILL_PUBLISHING_NOTE =
    'Demo data loaded. Prices are still being published and will finish by themselves in a few minutes.';

/** Whether the publish is still running: a cut-off answer, or a follow that ran out of time. */
function stillPublishing(error: unknown): boolean {
    if (error instanceof ErpActionStillRunningError) return true;
    return error instanceof ErpIntegrationApiError && error.status === ANSWER_CUT_OFF;
}

/** What the prices step says after a fill: counts, a warning to act on, or a note to know. */
interface PricesAfterFill {
    prices?: ErpPricesPublished;
    warning?: string;
    note?: string;
}

/**
 * Publish one ERP's prices after its fill. A deployment without `erp/prices` is silent; a
 * publish that fails, whole or for some companies, is a warning, never a failed fill; one
 * still running is a note.
 */
export async function publishPricesAfterFill(
    client: ErpIntegrationClient,
    listId: string,
    onProgress?: (step: string) => void,
): Promise<PricesAfterFill> {
    if (!client.publishesPrices()) return {};
    onProgress?.('Publishing prices');
    const published = await publishedOrSaid(client, listId, onProgress);
    // What it says is also a step, so the progress (and the Debug Logs, which record each step) say it.
    const said = published.warning ?? published.note;
    if (said) onProgress?.(said);
    return published;
}

/** The publish's counts, a warning when it failed whole or for some companies, a note when it runs on. */
async function publishedOrSaid(
    client: ErpIntegrationClient,
    listId: string,
    onProgress?: (step: string) => void,
): Promise<PricesAfterFill> {
    try {
        const report = await client.publishPrices(listId, onProgress);
        const prices = {
            written: report.written,
            removed: report.removed,
            unchanged: report.unchanged,
            skipped: report.skipped.length,
        };
        if (report.failed.length === 0) return { prices };
        const companies =
            report.failed.length === 1 ? '1 company' : `${report.failed.length} companies`;
        return {
            prices,
            warning: pricesWarning(
                `prices for ${companies} were not published: ${clause(report.failed[0].error)}`,
            ),
        };
    } catch (error) {
        if (stillPublishing(error)) return { note: STILL_PUBLISHING_NOTE };
        const message = error instanceof Error ? error.message : String(error);
        return { warning: pricesWarning(`prices were not published: ${clause(message)}`) };
    }
}
