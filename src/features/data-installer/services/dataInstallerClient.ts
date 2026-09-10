/**
 * Data Installer read client.
 *
 * Every HTTP call to the service goes through here, and this module imports no
 * `vscode` — the base URL and token arrive as dependencies, so the whole wire
 * layer is unit-testable with an injected `fetchImpl` and zero VS Code mocks.
 * Structural model: `IoEventsClient`.
 *
 * Reads only. Writes need Commerce credentials and get a sibling client, so
 * "do we have credentials yet?" stays a type question rather than a runtime one.
 *
 * Three rules this file exists to keep:
 *   - the token is written in exactly one place and never reaches a message,
 *   - `health-check` is the one call that sends no Authorization header, because
 *     it must answer when the token is dead,
 *   - `batchGetDataItems` refuses an empty type list before the network, since
 *     omitting it trips a live server-side 400.
 *
 * @module features/data-installer/services/dataInstallerClient
 */

import type {
    ActivityEntry,
    DataItem,
    DataItemInventory,
    DataTypeInfo,
    DatapackDetail,
    DatapackId,
    DatapackSummary,
    InstalledDatapack,
    JobFailureReason,
    JobStatusSnapshot,
    OperationMode,
    Page,
    ServiceHealth,
} from '../types';
import { actionUrl, type ActionQuery } from './dataInstallerConfig';
import {
    DataInstallerApiError,
    DataInstallerInputError,
    classifyTransportError,
    describeApiFailure,
} from './dataInstallerErrors';
import {
    parseActivityLog,
    parseDataItem,
    parseDataItemInventory,
    parseDataTypeCatalog,
    parseDatapackDetail,
    parseDatapackList,
    parseHealth,
    parseInstalledDatapacks,
    parseJobFailureReason,
    parseJobStatus,
    parseProcessorOrder,
} from './dataInstallerParsers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/**
 * Top-level keys whose absence means the response shape moved.
 *
 * Deliberately thin: one or two keys per endpoint, enough to notice a real change
 * without firing on every optional field the service might drop.
 */
const EXPECTED_KEYS: Record<string, readonly string[]> = {
    'find-datapacks': ['datapacks'],
    'get-datapack-metadata': ['datapack_name', 'display_name'],
    'get-data-item': ['data'],
    'batch-get-data-items': ['results'],
    'get-export-data-types': ['data_types'],
    'get-processor-order': ['processors'],
    'get-installed-datapacks': ['datapacks'],
    logs: ['logs'],
};

/** Dependencies the client needs; none of them touch VS Code. */
export interface DataInstallerClientDeps {
    /** Validated base URL, no trailing slash. */
    baseUrl: string;
    /** Resolves a fresh IMS bearer. Called per request — tokens expire. */
    getToken: () => Promise<string>;
    /** Injectable for tests. */
    fetchImpl?: typeof fetch;
    /**
     * Called at most once per endpoint when an expected key is missing.
     * Receives key NAMES only, never values — the callback output gets logged.
     */
    onDrift?: (endpoint: string, missingKeys: string[]) => void;
    /** Per-request timeout. Defaults to {@link TIMEOUTS.NORMAL}. */
    timeoutMs?: number;
}

/** Filters for the catalog listing. */
export interface DatapackQuery {
    datapackName?: string;
    version?: string;
    owner?: string;
    shared?: boolean;
    limit?: number;
    skip?: number;
}

/** Filters for the installed-datapacks listing. */
export interface InstalledQuery {
    commerceInstance?: string;
    datapackName?: string;
    version?: string;
    limit?: number;
    skip?: number;
}

/** Filters for the activity log. */
export interface ActivityQuery {
    datapackName?: string;
    version?: string;
    operationMode?: OperationMode;
    commerceInstance?: string;
    siteType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    skip?: number;
}

/**
 * Endpoints whose shape drift has already been reported, for the life of the host.
 *
 * MODULE level, not instance level, and that distinction IS the bug this fixes.
 * `onDrift` is documented as firing "at most once per endpoint", and the dedupe was
 * a field on the client — but the client is built fresh inside the handler guard,
 * which runs on EVERY data-installer call. So the set was empty every time and a
 * drifting endpoint warned on every single request, which is exactly the noise the
 * field existed to prevent.
 *
 * Making the CLIENT shared was tried first and is wrong: two of its three
 * dependencies (`getToken`, `onDrift`) close over the calling handler's context, so
 * a cached client would keep the FIRST caller's logger — and the handler context
 * factories take their logger as a parameter, so it is not guaranteed to be one
 * object. The dedupe is the only part that should outlive a call, so it is the only
 * part that does.
 */
