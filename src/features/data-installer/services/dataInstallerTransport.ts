/**
 * The wire layer under the Data Installer read client.
 *
 * Split out of `dataInstallerClient.ts` (decompose-god-file, 2026-10-08): the
 * client names the endpoints and parses their answers; this is how ONE request
 * travels — the bearer, the timeout, transport and HTTP failures mapped to typed
 * errors, and the once-per-endpoint shape-drift canary. It changes when the
 * service's transport behaviour changes, not when it gains an endpoint.
 *
 * Imports no `vscode`: the base URL and token arrive as dependencies, so it is
 * unit-testable with an injected `fetchImpl` and zero VS Code mocks.
 *
 * Two rules this file keeps:
 *   - the token is written in exactly one place and never reaches a message,
 *   - `auth: false` is how `health-check` sends no Authorization header, because
 *     it must answer when the token is dead.
 *
 * @module features/data-installer/services/dataInstallerTransport
 */

import { actionUrl, type ActionQuery } from './dataInstallerConfig';
import {
    DataInstallerApiError,
    classifyTransportError,
    describeApiFailure,
} from './dataInstallerErrors';
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

/** Dependencies the transport needs; none of them touch VS Code. */
export interface DataInstallerTransportDeps {
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

/** How one request is shaped. */
export interface TransportRequestOptions {
    auth?: boolean;
    query?: ActionQuery;
    method?: 'GET' | 'POST';
    body?: unknown;
    pathParam?: string;
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

export class DataInstallerTransport {
    private readonly fetchImpl: typeof fetch;
    private readonly timeoutMs: number;

    constructor(private readonly deps: DataInstallerTransportDeps) {
        this.fetchImpl = deps.fetchImpl ?? fetch;
        this.timeoutMs = deps.timeoutMs ?? TIMEOUTS.NORMAL;
    }

    /** Issue one request, map failures, and check the response shape. */
    async request(action: string, opts: TransportRequestOptions = {}): Promise<unknown> {
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
