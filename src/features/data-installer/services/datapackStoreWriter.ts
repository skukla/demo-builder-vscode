/**
 * Write a pack into a datapack store: create it, then add one data type at a time.
 *
 * The Data Installer and our datapack store answer the same two routes the same
 * way (`create-datapack`, `add-data-item`; pinned by
 * `datapack-store-contract.test.ts`), so this one writer serves both — only the
 * base URL differs. It writes into the store's own catalog and never into Commerce: Demo
 * Builder's engine does that (`demoBuilderEngine/engine.ts`).
 *
 * Each data type is one request, so a type too large for one request is refused on
 * its own and the caller can carry on with the rest. Demo Builder's own store also takes a list
 * too large for one request in parts (`inParts`, `itemParts.ts`); the Data Installer does not.
 *
 * @module features/data-installer/services/datapackStoreWriter
 */

import { actionUrl } from './dataInstallerConfig';
import { DataInstallerApiError } from './dataInstallerErrors';
import { type DataInstallerSignIn, signInHeaders } from './dataInstallerSignIn';
import { itemsTooLarge, partsOf, splittable } from './itemParts';
import { forgetPackRead } from './packReadCache';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId } from '@/types/datapack';

/**
 * The store's address and the caller's sign-in. The sign-in carries the org, sent as
 * `x-gw-ims-org-id` as every read already sends it (`signInHeaders`): with Adobe's gateway check
 * on for the store's actions, a write that names no org is refused (DI-5).
 */
export interface DatapackStoreWriterDeps extends DataInstallerSignIn {
    baseUrl: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /** One line per call: route and status. Never the rows. */
    log?: (line: string) => void;
    /**
     * The store takes a list too large for one request in parts (`append`): Demo Builder's own store
     * since 2026-11-05. Never the Data Installer, which would keep only the last part.
     */
    inParts?: boolean;
}

/** What a new pack's catalog entry says about it. */
export interface NewDatapack {
    id: DatapackId;
    displayName: string;
    description?: string;
    /** Shared with colleagues: a save into a shared pack stays shared (Phase 2). Private unless set. */
    shared?: boolean;
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
     * Create the pack's catalog entry: private to the caller unless `shared` is set.
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
            shared: pack.shared === true,
        });
        if (response.status === 409) return 'exists';
        await this.check(response, 'create-datapack');
        forgetPackRead(pack.id);
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
        const parts = this.deps.inParts && splittable(records) ? partsOf(records) : [records];
        for (const [index, part] of parts.entries()) {
            const response = await this.post('add-data-item', {
                datapack_name: id.name,
                version: id.version,
                data_type: dataType,
                data: JSON.stringify(part),
                // The first part replaces what the type held; each after it adds to it.
                ...(index > 0 ? { append: true } : {}),
            });
            await this.check(response, 'add-data-item', dataType);
        }
        // A read kept from before this write is not the pack any more (`packReadCache`).
        forgetPackRead(id);
    }

    /** The data types this store could not take, said before anything is written (`itemParts.ts`). */
    oversized(items: ReadonlyArray<{ dataType: string; records: unknown }>): string[] {
        return itemsTooLarge(items, this.deps.inParts === true);
    }

    /**
     * Delete a pack and every data item it holds.
     *
     * Meant for the datapack LIBRARY only, which lets a pack's owner delete it and
     * answers anyone else as if the pack did not exist. The Data Installer has no such
     * check, so nothing in the extension sends this to it.
     *
     * @returns `deleted`, or `not-found` when the store holds no pack of the caller's by that id
     * @throws DataInstallerApiError for any other refusal
     */
    async deleteDatapack(id: DatapackId): Promise<'deleted' | 'not-found'> {
        const url = actionUrl(this.deps.baseUrl, 'delete-datapack', {
            datapack_name: id.name,
            version: id.version,
        });
        const response = await this.fetchImpl(url, {
            method: 'DELETE',
            headers: await signInHeaders(this.deps),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        this.deps.log?.(`delete-datapack → ${response.status}`);
        forgetPackRead(id);
        if (response.status === 404) return 'not-found';
        await this.check(response, 'delete-datapack');
        return 'deleted';
    }

    /**
     * Change one version's display name: the name an SC sees. The pack's `datapack_name` is
     * immutable in the library, so this is what renaming a pack changes.
     *
     * Library only: its `update-datapack-metadata` lets only the pack's owner change it.
     *
     * @returns `updated`, or `not-found` when the store holds no pack of the caller's by that id
     * @throws DataInstallerApiError for any other refusal
     */
    async updateDisplayName(id: DatapackId, displayName: string): Promise<'updated' | 'not-found'> {
        return this.updateMetadata(id, { display_name: displayName });
    }

    /**
     * Share one version with everyone the library admits, or stop sharing it (owner, 2026-10-30):
     * the same owner-only route, its `shared` field.
     *
     * @returns `updated`, or `not-found` when the store holds no pack of the caller's by that id
     * @throws DataInstallerApiError for any other refusal
     */
    async updateShared(id: DatapackId, shared: boolean): Promise<'updated' | 'not-found'> {
        return this.updateMetadata(id, { shared });
    }

    /**
     * Mark one version as an official team pack, or take the mark off. The store refuses anyone not
     * on its deployed list of team pack owners.
     *
     * @returns `updated`, or `not-found` when the store holds no pack of the caller's by that id
     * @throws DataInstallerApiError for any other refusal
     */
    async updateTeam(id: DatapackId, team: boolean): Promise<'updated' | 'not-found'> {
        return this.updateMetadata(id, { team });
    }

    /** One `update-datapack-metadata` PUT for one version; the library answers 404 for a pack not the caller's. */
    private async updateMetadata(
        id: DatapackId,
        fields: { display_name?: string; shared?: boolean; team?: boolean },
    ): Promise<'updated' | 'not-found'> {
        const response = await this.post(
            'update-datapack-metadata',
            { datapack_name: id.name, version: id.version, ...fields },
            'PUT',
        );
        if (response.status === 404) return 'not-found';
        await this.check(response, 'update-datapack-metadata');
        return 'updated';
    }

    private async post(
        route: string,
        body: Record<string, unknown>,
        method: 'POST' | 'PUT' = 'POST',
    ): Promise<Response> {
        const response = await this.fetchImpl(actionUrl(this.deps.baseUrl, route), {
            method,
            headers: {
                ...(await signInHeaders(this.deps)),
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
                : (said ?? `the library refused it (HTTP ${response.status})`);
        throw new DataInstallerApiError(`${what}${reason}`, response.status, route);
    }
}
