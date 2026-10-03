/**
 * The mapping step of a fill, wired for one ERP (AB-26y): once the ERP is filled, read its
 * own sales organizations (`GET settings/setup` on the ERP), Commerce's websites, and this
 * ERP's entry in the integration's list (`GET erp/erps`), and save each website's sales
 * organization onto the entry (`PATCH erp/erps`) only where none is set (`fillErpMapping`).
 *
 * It runs before the prices are published: the integration publishes a price to the websites
 * its mapping names for the sales organization, so the mapping is in place first.
 *
 * Never throws: a read or a write that fails is a note, and the fill still stands. An
 * integration deployed before it kept per-ERP settings (`erp/erps`) is skipped with a
 * progress step, the way one without a key map is.
 *
 * A composition file: it wires the ERP's route, the integration's client and the fill's
 * Commerce reader into the pure rule.
 *
 * @module features/project-creation/services/erpMappingAfterFill
 */

import type { AppManagementAuth } from '@/features/app-builder/services/appManagementClient';
import {
    clause,
    fillErpMapping,
    mappingNotes,
    type ErpMappingReport,
    type ErpSalesOrganization,
} from '@/features/app-builder/services/erpFillMapping';
import { listWebsites, type CommerceGet } from '@/features/app-builder/services/erpFillReaders';
import {
    callErpApi,
    type ErpIntegrationClient,
} from '@/features/app-builder/services/erpIntegrationClient';

interface MappingAfterFillArgs {
    /** The ERP just filled: its component id, its id in the integration's list, its URLs. */
    erp: { componentId: string; listId: string; deployedUrls: Record<string, string> | undefined };
    client: ErpIntegrationClient;
    /** The fill's Commerce reader. */
    get: CommerceGet;
    auth: AppManagementAuth;
    fetchImpl: typeof fetch;
    onProgress?: (step: string) => void;
}

const SKIPPED_OLD_INTEGRATION =
    'The integration keeps no per-ERP settings yet; update it to have its mapping filled';

function textOrNull(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

/** The ERP's own sales organizations; none for an ERP that answers no such list. */
async function salesOrganizationsOf(args: MappingAfterFillArgs): Promise<ErpSalesOrganization[]> {
    const { erp, auth, fetchImpl } = args;
    const answer = await callErpApi(
        erp.deployedUrls,
        auth,
        'GET',
        'settings/setup',
        undefined,
        fetchImpl,
    );
    if ('refusal' in answer) throw new Error(answer.refusal);
    if (!answer.ok) throw new Error(`the ERP's setup answered ${answer.status}: ${answer.detail}`);
    const listed = (answer.body as { salesOrganizations?: unknown } | null)?.salesOrganizations;
    if (!Array.isArray(listed)) return [];
    return listed.flatMap((row: Record<string, unknown> | null) => {
        const code = textOrNull(row?.code);
        if (!code) return [];
        return [
            {
                code,
                name: textOrNull(row?.name) ?? code,
                currency: textOrNull(row?.currency),
                websiteCode: textOrNull(row?.websiteCode),
            },
        ];
    });
}

/** This ERP's own settings on the integration's list; throws when the list does not hold it. */
async function entrySettingsOf(client: ErpIntegrationClient, listId: string): Promise<unknown> {
    const entry = (await client.listErps()).find((listed) => listed.id === listId);
    if (!entry) throw new Error(`the integration does not list ERP "${listId}"`);
    return entry.settings;
}

/**
 * Fill one ERP's unset website mappings after its fill.
 *
 * @param args - the ERP, the integration's client, Commerce, the sign-in, progress
 * @returns the step's report (absent when it was skipped or could not read), and a note
 *   when a read or a write failed
 */
export async function mapAfterFill(
    args: MappingAfterFillArgs,
): Promise<{ mapping?: ErpMappingReport; note?: string }> {
    const { erp, client, onProgress } = args;
    if (!client.keepsErpList()) {
        onProgress?.(SKIPPED_OLD_INTEGRATION);
        return {};
    }
    onProgress?.("Filling the integration's mapping");
    try {
        const mapping = await fillErpMapping(erp.componentId, {
            salesOrganizations: () => salesOrganizationsOf(args),
            websiteCodes: async () => (await listWebsites(args.get)).map((site) => site.code),
            entrySettings: () => entrySettingsOf(client, erp.listId),
            save: async (website, values) => {
                await client.updateErpSettings(erp.listId, website, values);
            },
        });
        const { said, warning } = mappingNotes(mapping);
        if (said) onProgress?.(said);
        // The note is also a step, so the progress (and the Debug Logs) say it.
        if (warning) onProgress?.(warning);
        return { mapping, ...(warning ? { note: warning } : {}) };
    } catch (error) {
        const reason = clause(error instanceof Error ? error.message : String(error));
        const note = `Demo data loaded; the integration's mapping was not filled: ${reason}. Load demo data again to retry.`;
        onProgress?.(note);
        return { note };
    }
}
