/**
 * Data Installer read client.
 *
 * Every read endpoint the service offers, named once and parsed into a domain
 * object. How a request TRAVELS — bearer, timeout, failure mapping, the drift
 * canary — is `dataInstallerTransport.ts` (split 2026-10-08). This module imports
 * no `vscode`: the base URL and token arrive as dependencies, so the whole wire
 * layer is unit-testable with an injected `fetchImpl` and zero VS Code mocks.
 * Structural model: `IoEventsClient`.
 *
 * Reads only. Writes need Commerce credentials and get a sibling client, so
 * "do we have credentials yet?" stays a type question rather than a runtime one.
 *
 * Two rules this file exists to keep (the transport keeps the token rule):
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
import { DataInstallerApiError, DataInstallerInputError } from './dataInstallerErrors';
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
import { DataInstallerTransport, type DataInstallerTransportDeps } from './dataInstallerTransport';

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

export class DataInstallerClient {
    private readonly transport: DataInstallerTransport;

    constructor(deps: DataInstallerTransportDeps) {
        this.transport = new DataInstallerTransport(deps);
    }

    /** Service reachability. The one call that sends no Authorization header. */
    async checkHealth(): Promise<ServiceHealth> {
        const body = await this.transport.request('health-check', { auth: false });
        return parseHealth(body);
    }

    /** The datapack catalog. */
    async findDatapacks(query: DatapackQuery): Promise<Page<DatapackSummary>> {
        const body = await this.transport.request('find-datapacks', {
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
        const body = await this.transport.request('get-datapack-metadata', {
            query: { datapack_name: id.name, version: id.version },
        });
        return parseDatapackDetail(body);
    }

    /** One stored data item, payload parsed. */
    async getDataItem(id: DatapackId, dataType: string): Promise<DataItem> {
        const body = await this.transport.request('get-data-item', {
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
        const body = await this.transport.request('batch-get-data-items', {
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
        return parseDataTypeCatalog(await this.transport.request('get-export-data-types'));
    }

    /**
     * The ordered data types for one operation mode.
     *
     * Must be asked per mode: the import list contains types the export list does
     * not, so there is no single "all types" answer to cache.
     */
    async getProcessorOrder(mode: OperationMode): Promise<string[]> {
        return parseProcessorOrder(
            await this.transport.request('get-processor-order', { query: { operation_mode: mode } }),
        );
    }

    /** Datapacks recorded as installed on Commerce instances. */
    async getInstalledDatapacks(query: InstalledQuery): Promise<Page<InstalledDatapack>> {
        const body = await this.transport.request('get-installed-datapacks', {
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
        const body = await this.transport.request('logs', {
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
            const body = await this.transport.request('datapack-process-status', { pathParam: activationId });
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
            const body = await this.transport.request('async-process-status', { pathParam: activationId });
            return parseJobFailureReason(body);
        } catch (error) {
            // A 400 here IS the answer: the echo reports invalid input that way.
            if (error instanceof DataInstallerApiError && error.status === 400) {
                return { error: error.message };
            }
            throw error;
        }
    }
}