const driftReported = new Set<string>();

/**
 * Forget which endpoints have already warned.
 *
 * For tests and the host-reload path. Without it, moving the dedupe to module scope
 * makes SUITES share it: the first test to trip an endpoint's drift silences every
 * later test for that endpoint, and an assertion like "the warning never contains a
 * token value" then passes against an empty call list rather than against a real
 * warning. That happened here the moment the set moved.
 */
export function resetDriftReported(): void {
    driftReported.clear();
}

export class DataInstallerClient {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DataInstallerClientDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.NORMAL;
    }

    /** Service reachability. The one call that sends no Authorization header. */
    async checkHealth(): Promise<ServiceHealth> {
        const body = await this.request('health-check', { auth: false });
        return parseHealth(body);
    }

    /** The datapack catalog. */
    async findDatapacks(query: DatapackQuery): Promise<Page<DatapackSummary>> {
        const body = await this.request('find-datapacks', {
            query: {
                datapack_name: query.datapackName,
                version: query.version,
                owner: query.owner,
                shared: query.shared,
                limit: query.limit,
                skip: query.skip,
            },
        });
        return parseDatapackList(body);
    }

    /** One datapack's metadata. */
    async getDatapackDetail(id: DatapackId): Promise<DatapackDetail> {
        const body = await this.request('get-datapack-metadata', {
            query: { datapack_name: id.name, version: id.version },
        });
        return parseDatapackDetail(body);
    }

    /** One stored data item, payload parsed. */
    async getDataItem(id: DatapackId, dataType: string): Promise<DataItem> {
        const body = await this.request('get-data-item', {
            query: { datapack_name: id.name, data_type: dataType, version: id.version },
        });
        return parseDataItem(body, dataType);
    }

    /**
     * Which of the given data types the datapack holds.
     *
     * `dataTypes` must be non-empty: omitting it returns a 400 on the deployed
     * service, so the request is refused here rather than sent and failed.
     */
    async batchGetDataItems(
        id: DatapackId,
        dataTypes: string[],
        includeContent = false,
    ): Promise<DataItemInventory> {
        if (dataTypes.length === 0) {
            throw new DataInstallerInputError(
                'batch-get-data-items requires an explicit non-empty data_types list; ' +
                    'omitting it returns 400 from the deployed service.',
            );
        }
        const body = await this.request('batch-get-data-items', {
            method: 'POST',
            body: {
                datapack_name: id.name,
                version: id.version,
                data_types: dataTypes,
                include_content: includeContent,
            },
        });
        return parseDataItemInventory(body);
    }

    /** The exportable data types, with dependency edges. */
    async getExportDataTypes(): Promise<DataTypeInfo[]> {
        return parseDataTypeCatalog(await this.request('get-export-data-types'));
    }

    /**
     * The ordered data types for one operation mode.
     *
     * Must be asked per mode: the import list contains types the export list does
     * not, so there is no single "all types" answer to cache.
     */
    async getProcessorOrder(mode: OperationMode): Promise<string[]> {
        return parseProcessorOrder(
            await this.request('get-processor-order', { query: { operation_mode: mode } }),
        );
    }

    /** Datapacks recorded as installed on Commerce instances. */
    async getInstalledDatapacks(query: InstalledQuery): Promise<Page<InstalledDatapack>> {
        const body = await this.request('get-installed-datapacks', {
            query: {
                commerce_instance: query.commerceInstance,
                datapack_name: query.datapackName,
                version: query.version,
                limit: query.limit,
                skip: query.skip,
            },
        });
        return parseInstalledDatapacks(body);
    }

    /** The service's own request log. */
    async getActivityLog(query: ActivityQuery): Promise<Page<ActivityEntry>> {
        const body = await this.request('logs', {
            query: {
                datapack_name: query.datapackName,
                version: query.version,
                operation_mode: query.operationMode,
                commerce_instance: query.commerceInstance,
                site_type: query.siteType,
                start_date: query.startDate,
                end_date: query.endDate,
                limit: query.limit,
                skip: query.skip,
            },
        });
        return parseActivityLog(body);
    }

    /**
     * One job's progress from the DURABLE status source.
     *
     * This is the only endpoint that decides terminal state. Its sibling
     * (`async-process-status`) reports `in_progress` for jobs that finished hours
     * ago, so it never appears here.
     */
    async getJobStatus(activationId: string): Promise<JobStatusSnapshot> {
        try {
            const body = await this.request('datapack-process-status', { pathParam: activationId });
            return parseJobStatus(body, activationId);
        } catch (error) {
            // A 404 here is an ANSWER, not a failure: the live service returns it
            // ("No request log found") for the first ~15s after a 202, before the
            // worker registers the activation. Throwing bypassed the runner's
            // grace/never-registered logic — which keys on hasRecord — and put
            // five error lines into every healthy run's Debug Logs. The design
            // expected a 200-with-empty-map (what an INVALID job returns); the
            // warm-up shape turned out to be this instead, so both now land in
            // the same hasRecord:false state the runner was built around.
            if (error instanceof DataInstallerApiError && error.status === 404) {
                return { activationId, perType: {}, hasRecord: false };
            }
            throw error;
        }
    }

    /**
     * Why a job produced nothing, from the activation echo.
     *
     * Called once, only after the durable endpoint has reported an empty map past
     * the grace window — it is the ONLY source that carries the validation error
     * for a request the async entry point accepted with a 202. Returns undefined
     * when the echo explains nothing, including its stale `in_progress` body.
     */
    async getJobFailureReason(activationId: string): Promise<JobFailureReason | undefined> {
        try {
            const body = await this.request('async-process-status', { pathParam: activationId });
            return parseJobFailureReason(body);
        } catch (error) {
            // A 400 here IS the answer: the echo reports invalid input that way.
            if (error instanceof DataInstallerApiError && error.status === 400) {
                return { error: error.message };
            }
            throw error;
        }
    }

    /** Issue one request, map failures, and check the response shape. */
    private async request(
        action: string,
        opts: {
            auth?: boolean;
            query?: ActionQuery;
            method?: 'GET' | 'POST';
            body?: unknown;
            pathParam?: string;
        } = {},
    ): Promise<unknown> {
        const url = actionUrl(this.deps.baseUrl, action, opts.query, opts.pathParam);
        const headers: Record<string, string> = {};

        if (opts.auth !== false) {
            headers.Authorization = `Bearer ${await this.deps.getToken()}`;
        }
        if (opts.body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }

        const raw = await this.send(url, action, {
            method: opts.method ?? 'GET',
            headers,
            ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const parsed = safeJsonParse(raw);
        this.checkShape(action, parsed);
        return parsed;
    }

    /** Perform the fetch, converting transport and HTTP failures to typed errors. */
    private async send(url: string, action: string, init: RequestInit): Promise<string> {
        let response: Response;
        try {
            response = await this.fetchImpl(url, init);
        } catch (error) {
            // Classified structurally — never by matching words in a message.
            const kind = classifyTransportError(error);
            if (kind === 'timeout') {
                throw new DataInstallerApiError(
                    `${action}: request timed out after ${Math.round(this.timeoutMs / 1000)}s`,
                    0,
                    action,
                );
            }
            if (kind === 'unreachable') {
                throw new DataInstallerApiError(
                    `${action}: could not reach the Data Installer API. Check the base URL setting and your network.`,
                    0,
                    action,
                );
            }
            throw new DataInstallerApiError(
                `${action}: ${error instanceof Error ? error.message : 'request failed'}`,
                0,
                action,
            );
        }

        const text = await response.text();
        if (!response.ok) {
            throw new DataInstallerApiError(
                describeApiFailure(action, response.status, response.statusText, text),
                response.status,
                action,
            );
        }
        return text;
    }

    /** Report a moved response shape once per endpoint, by key name only. */
    private checkShape(action: string, body: unknown): void {
        const { onDrift } = this.deps;
        if (!onDrift || driftReported.has(action)) {
            return;
        }
        const expected = EXPECTED_KEYS[action];
        if (!expected) {
            return;
        }
        const present = typeof body === 'object' && body !== null ? Object.keys(body) : [];
        const missing = expected.filter((key) => !present.includes(key));
        if (missing.length > 0) {
            driftReported.add(action);
            onDrift(action, missing);
        }
    }
}

/** Parse a body, tolerating a non-JSON success response. */
function safeJsonParse(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}
