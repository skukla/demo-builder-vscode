/**
 * Data Installer write client — the credentialed sibling of the read client.
 *
 * **Two classes, not one, on purpose.** Reads need only the extension's IMS
 * bearer. Writes additionally need Commerce credentials, which ACCS projects do
 * not store, so "do we have credentials yet?" is a TYPE question the compiler
 * answers rather than a runtime check every method repeats.
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
 * **Status polling is deliberately NOT here.** Watching a job is a read, it needs
 * no credentials, and it already lives on the read client. Duplicating it would
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

import type { DatapackId, ImportStart, ValidationResult } from '../types';
import { actionUrl } from './dataInstallerConfig';
import { DataInstallerApiError, DataInstallerInputError } from './dataInstallerErrors';
import { parseImportStart, parseValidation } from './dataInstallerParsers';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';

/** Commerce credentials, discriminated by backend because the shapes differ. */
export type CommerceCredentials =
    | { kind: 'paas'; username: string; password: string }
    | { kind: 'accs'; clientId: string; clientSecret: string };

/** Everything one import needs. */
export interface ImportRequest {
    id: DatapackId;
    /** Opaque, user-supplied. Never derived, never reformatted. */
    commerceInstance: string;
    /** Explicit types only — omitting them is a 400 from the service. */
    dataTypes: string[];
    credentials: CommerceCredentials;
}

export interface DataInstallerWriteClientDeps {
    baseUrl: string;
    getToken: () => Promise<string>;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}

export class DataInstallerWriteClient {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DataInstallerWriteClientDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.NORMAL;
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

    /** POST one request, mapping failures without ever echoing a credential. */
    private async send(
        action: string,
        request: ImportRequest,
        mode: 'import' | 'validate',
        opts: { treat400AsVerdict?: boolean } = {},
    ): Promise<unknown> {
        const url = actionUrl(this.deps.baseUrl, action);
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.deps.getToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(buildBody(request, mode)),
            signal: AbortSignal.timeout(this.timeoutMs),
        });

        const raw = await response.text();
        if (response.status === 400 && opts.treat400AsVerdict) {
            return safeParse(raw);
        }
        if (!response.ok) {
            // The service's own message only. The request body is never quoted
            // back — it carries the Commerce credentials.
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
function buildBody(request: ImportRequest, mode: 'import' | 'validate'): Record<string, unknown> {
    return {
        datapack_name: request.id.name,
        version: request.id.version,
        // Verbatim — see the class docstring.
        commerce_instance: request.commerceInstance,
        data_types: request.dataTypes,
        operation_mode: mode,
        ...credentialFields(request.credentials),
    };
}

/**
 * Credential fields, by backend.
 *
 * Which scope the service requests for ACCS is unknown and will not be answered,
 * so this sends the pair and lets the attempt report its own failure rather than
 * branching on a value nobody has confirmed.
 */
function credentialFields(credentials: CommerceCredentials): Record<string, string> {
    return credentials.kind === 'paas'
        ? { commerce_username: credentials.username, commerce_password: credentials.password }
        : { client_id: credentials.clientId, client_secret: credentials.clientSecret };
}

/** Parse, tolerating a body that is not JSON at all. */
function safeParse(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}

/** The service's `error` string, when it sent one. */
function describe(body: unknown): string | undefined {
    if (typeof body !== 'object' || body === null) {
        return undefined;
    }
    const error = (body as { error?: unknown }).error;
    return typeof error === 'string' && error.length > 0 ? error : undefined;
}
