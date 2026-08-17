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
    /**
     * Where the pack lands. Absent means the service's own default (`base`).
     *
     * Both codes travel together or not at all — the service rejects one
     * without the other, and validates that the store belongs to the website.
     */
    target?: ImportTarget;
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

/** The write modes this client drives. `export` belongs to Stage 3. */
type WriteMode = 'import' | 'validate' | 'delete' | 'export';

/** Whether a credential pair actually reaches its instance. */
export interface CredentialCheck {
    usable: boolean;
    /** The service's own wording when it refused. */
    reason?: string;
}

export interface DataInstallerWriteClientDeps {
    baseUrl: string;
    getToken: () => Promise<string>;
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
     * Do these credentials actually reach this Commerce instance?
     *
     * `get-websites-and-stores` is the cheapest way to answer that — the spike's
     * own conclusion. It takes the instance and the credential pair, touches
     * `process-datapack` not at all, and so cannot start anything by accident.
     * It also answers a question `validate` may not: whether the pair WORKS, as
     * opposed to whether the request is well-formed.
     *
     * A refusal is a verdict, not an error.
     */
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

    async checkCredentials(request: ImportRequest): Promise<CredentialCheck> {
        const url = actionUrl(this.deps.baseUrl, 'get-websites-and-stores');
        const response = await this.fetchImpl(url, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${await this.deps.getToken()}`,
                'Content-Type': 'application/json',
            },
            // Access only: no datapack, no operation mode. Nothing here could be
            // mistaken by the service for a request to do work.
            body: JSON.stringify({
                commerce_instance: request.commerceInstance,
                ...credentialFields(request.credentials),
            }),
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
                Authorization: `Bearer ${await this.deps.getToken()}`,
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
function buildBody(request: ImportRequest, mode: WriteMode): Record<string, unknown> {
    return {
        datapack_name: request.id.name,
        version: request.id.version,
        // Verbatim — see the class docstring.
        commerce_instance: request.commerceInstance,
        data_types: request.dataTypes,
        operation_mode: mode,
        ...targetFields(request.target),
        ...credentialFields(request.credentials),
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

/**
 * Credential fields, by backend.
 *
 * **`admin_username`/`admin_password` are the names the service's own docs use.**
 * An earlier version of this function invented `commerce_username`/
 * `commerce_password` — no source, no verification — which would have failed in
 * the worker minutes after a 202, with a credentials error and no clue why.
 *
 * Still UNCONFIRMED against a live call: the spike read these from vendor docs
 * that are wrong in seven known places, and it used no credentials. The Validate
 * button is what settles it — a documented name is merely better grounded than an
 * invented one, not proven.
 *
 * Which scope the service requests for ACCS is unknown and will not be answered,
 * so this sends the pair and lets the attempt report its own failure rather than
 * branching on a value nobody has confirmed.
 */
function credentialFields(credentials: CommerceCredentials): Record<string, string> {
    return credentials.kind === 'paas'
        ? { admin_username: credentials.username, admin_password: credentials.password }
        : { client_id: credentials.clientId, client_secret: credentials.clientSecret };
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
 * `verbose: 'full'` is not optional here — see {@link DataInstallerWriteClient.startExport}.
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
