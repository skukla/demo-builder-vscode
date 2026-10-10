/**
 * Data Installer export client — Stage 3: capture a datapack FROM an instance.
 *
 * Split out of `dataInstallerWriteClient.ts` (decompose-god-file, 2026-10-08).
 * The import/validate/delete writes all drive ONE endpoint pair with one body
 * shape; the export is a different two-step contract (`get-export-items`, then
 * `process-datapack` with `operation_mode: 'export'`) with its own headers, body,
 * and response shapes, and it changes when the service's export path changes.
 *
 * Same dependencies as the write client — the IMS bearer, a base URL and a log
 * sink — so it takes the same {@link DataInstallerWriteClientDeps}.
 *
 * @module features/data-installer/services/dataInstallerExportClient
 */

import type { DatapackId } from '../types';
import { actionUrl } from './dataInstallerConfig';
import { DataInstallerApiError } from './dataInstallerErrors';
import {
    type CommerceCredentials,
    type DataInstallerWriteClientDeps,
    type WriteMode,
    credentialFields,
    describe,
    safeParse,
} from './dataInstallerWriteClient';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Everything one EXPORT needs — capturing a pack FROM an instance.
 *
 * Carries BOTH instance forms on purpose. `process-datapack` accepts the ACCS
 * tenant id (its pre-flight passes; our imports have always used it), while
 * `get-export-items` refuses it and demands a full URL, because the deployment
 * config that enables the id shorthand (`COMMERCE_INSTANCE_URL_TEMPLATE`) is not
 * set for that action. Sending each what it accepts beats pretending they agree.
 */
export interface ExportRequest {
    id: DatapackId;
    /** What `process-datapack` takes — the tenant id for ACCS. */
    commerceInstance: string;
    /** What `get-export-items` takes — the Commerce REST base URL. */
    restBaseUrl: string;
    dataTypes: string[];
    credentials: CommerceCredentials;
    /**
     * Chosen items per data type, as `{<type>: {<idField>: [ids]}}`. Omitted
     * entirely when the user picked nothing — the service then exports
     * everything the exclusion rules allow.
     */
    selections?: Record<string, Record<string, Array<string | number>>>;
}

/** One selectable item from `get-export-items`. */
export interface ExportItem {
    id: string | number;
    displayName: string;
}

/** A page of selectable items, plus what the service will drop regardless. */
export interface ExportItemPage {
    items: ExportItem[];
    totalCount: number;
    /**
     * Items the service's own exclusion rules remove. Surfaced because "8 of 9,
     * one excluded" is the difference between a filter working and a pack
     * quietly missing something.
     */
    excludedCount: number;
}

/** What one data type's export did. */
export interface ExportTypeOutcome {
    dataType: string;
    success: boolean;
    exported: number;
    excluded: number;
    /** The per-endpoint reason, which only `verbose` returns. */
    reason?: string;
}

export interface ExportOutcome {
    success: boolean;
    perType: ExportTypeOutcome[];
}

/**
 * The IMS scope an ACCS instance needs on the list call.
 *
 * Undocumented in the service's source drop, listed as an optional
 * `x-client-scope` header in the wiki, and required in practice: without it
 * `get-export-items` fails pre-flight for every site type.
 */
const ACCS_EXPORT_SCOPE = [
    'openid',
    'AdobeID',
    'email',
    'profile',
    'additional_info.projectedProductContext',
    'additional_info.roles',
    'commerce.accs',
].join(',');

