/**
 * Write a pack into a datapack store: create it, then add one data type at a time.
 *
 * The Data Installer and our datapack store answer the same two routes the same
 * way (`create-datapack`, `add-data-item`; pinned by
 * `datapack-store-contract.test.ts`), so this one writer serves both — only the
 * base URL differs. It is separate from `DataInstallerWriteClient` because that
 * client drives `process-datapack` (import, validate, export) into Commerce, while
 * this writes into the store's own catalog.
 *
 * Each data type is one request, so a type too large for one request is refused on
 * its own and the caller can carry on with the rest.
 *
 * @module features/data-installer/services/datapackStoreWriter
 */

import type { DatapackId } from '../types';
import { actionUrl } from './dataInstallerConfig';
import { DataInstallerApiError } from './dataInstallerErrors';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

export interface DatapackStoreWriterDeps {
    baseUrl: string;
    getToken: () => Promise<string>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** One line per call: route and status. Never the rows. */
    log?: (line: string) => void;
}

/** What a new pack's catalog entry says about it. */
export interface NewDatapack {
    id: DatapackId;
    displayName: string;
    description?: string;
}

/** The store's own sentence, when it gave one. */
function storeMessage(text: string): string | undefined {
    try {
        const body = JSON.parse(text) as { error?: unknown; message?: unknown };
        if (typeof body.error === 'string') return body.error;
        if (typeof body.message === 'string') return body.message;
    } catch {
        // Not JSON: no sentence to quote.
    }
    return undefined;
}

export class DatapackStoreWriter {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DatapackStoreWriterDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.LONG;
    }

    /**
     * Create the pack's catalog entry, private to the caller.
     *
     * @returns `created`, or `exists` when the store already holds that name and version
     * @throws DataInstallerApiError for any other refusal
     */
    async createDatapack(pack: NewDatapack): Promise<'created' | 'exists'> {
        const response = await this.post('create-datapack', {
            datapack_name: pack.id.name,
            version: pack.id.version,
            display_name: pack.displayName,
            ...(pack.description ? { description: pack.description } : {}),
            shared: false,
        });
        if (response.status === 409) return 'exists';
        await this.check(response, 'create-datapack');
        return 'created';
    }

    /**
     * Store one data type's rows in the pack, replacing any rows it held for that type.
     *
     * The rows travel as a JSON string, the form both stores keep them in.
     *
     * @throws DataInstallerApiError naming the type, with the store's own reason
     */
    async addDataItem(id: DatapackId, dataType: string, records: unknown): Promise<void> {
        const response = await this.post('add-data-item', {
            datapack_name: id.name,
            version: id.version,
            data_type: dataType,
            data: JSON.stringify(records),
        });
        await this.check(response, 'add-data-item', dataType);
    }

    private async post(route: string, body: Record<string, unknown>): Promise<Response> {
        const response = await this.fetchImpl(actionUrl(this.deps.baseUrl, route), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.deps.getToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        const label = typeof body.data_type === 'string' ? `${route} (${body.data_type})` : route;
        this.deps.log?.(`${label} → ${response.status}`);
        return response;
    }

    private async check(response: Response, route: string, dataType?: string): Promise<void> {
        if (response.ok) return;
        const said = storeMessage(await response.text());
        const what = dataType ? `${dataType}: ` : '';
        const reason =
            response.status === 413
                ? 'too large to send in one request'
                : (said ?? `the store refused it (HTTP ${response.status})`);
        throw new DataInstallerApiError(`${what}${reason}`, response.status, route);
    }
}
