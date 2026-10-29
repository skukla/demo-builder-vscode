/**
 * Data Installer write client — the credentialed sibling of the read client.
 *
 * **Two classes, not one, on purpose.** Reads go to the catalog; writes act on a
 * Commerce instance, and a write request names one. No Commerce credential travels
 * with either: the service signs in to Commerce with its own (DEMOSYS-1698), so
 * Demo Builder stopped gathering and sending them (DI-6, 2026-10-28).
 *
 * Two methods, because a write is two steps by contract:
 *
 *   {@link validateImport} — the SYNCHRONOUS `process-datapack` with
 *   `operation_mode: 'validate'`. **A 202 does not mean the request was valid**:
 *   the async entry point accepted an empty body with a 202 and an activation id,
 *   while the sync twin 400s the same request. Validation happens in the worker,
 *   so it has to be asked for up front — every start validates first.
 *
 *   {@link startImport} — `process-datapack-async`, returning the activation id
 *   the job runner polls. Async is not optional: real installs run 12s–366s and
 *   the gateway times out around 60s.
 *
 * **The export is deliberately NOT here either** — `dataInstallerExportClient.ts`
 * drives the two-step export contract and shares this file's credential fields
 * and body parsing (split 2026-10-08).
 *
 * **Status polling is deliberately NOT here.** Watching a job is a read, and it
 * already lives on the read client. Duplicating it would
 * put the same endpoint behind two auth requirements.
 *
 * The instance string is passed through untouched. It is whatever the user typed:
 * no derivation, no validation, no formatting. A prefill from an unverified
 * equality is what writes sample data into someone else's live demo.
 *
 * No `vscode` import — injected `fetchImpl` and token provider, like its sibling.
 *
 * @module features/data-installer/services/dataInstallerWriteClient
 */

import type { ImportStart, ValidationResult } from '../types';
import { actionUrl } from './dataInstallerConfig';
import { DataInstallerApiError, DataInstallerInputError } from './dataInstallerErrors';
import { parseImportStart, parseValidation } from './dataInstallerParsers';
import { signInHeaders, type DataInstallerSignIn } from './dataInstallerSignIn';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { DatapackId, DatapackStoreName } from '@/types/datapack';

/** Everything one import needs. */
export interface ImportRequest {
    id: DatapackId;
    /** Opaque, user-supplied. Never derived, never reformatted. */
    commerceInstance: string;
    /** Explicit types only — omitting them is a 400 from the service. */
    dataTypes: string[];
    /**
     * Where the pack lands. Absent means the service's own default (`base`).
     *
     * Both codes travel together or not at all — the service rejects one
     * without the other, and validates that the store belongs to the website.
     */
    target?: ImportTarget;
    /**
     * Which store holds the pack: the service's catalog (absent, as before) or the datapack
     * library. Never sent to the service, whose body is built field by field
     * (`buildBody`): it installs only from its own catalog, so a library pack goes through
     * Demo Builder's engine (DI-5).
     */
    source?: DatapackStoreName;
}

/**
 * The website and store an import runs against.
 *
 * This is what decides where a pack lands: the service turns the pair into
 * `session_website_id` and substitutes it into every `website_ids` the pack
 * carries. Per the service author (2026-08-14) the website and store must
 * already exist in Commerce — the service validates them, and the extension
 * cannot create them (`websites` is not an importable data type).
 */
export interface ImportTarget {
    websiteCode: string;
    storeCode: string;
}

/** The write modes this client drives. `export` belongs to the export client. */
export type WriteMode = 'import' | 'validate' | 'delete' | 'export';

/** Whether a credential pair actually reaches its instance. */
export interface CredentialCheck {
    usable: boolean;
    /** The service's own wording when it refused. */
    reason?: string;
}

export interface DataInstallerWriteClientDeps extends DataInstallerSignIn {
    baseUrl: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    /**
     * One line per call: action + HTTP status + the service's reason. Never the
     * request body — it carries the Commerce credential pair by construction.
     *
     * Exists because the first live dry run produced a refusal and an EMPTY
     * Debug Logs channel: nothing recorded what was sent or what came back, so
     * the user could not debug and neither could we.
     */
    log?: (line: string) => void;
}