export class DataInstallerExportClient {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DataInstallerWriteClientDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.NORMAL;
    }

    /**
     * What this instance holds for a data type, so the user can choose.
     *
     * Step 1 of the documented two-step export. A GET, with `data_type` as a
     * QUERY parameter: Runtime routes on the last path segment, so the docs'
     * `/get-export-items/:data_type` form routes nowhere and the action reports
     * a missing `data_type`.
     */
    async listExportItems(request: ExportRequest, dataType: string): Promise<ExportItemPage> {
        const query = new URLSearchParams({ data_type: dataType, page: '1', page_size: '1000' });
        const url = `${actionUrl(this.deps.baseUrl, 'get-export-items')}?${query}`;
        const response = await this.fetchImpl(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${await this.deps.getToken()}`,
                // The FULL REST URL — this action cannot resolve a tenant id.
                'x-commerce-instance': request.restBaseUrl,
                ...exportAuthHeaders(request.credentials),
            },
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const body = safeParse(await response.text());
        this.deps.log?.(`get-export-items (${dataType}) → ${response.status}`);
        if (!response.ok) {
            throw new DataInstallerApiError(
                describe(body) ?? `Could not list ${dataType} to export (HTTP ${response.status}).`,
                response.status,
                'get-export-items',
            );
        }
        return parseExportItemPage(body);
    }

    /**
     * Capture the chosen data into a datapack.
     *
     * **`verbose` is always sent.** Without it the service answers a failed
     * export with `success: false`, an all-zero `entity_summary` and no reason
     * at all — the silence that cost a day of guessing. With it, the real
     * per-endpoint error comes back and reaches the user.
     */
    async startExport(request: ExportRequest): Promise<ExportOutcome> {
        const url = actionUrl(this.deps.baseUrl, 'process-datapack');
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.deps.getToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildExportBody(request)),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const body = safeParse(await response.text());
        this.deps.log?.(`process-datapack (export) → ${response.status}`);
        if (!response.ok) {
            throw new DataInstallerApiError(
                describe(body) ?? `The export could not be started (HTTP ${response.status}).`,
                response.status,
                'process-datapack',
            );
        }
        return parseExportOutcome(body);
    }
}

/**
 * Auth headers for the list call, by backend.
 *
 * ACCS additionally needs `x-client-scope`: the source drop does not mention it,
 * the wiki lists it as optional, and without it the action fails pre-flight for
 * every site type.
 */
function exportAuthHeaders(credentials: CommerceCredentials): Record<string, string> {
    return credentials.kind === 'paas'
        ? { 'x-admin-username': credentials.username, 'x-admin-password': credentials.password }
        : {
              'x-client-id': credentials.clientId,
              'x-client-secret': credentials.clientSecret,
              'x-client-scope': ACCS_EXPORT_SCOPE,
          };
}

/**
 * The export wire body.
 *
 * `verbose: 'full'` is not optional here — see {@link DataInstallerExportClient.startExport}.
 * `MONGO_URI` is never sent: the service's own store-failure message invites
 * callers to pass it "in params", but it is the service's secret, this client
 * does not hold it, and a database URI has no place in a request body.
 */
function buildExportBody(request: ExportRequest): Record<string, unknown> {
    return {
        datapack_name: request.id.name,
        version: request.id.version,
        commerce_instance: request.commerceInstance,
        data_types: request.dataTypes,
        operation_mode: 'export' satisfies WriteMode,
        verbose: 'full',
        ...(request.selections ? { selections: toServiceSelections(request.selections) } : {}),
        ...credentialFields(request.credentials),
    };
}

/** `{type: {field: ids}}` → the service's `{type: {filters: {field: {operator, value}}}}`. */
function toServiceSelections(
    selections: Record<string, Record<string, Array<string | number>>>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [dataType, fields] of Object.entries(selections)) {
        const filters: Record<string, unknown> = {};
        for (const [field, ids] of Object.entries(fields)) {
            filters[field] = { operator: 'in', value: ids };
        }
        out[dataType] = { filters };
    }
    return out;
}

/** One page of selectable items, tolerating the shapes the service may widen to. */
function parseExportItemPage(body: unknown): ExportItemPage {
    const row = (body ?? {}) as {
        items?: Array<{ id?: unknown; display_name?: unknown }>;
        pagination?: { total_count?: unknown };
        excluded_count?: unknown;
    };
    const items = (row.items ?? [])
        .filter((item) => item?.id !== undefined)
        .map((item) => ({
            id: item.id as string | number,
            displayName: String(item.display_name ?? item.id),
        }));
    return {
        items,
        totalCount: Number(row.pagination?.total_count ?? items.length),
        excludedCount: Number(row.excluded_count ?? 0),
    };
}

/**
 * The export outcome, including the reason a failure only reveals under
 * `verbose` — it hides inside `responses.<endpoint>.error`.
 */
function parseExportOutcome(body: unknown): ExportOutcome {
    const row = (body ?? {}) as { success?: unknown; results?: unknown[] };
    const perType = (Array.isArray(row.results) ? row.results : []).map((entry) => {
        const result = (entry ?? {}) as {
            data_type?: unknown;
            success?: unknown;
            entity_counts?: { exported?: unknown; excluded?: unknown };
            entity_summary?: { exported?: unknown };
            responses?: Record<string, { error?: unknown }>;
        };
        return {
            dataType: String(result.data_type ?? ''),
            success: result.success === true,
            exported: Number(result.entity_counts?.exported ?? result.entity_summary?.exported ?? 0),
            excluded: Number(result.entity_counts?.excluded ?? 0),
            ...(firstResponseError(result.responses)
                ? { reason: firstResponseError(result.responses) }
                : {}),
        };
    });
    return { success: row.success === true, perType };
}

/** The first per-endpoint error text, whatever the endpoint happens to be called. */
function firstResponseError(responses?: Record<string, { error?: unknown }>): string | undefined {
    for (const entry of Object.values(responses ?? {})) {
        if (typeof entry?.error === 'string' && entry.error) {
            return entry.error;
        }
    }
    return undefined;
}
