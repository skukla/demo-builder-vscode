/**
 * Data Installer domain types.
 *
 * These are what the rest of the extension sees. No `snake_case`, no `_id`, no
 * `success` flag, and no trace of the upstream service's inconsistencies — those
 * are absorbed in `services/dataInstallerParsers.ts`, which is the only module
 * allowed to read a wire shape.
 *
 * Timestamps stay ISO strings rather than `Date`. Every one of these crosses the
 * extension↔webview boundary, where `postMessage` serializes a `Date` to a string
 * anyway — typing it as `Date` would be a lie on the receiving side.
 *
 * @module features/data-installer/types
 */

/** Identity of a datapack. The service keys on the pair, so we do too. */
export interface DatapackId {
    name: string;
    version: string;
}

/** Cover and thumbnail art, either of which may be absent. */
export interface DatapackArt {
    cover?: string;
    thumbnail?: string;
}

/** A datapack as it appears in the catalog listing. */
export interface DatapackSummary {
    id: DatapackId;
    displayName: string;
    description?: string;
    owner?: string;
    shared: boolean;
    dataTypes: string[];
    art: DatapackArt;
    createdAt?: string;
    updatedAt?: string;
}

/** A single datapack's full metadata. Same shape plus timing. */
export interface DatapackDetail extends DatapackSummary {
    durationMs?: number;
}

/** One stored data item, with its payload parsed out of the wire string. */
export interface DataItem {
    dataType: string;
    /** Parsed from the wire's JSON *string*. `undefined` when it would not parse. */
    records?: unknown;
    /** The unparsed string, kept only when parsing failed. */
    rawData?: string;
    count?: number;
    includeContent?: boolean;
}

/** Which of the requested data types a datapack actually holds. */
export interface DataItemInventory {
    present: string[];
    missing: string[];
    presentCount: number;
    missingCount: number;
    requestedCount: number;
}

/** Whether we could describe a data type from the export catalog. */
export type DataTypeMetadataState = 'available' | 'unavailable';

/** One data type the service can process. */
export interface DataTypeInfo {
    dataType: string;
    description?: string;
    apiType?: string;
    dependsOn: string[];
    order?: number;
    metadata: DataTypeMetadataState;
}

/** What `process-datapack` can be asked to do. */
export type OperationMode = 'import' | 'export' | 'delete' | 'validate';

/** A datapack recorded as installed on a Commerce instance. */
export interface InstalledDatapack {
    commerceInstance: string;
    id: DatapackId;
    displayName?: string;
    dataTypes: string[];
    art: DatapackArt;
    installedAt?: string;
    processingTimeMs?: number;
}

/** One row of the service's own request log. */
export interface ActivityEntry {
    id: DatapackId;
    dataTypes: string[];
    commerceInstance?: string;
    mode?: string;
    siteType?: string;
    /**
     * Opaque on purpose. The documented enum (`SINGLE_DB`, `ENTIRE_DB`, …) does
     * not match live data (`DATAPACK_ALL_ITEMS`, `DATAPACK_SPECIFIC_ITEMS`), so
     * this is never narrowed to a union and is rendered as-is.
     */
    scenario?: string;
    at?: string;
    activationId?: string;
}

/** A page of results from a paginated endpoint. */
export interface Page<T> {
    items: T[];
    count: number;
    total: number;
    limit?: number;
    skip?: number;
}

/** Per-data-type progress state reported by the durable status endpoint. */
export type DataTypeStatus = 'pending' | 'processing' | 'success' | 'error';

/** A snapshot of one async job's progress. */
export interface JobStatusSnapshot {
    activationId: string;
    perType: Record<string, DataTypeStatus>;
    processingTimeMs?: number;
    /**
     * False when the status map is empty — the shape a job that never started
     * returns. It is NOT an error, and cannot be told apart from "still
     * starting" without the grace window, so the runner needs it explicitly.
     */
    hasRecord: boolean;
}

/**
 * The verdict from a synchronous `operation_mode: 'validate'` call.
 *
 * A rejection is an ANSWER, not an error — the sync twin 400s requests the async
 * entry point accepts with a 202, and its message names the cause.
 */
export interface ValidationResult {
    valid: boolean;
    /** The service's own wording when it refused. */
    reason?: string;
}

/** What an accepted async start hands back: the id to poll. */
export interface ImportStart {
    activationId: string;
}

/**
 * One import, as recorded on the extension host.
 *
 * Survives the panel closing — the watch is detached, so this is where its
 * result lands. `outcome: 'watching'` is the in-flight state; the rest come from
 * the runner.
 */
export interface ImportJobRecord {
    activationId: string;
    datapackName: string;
    version: string;
    /** Whatever the user typed. Opaque. */
    commerceInstance: string;
    dataTypes: string[];
    startedAt: string;
    outcome: 'watching' | 'success' | 'partial' | 'error' | 'never-registered' | 'stopped' | 'still-running';
    perType: Record<string, DataTypeStatus>;
    /** Why nothing happened, for `never-registered`. */
    reason?: string;
    processingTimeMs?: number;
}

/** Why an async job produced nothing, as reported by the activation echo. */
export interface JobFailureReason {
    /** The service's own message; surfaced verbatim because it names the cause. */
    error: string;
}

/** Service reachability, from the unauthenticated health endpoint. */
export interface ServiceHealth {
    reachable: boolean;
    message?: string;
    envChecks?: Record<string, string>;
}