export class DataInstallerWriteClient {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DataInstallerWriteClientDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.NORMAL;
    }

    /**
     * Does the service's own credential reach this Commerce instance?
     *
     * `get-websites-and-stores` is the cheapest way to answer that — the spike's
     * own conclusion. It takes the instance, touches `process-datapack` not at
     * all, and so cannot start anything by accident. It also answers a question
     * `validate` may not: whether the sign-in WORKS, as opposed to whether the
     * request is well-formed.
     *
     * A refusal is a verdict, not an error.
     */
    async checkCredentials(request: ImportRequest): Promise<CredentialCheck> {
        const url = actionUrl(this.deps.baseUrl, 'get-websites-and-stores');
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
                ...(await signInHeaders(this.deps)),
                'Content-Type': 'application/json',
            },
            // Access only: no datapack, no operation mode. Nothing here could be
            // mistaken by the service for a request to do work.
            body: JSON.stringify({ commerce_instance: request.commerceInstance }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const body = safeParse(await response.text());
        if (response.status === 200 && (body as { success?: unknown })?.success === true) {
            this.deps.log?.(`get-websites-and-stores → ${response.status} (credentials usable)`);
            return { usable: true };
        }
        const reason = describe(body);
        this.deps.log?.(
            `get-websites-and-stores → ${response.status}${reason ? ` (${reason})` : ''}`,
        );
        return { usable: false, ...(reason ? { reason } : {}) };
    }

    /**
     * Ask the synchronous twin whether this request is well-formed.
     *
     * A rejection is a VERDICT, not an error: `{valid:false, reason}` comes back
     * for a 400 so the caller can show the service's own wording, which names the
     * cause. Anything else still throws — a 500 is not a validation answer.
     */
    async validateImport(request: ImportRequest): Promise<ValidationResult> {
        const body = await this.send('process-datapack', request, 'validate', {
            treat400AsVerdict: true,
        });
        return parseValidation(body);
    }

    /**
     * Start the import. Returns the activation id to poll.
     *
     * @throws DataInstallerInputError when no data types were requested
     * @throws DataInstallerApiError when the service refuses, or accepts without
     *         returning an activation id — which would leave nothing to watch
     */
    async startImport(request: ImportRequest): Promise<ImportStart> {
        if (request.dataTypes.length === 0) {
            throw new DataInstallerInputError(
                'Select at least one data type. The service returns a 400 when the type list is omitted.',
            );
        }
        const body = await this.send('process-datapack-async', request, 'import');
        const start = parseImportStart(body);
        if (!start) {
            throw new DataInstallerApiError(
                'The service accepted the import but returned no activation id, so its progress cannot be followed.',
                202,
                'process-datapack-async',
            );
        }
        return start;
    }

    /**
     * Remove this datapack's data from the instance — the RESET.
     *
     * Identical to {@link startImport} but for `operation_mode`, and that is the
     * point: same endpoint, same body, same 202-with-an-activation-id, so the job
     * runner watches it with no changes at all. The service supplies its own
     * dependency ordering for delete (a different order from import, covering the
     * same 21 data types), so nothing here has to reason about what to remove
     * first.
     *
     * **There is no confirmation in this layer and no undo in the service.** The
     * caller owns asking; by the time this is called the decision is made.
     */
    async startDelete(request: ImportRequest): Promise<ImportStart> {
        if (request.dataTypes.length === 0) {
            throw new DataInstallerInputError(
                'Select at least one data type to remove. The service returns a 400 when the type list is omitted.',
            );
        }
        const body = await this.send('process-datapack-async', request, 'delete');
        const start = parseImportStart(body);
        if (!start) {
            throw new DataInstallerApiError(
                'The service accepted the reset but returned no activation id, so its progress cannot be followed.',
                202,
                'process-datapack-async',
            );
        }
        return start;
    }

    /** POST one request, mapping failures without ever echoing a credential. */
    private async send(
        action: string,
        request: ImportRequest,
        mode: WriteMode,
        opts: { treat400AsVerdict?: boolean } = {},
    ): Promise<unknown> {
        const url = actionUrl(this.deps.baseUrl, action);
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
                ...(await signInHeaders(this.deps)),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildBody(request, mode)),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const raw = await response.text();
        const reason = describe(safeParse(raw));
        this.deps.log?.(
            `${action} (${mode}) → ${response.status}${reason ? ` (${reason})` : ''}`,
        );
        if (response.status === 400 && opts.treat400AsVerdict) {
            return safeParse(raw);
        }
        if (!response.ok) {
            // The service's own message only. The request body is never quoted back.
            throw new DataInstallerApiError(
                describe(safeParse(raw)) ?? `The Data Installer rejected the request (HTTP ${response.status}).`,
                response.status,
                action,
            );
        }
        return safeParse(raw);
    }
}

/** The wire body. The only module besides the parsers that writes snake_case. */
function buildBody(request: ImportRequest, mode: WriteMode): Record<string, unknown> {
    return {
        datapack_name: request.id.name,
        version: request.id.version,
        // Verbatim — see the class docstring.
        commerce_instance: request.commerceInstance,
        data_types: request.dataTypes,
        operation_mode: mode,
        ...targetFields(request.target),
    };
}

/**
 * Targeting fields, present only when the user chose a target.
 *
 * Omitted is not the same as empty: absent means "the service's default
 * (`base`)", while `""` is a value the service would try to validate. And the
 * pair is atomic — one code without the other is a documented 400 — so this
 * emits both keys or neither.
 */
function targetFields(target: ImportTarget | undefined): Record<string, string> {
    return target ? { website_code: target.websiteCode, store_code: target.storeCode } : {};
}

/** Parse, tolerating a body that is not JSON at all. */
export function safeParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/** The service's `error` string, when it sent one. */
export function describe(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }
    const error = (body as { error?: unknown }).error;
    return typeof error === 'string' && error.length > 0 ? error : undefined;
}
