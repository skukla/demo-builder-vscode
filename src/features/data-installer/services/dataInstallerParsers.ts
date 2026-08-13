/**
 * Wire→domain normalizers for the Data Installer API.
 *
 * THE containment layer. This is the only module permitted to read a `snake_case`
 * field, and every documented-vs-real divergence is absorbed by a named function
 * here so no handler, MCP tool or component can tell the upstream service is
 * inconsistent. The divergences, all verified against the live service:
 *
 * 1. `get-datapack-metadata` is FLAT — no `datapack` wrapper (docs say otherwise).
 * 2. `get-data-item`'s `data` is a JSON *string* (docs say object).
 * 3. `batch-get-data-items` returns `results[]`, not `items[]`.
 * 4. `overall_processing_time` uses the NORMAL spelling; the triple-s in the docs
 *    is the doc's typo. Both are read, normal first.
 * 5. `scenario` values contradict the documented enum, so it stays a string.
 * 6. A never-started job returns `200` with an EMPTY `data_types` map, not the
 *    documented `{"error":"No request log found…"}`.
 *
 * Parsing is deliberately LENIENT: unknown fields are ignored and an unusable row
 * is skipped rather than failing its whole list. A shape change upstream must
 * degrade the UI, never break it — which is why this uses hand-rolled readers
 * instead of a schema validator that would throw on a widened type.
 *
 * Drift reporting is NOT here. These functions are pure; the client owns the
 * logger and reports missing-expected-key warnings when it calls them.
 *
 * @module features/data-installer/services/dataInstallerParsers
 */

import type {
    ActivityEntry,
    DataItem,
    DataItemInventory,
    DataTypeInfo,
    DataTypeStatus,
    DatapackDetail,
    DatapackId,
    DatapackSummary,
    ImportStart,
    InstalledDatapack,
    JobFailureReason,
    JobStatusSnapshot,
    Page,
    ServiceHealth,
    ValidationResult,
} from '../types';

const TERMINAL_STATUSES: readonly string[] = ['pending', 'processing', 'success', 'error'];

/** Read a record, or an empty one for anything that is not an object. */
function obj(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** Read an array, or an empty one. */
function arr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

/** Read a non-empty string, or undefined. */
function str(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Read a finite number, or undefined. */
function num(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Read an array of strings, dropping anything that is not one. */
function strArr(value: unknown): string[] {
    return arr(value).filter((v): v is string => typeof v === 'string');
}

/** Identity from a row. Name is required; version defaults to empty. */
function identity(row: Record<string, unknown>): DatapackId {
    return { name: str(row.datapack_name) ?? '', version: str(row.version) ?? '' };
}

/** Art with empty strings omitted, so callers can rely on `undefined`. */
function art(row: Record<string, unknown>): DatapackSummary['art'] {
    const cover = str(row.cover_image);
    const thumbnail = str(row.thumbnail_image);
    return { ...(cover ? { cover } : {}), ...(thumbnail ? { thumbnail } : {}) };
}

/** One catalog row, or undefined when it carries no usable identity. */
function summary(value: unknown): DatapackSummary | undefined {
    const row = obj(value);
    const id = identity(row);
    if (id.name === '') {
        return undefined;
    }
    const description = str(row.description);
    const owner = str(row.owner);
    const createdAt = str(row.created_at);
    const updatedAt = str(row.updated_at);
    return {
        id,
        displayName: str(row.display_name) ?? id.name,
        shared: row.shared === true,
        dataTypes: strArr(row.data_types),
        art: art(row),
        ...(description ? { description } : {}),
        ...(owner ? { owner } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(updatedAt ? { updatedAt } : {}),
    };
}

/** Pagination envelope shared by the two paged endpoints. */
function page<T>(body: Record<string, unknown>, items: T[]): Page<T> {
    return {
        items,
        count: num(body.count) ?? items.length,
        total: num(body.total) ?? items.length,
        ...(num(body.limit) !== undefined ? { limit: num(body.limit) } : {}),
        ...(num(body.skip) !== undefined ? { skip: num(body.skip) } : {}),
    };
}

/** The catalog listing. Unusable rows are skipped, not fatal. */
export function parseDatapackList(body: unknown): Page<DatapackSummary> {
    const root = obj(body);
    const items = arr(root.datapacks)
        .map(summary)
        .filter((p): p is DatapackSummary => p !== undefined);
    return page(root, items);
}

/**
 * One datapack's metadata.
 *
 * Reads the top level, because the response is flat — and falls back to a
 * `datapack` wrapper so an upstream fix requires no change here.
 */
export function parseDatapackDetail(body: unknown): DatapackDetail {
    const root = obj(body);
    const source = obj(root.datapack ?? root);
    const base = summary(source) ?? {
        id: identity(source),
        displayName: str(source.display_name) ?? '',
        shared: source.shared === true,
        dataTypes: strArr(source.data_types),
        art: art(source),
    };
    const durationMs = num(source.duration);
    return { ...base, ...(durationMs !== undefined ? { durationMs } : {}) };
}

/** One stored data item, with the wire's JSON string parsed out. */
export function parseDataItem(body: unknown, dataType: string): DataItem {
    const root = obj(body);
    const raw = root.data;
    const count = num(root.count);
    const includeContent = typeof root.include_content === 'boolean' ? root.include_content : undefined;
    const envelope: DataItem = {
        dataType,
        ...(count !== undefined ? { count } : {}),
        ...(includeContent !== undefined ? { includeContent } : {}),
    };

    if (typeof raw !== 'string') {
        return raw === undefined ? envelope : { ...envelope, records: raw };
    }
    try {
        return { ...envelope, records: JSON.parse(raw) };
    } catch {
        // Keep the payload rather than throwing: a caller can still show it,
        // and a whole datapack view should not die on one bad item.
        return { ...envelope, rawData: raw };
    }
}

/** Which requested data types the datapack holds. Reads `results`, not `items`. */
export function parseDataItemInventory(body: unknown): DataItemInventory {
    const root = obj(body);
    const present: string[] = [];
    const missing: string[] = [];

    for (const entry of arr(root.results)) {
        const row = obj(entry);
        const name = str(obj(row.metadata).data_type) ?? str(obj(row.requested).data_type);
        if (!name) {
            continue;
        }
        (row.found === false ? missing : present).push(name);
    }

    // Documented-but-unseen shape: tolerate it so an upstream change is free.
    if (present.length === 0 && missing.length === 0) {
        for (const entry of arr(root.items)) {
            const name = str(obj(entry).data_type);
            if (name) {
                present.push(name);
            }
        }
    }

    return {
        present,
        missing,
        presentCount: num(root.found_count) ?? present.length,
        missingCount: num(root.missing_count) ?? missing.length,
        requestedCount: num(root.requested_count) ?? present.length + missing.length,
    };
}

/** The exportable data types, with dependency edges and ordering. */
export function parseDataTypeCatalog(body: unknown): DataTypeInfo[] {
    return arr(obj(body).data_types)
        .map((entry): DataTypeInfo | undefined => {
            const row = obj(entry);
            const dataType = str(row.data_type);
            if (!dataType) {
                return undefined;
            }
            const description = str(row.description);
            const apiType = str(row.api_type);
            const order = num(row.order);
            return {
                dataType,
                dependsOn: strArr(row.depends_on),
                metadata: 'available',
                ...(description ? { description } : {}),
                ...(apiType ? { apiType } : {}),
                ...(order !== undefined ? { order } : {}),
            };
        })
        .filter((t): t is DataTypeInfo => t !== undefined);
}

/** The ordered data types for one operation mode. */
export function parseProcessorOrder(body: unknown): string[] {
    return arr(obj(body).processors)
        .map((entry) => str(obj(entry).data_type))
        .filter((t): t is string => t !== undefined);
}

/** Datapacks recorded as installed on Commerce instances. */
export function parseInstalledDatapacks(body: unknown): Page<InstalledDatapack> {
    const root = obj(body);
    const items = arr(root.datapacks)
        .map((entry) => {
            const row = obj(entry);
            const commerceInstance = str(row.commerce_instance);
            if (!commerceInstance) {
                return undefined;
            }
            // Normal spelling first: it is what the live service sends. The
            // triple-s is the doc's typo, read only as a fallback.
            const processingTimeMs = num(row.overall_processing_time) ?? num(row.overall_processsing_time);
            const displayName = str(row.display_name);
            const installedAt = str(row.installed_at);
            return {
                commerceInstance,
                id: identity(row),
                dataTypes: strArr(row.data_types),
                art: art(row),
                ...(displayName ? { displayName } : {}),
                ...(installedAt ? { installedAt } : {}),
                ...(processingTimeMs !== undefined ? { processingTimeMs } : {}),
            };
        })
        .filter((r): r is InstalledDatapack => r !== undefined);
    return page(root, items);
}

/** The service's own request log. */
export function parseActivityLog(body: unknown): Page<ActivityEntry> {
    const root = obj(body);
    const items = arr(root.logs).map((entry) => {
        const row = obj(entry);
        const commerceInstance = str(row.commerce_instance);
        const mode = str(row.operation_mode);
        const siteType = str(row.site_type);
        const scenario = str(row.scenario);
        const at = str(row.timestamp);
        const activationId = str(row.activation_id);
        return {
            id: identity(row),
            dataTypes: strArr(row.data_types),
            ...(commerceInstance ? { commerceInstance } : {}),
            ...(mode ? { mode } : {}),
            ...(siteType ? { siteType } : {}),
            ...(scenario ? { scenario } : {}),
            ...(at ? { at } : {}),
            ...(activationId ? { activationId } : {}),
        };
    });
    return page(root, items);
}

/**
 * One async job's progress, from the DURABLE status endpoint.
 *
 * `hasRecord` is the signal the runner needs: a job that never started returns
 * `200` with an empty map, which cannot be told apart from "still starting"
 * without a grace window.
 */
export function parseJobStatus(body: unknown, fallbackActivationId = ''): JobStatusSnapshot {
    const root = obj(body);
    const perType: Record<string, DataTypeStatus> = {};

    for (const [dataType, value] of Object.entries(obj(root.data_types))) {
        const status = str(obj(value).status);
        if (status && TERMINAL_STATUSES.includes(status)) {
            perType[dataType] = status as DataTypeStatus;
        }
    }

    const processingTimeMs = num(root.overall_processing_time);
    return {
        activationId: str(root.activation_id) ?? fallbackActivationId,
        perType,
        hasRecord: Object.keys(perType).length > 0,
        ...(processingTimeMs !== undefined ? { processingTimeMs } : {}),
    };
}

/**
 * Why an async job produced nothing, from the activation echo.
 *
 * This endpoint is the ONLY source that explains an invalid request, because the
 * durable one just reports an empty map. It is also the one that reports
 * `in_progress` for jobs finished hours ago — so an `in_progress` body explains
 * nothing and yields undefined.
 */
export function parseJobFailureReason(body: unknown): JobFailureReason | undefined {
    const root = obj(body);
    if (root.success === false) {
        const error = str(root.error);
        return error ? { error } : undefined;
    }
    return undefined;
}

/**
 * The activation id from an accepted async start.
 *
 * Shape observed in the spike on the ACO twin:
 * `{success, status:"pending", activation_id, pipeline}`. Only `activation_id` is
 * read — `pipeline` names the family and varies, `status` restates the 202.
 *
 * Returns undefined rather than an empty id when the field is absent. The caller
 * must treat that as a failure: an accepted job with nothing to poll cannot be
 * told apart from one that never reports.
 */
export function parseImportStart(body: unknown): ImportStart | undefined {
    const activationId = str(obj(body).activation_id);
    return activationId ? { activationId } : undefined;
}

/**
 * The verdict from a synchronous validate call.
 *
 * `success: true` is the only positive signal; anything else is a refusal. The
 * service's own `error` string rides through verbatim because it names the cause
 * — getting that wording is the entire reason this call exists.
 */
export function parseValidation(body: unknown): ValidationResult {
    const root = obj(body);
    if (root.success === true) {
        return { valid: true };
    }
    const reason = str(root.error);
    return { valid: false, ...(reason ? { reason } : {}) };
}

/** Service reachability from the unauthenticated health endpoint. */
export function parseHealth(body: unknown): ServiceHealth {
    const root = obj(body);
    const message = str(root.message);
    const rawChecks = obj(root.env_check);
    const envChecks: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawChecks)) {
        if (typeof value === 'string') {
            envChecks[key] = value;
        }
    }
    return {
        reachable: root.success === true,
        ...(message ? { message } : {}),
        ...(Object.keys(envChecks).length > 0 ? { envChecks } : {}),
    };
}
