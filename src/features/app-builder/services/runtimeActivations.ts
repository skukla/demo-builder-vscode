/**
 * runtimeActivations — what RAN in a Runtime namespace: the activation list, one
 * activation's log and result, and a blocking invoke that replays an action with a
 * payload. Split from runtimeNamespace.ts on 2026-09-25 when the invoke arrived (the
 * namespace module keeps the credential, the command runner and the entity cleanup).
 *
 * What these can and cannot show (Adobe Runtime, "Logging and monitoring"): a
 * SUCCESSFUL blocking web-action run is not persisted unless the request carried
 * `X-OW-EXTRA-LOGGING: on`; failures and timer runs are. The list therefore says "no
 * failure recorded", never "did not run" — and the invoke answers the whole record of
 * a run it starts itself, which is the read the list cannot be.
 *
 * @module features/app-builder/services/runtimeActivations
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { AppManagementAuth } from './appManagementClient';
import { commandFailure, runInNamespace, type RuntimeNamespaceDeps, type RuntimeNamespaceEnv } from './runtimeNamespace';
import type { CommandResult } from '@/core/shell/types';
import { parseJSON } from '@/types/typeGuards';

/** One activation as `aio runtime activation list --json` answers it (shape read live 2026-09-24). */
interface RawActivation {
    activationId: string;
    name: string;
    namespace: string;
    start: number;
    end?: number;
    duration?: number;
    statusCode?: number;
    version?: string;
    annotations?: Array<{ key: string; value: unknown }>;
}

/** One activation, as an agent reads it: which action, when, how long, how it ended. */
export interface RuntimeActivationRow {
    activationId: string;
    /** `<package>/<action>` from the `path` annotation (`<namespace>/<package>/<action>`). */
    action: string;
    startedAt: string;
    durationMs?: number;
    /** OpenWhisk's status code: 0 success, 1 application error, 2 developer error, 3 internal error. */
    statusCode?: number;
    kind?: string;
}

/** The most `aio runtime activation list` returns in one call (its own `--limit` max). */
export const ACTIVATION_LIST_MAX = 50;

export interface ListActivationsOptions {
    /** At most {@link ACTIVATION_LIST_MAX}; default 30. */
    limit?: number;
    /** Only activations of this action (the CLI's positional filter). */
    action?: string;
    /** Skip this many newest rows first — the CLI's `--skip`, for paging past 50. */
    skip?: number;
    /** Only activations started after this time (ISO 8601) — the CLI's `--since`. */
    since?: string;
    /** Only runs that did not succeed (status code other than 0). */
    failedOnly?: boolean;
    /**
     * Keep the timer firings themselves (trigger rows, which have no runtime kind). Off by
     * default: on 2026-09-25 two minute-timers wrote four rows a minute, so 50 rows covered
     * twelve minutes and the failure being looked for had already scrolled off.
     */
    includeTriggers?: boolean;
}

/** The CLI's `--since` takes epoch milliseconds; an unreadable time is refused, not ignored. */
function sinceMs(since: string): number {
    const ms = Date.parse(since);
    if (Number.isNaN(ms)) {
        throw new Error(`"${since}" is not a time (use ISO 8601, e.g. 2026-09-25T13:00:00Z).`);
    }
    return ms;
}

/**
 * Recent activations, newest first — the namespace's own account of what ran.
 * Read for "did the event handler ever fire" and "why did the timer job fail",
 * which nothing else answers (2026-09-24: the answer was fetched by hand).
 *
 * @throws When the list cannot be read — a failure is never an empty list
 */
export async function listRuntimeActivations(
    deps: RuntimeNamespaceDeps,
    env: RuntimeNamespaceEnv,
    options: ListActivationsOptions = {},
): Promise<RuntimeActivationRow[]> {
    const limit = Math.min(Math.max(1, options.limit ?? 30), ACTIVATION_LIST_MAX);
    const skip = Math.max(0, Math.trunc(options.skip ?? 0));
    const command =
        `aio runtime activation list${options.action ? ` "${options.action}"` : ''} --json --limit ${limit}` +
        (skip > 0 ? ` --skip ${skip}` : '') +
        (options.since ? ` --since ${sinceMs(options.since)}` : '');
    const result = await runInNamespace(deps, command, env);
    if (result.code !== 0) {
        throw new Error(commandFailure(command, result));
    }
    const parsed = parseJSON<RawActivation[]>(result.stdout.trim());
    if (!Array.isArray(parsed)) {
        throw new Error(`${command}: the answer was not a list`);
    }
    const rows = shapeActivations(parsed);
    return rows.filter(
        (row) =>
            (options.includeTriggers || row.kind !== undefined) &&
            (!options.failedOnly || (row.statusCode !== undefined && row.statusCode !== 0)),
    );
}

function shapeActivations(parsed: RawActivation[]): RuntimeActivationRow[] {
    return parsed.map((a) => {
        const path = a.annotations?.find((x) => x.key === 'path')?.value;
        const kind = a.annotations?.find((x) => x.key === 'kind')?.value;
        return {
            activationId: a.activationId,
            action: typeof path === 'string' ? path.split('/').slice(1).join('/') : a.name,
            startedAt: new Date(a.start).toISOString(),
            ...(a.duration !== undefined ? { durationMs: a.duration } : {}),
            ...(a.statusCode !== undefined ? { statusCode: a.statusCode } : {}),
            ...(typeof kind === 'string' ? { kind } : {}),
        };
    });
}

/** An activation id is 32 hex characters; anything else never reaches the CLI. */
export const ACTIVATION_ID = /^[0-9a-f]{32}$/u;

/** The most log text one read answers; past it the lines are cut and the cut declared. */
export const LOG_CHARS_MAX = 30_000;
/** Runtime's own prefix on every line: its timestamp and the stream. */
const RUNTIME_LINE = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}:\d{2}\.\d{3})Z\s+(stdout|stderr):\s*/u;
/** AioLogger's prefix, repeated inside the line: its timestamp and `[name /namespace/package/action]`. */
const LOGGER_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\s+\[[^\]]*\]\s*/u;
/** Node's deprecation chatter, two lines per run, saying nothing about the run. */
const NODE_NOISE = /DeprecationWarning|--trace-deprecation/u;

/**
 * One Runtime log line as an agent needs it: the time of day once, the level and the
 * message — not the date twice, the stream and the action's full path on every line
 * (measured 2026-09-25: 190 characters of prefix on a 60-character message).
 */
export function compactLogLine(line: string): string | undefined {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('=== activation logs') || NODE_NOISE.test(trimmed)) {
        return undefined;
    }
    const runtime = RUNTIME_LINE.exec(trimmed);
    if (!runtime) {
        return trimmed;
    }
    const body = trimmed.slice(runtime[0].length).replace(LOGGER_PREFIX, '');
    return `${runtime[1]} ${runtime[2] === 'stderr' ? 'stderr: ' : ''}${body}`;
}

/** A bearer token anywhere in text; the validator component echoes the request headers into its result. */
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/gu;
/** Field names whose values are secrets, whatever they hold. */
const SECRET_KEY = /^(authorization|x-api-key|client_secret|clientSecret|access_token|accessToken|AIO_RUNTIME_AUTH|password|secret)$/iu;

/** The same text with any bearer token replaced; applied to every log line a tool answers. */
export function redactText(text: string): string {
    return text.replace(BEARER, 'Bearer [redacted]');
}

/**
 * The same value with secret-named fields and bearer tokens replaced, at any depth. Applied
 * to every result a tool answers: on 2026-09-25 the Adobe-auth validator's result carried
 * the caller's `__ow_headers.authorization`, and a tool answered it verbatim.
 */
export function redactSecrets(value: unknown): unknown {
    if (typeof value === 'string') return redactText(value);
    if (Array.isArray(value)) return value.map(redactSecrets);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEY.test(k) ? '[redacted]' : redactSecrets(v)]),
        );
    }
    return value;
}

/** Compact every line and keep at most {@link LOG_CHARS_MAX} characters, declaring any cut. */
export function compactLogs(raw: readonly string[]): string[] {
    const lines = raw.map(compactLogLine).filter((l): l is string => l !== undefined).map(redactText);
    const kept: string[] = [];
    let chars = 0;
    for (const line of lines) {
        if (chars + line.length > LOG_CHARS_MAX) {
            kept.push(`[cut: ${lines.length - kept.length} more line(s); narrow with a later since or a smaller limit]`);
            break;
        }
        kept.push(line);
        chars += line.length + 1;
    }
    return kept;
}

/** The record as `aio runtime activation get` prints it (shape read live 2026-09-25). */
interface ActivationRecord {
    activationId: string;
    annotations?: Array<{ key: string; value: unknown }>;
    duration?: number;
    /** Log lines for an action; the component activation ids for a sequence. */
    logs?: unknown[];
    response?: { status?: string; success?: boolean; result?: unknown };
}

/** One activation as an agent reads it: its result, how it ended, and its compacted log. */
export interface ActivationRead {
    activationId: string;
    /** `<package>/<action>` when the record names it. */
    action?: string;
    status?: string;
    success?: boolean;
    durationMs?: number;
    result: unknown;
    logs: string[];
}

const annotation = (record: ActivationRecord, key: string): unknown =>
    record.annotations?.find((x) => x.key === key)?.value;

/** The CLI prints its update warnings before the JSON; the record starts at the first brace. */
function parseRecord(command: string, answer: CommandResult): ActivationRecord {
    const text = answer.stdout;
    const start = text.indexOf('{');
    const record = start >= 0 ? parseJSON<ActivationRecord>(text.slice(start).trim()) : undefined;
    if (!record || typeof record !== 'object' || typeof record.activationId !== 'string') {
        throw new Error(commandFailure(command, answer));
    }
    return record;
}

async function getActivation(deps: RuntimeNamespaceDeps, env: RuntimeNamespaceEnv, activationId: string): Promise<ActivationRecord> {
    const command = `aio runtime activation get ${activationId}`;
    return parseRecord(command, await runInNamespace(deps, command, env));
}

/**
 * One activation's result and log, by id, in one `aio runtime activation get`. An
 * Adobe-auth web action deploys as a SEQUENCE (validator, then the action): its record
 * carries the components' activation ids where an action's carries log lines (measured
 * 2026-09-25), so a sequence is followed into its components and each one's lines are
 * labelled with its action. The lines come back compacted (compactLogs).
 *
 * @throws When the record cannot be read
 */
export async function readRuntimeActivation(
    deps: RuntimeNamespaceDeps,
    env: RuntimeNamespaceEnv,
    activationId: string,
): Promise<ActivationRead> {
    if (!ACTIVATION_ID.test(activationId)) {
        throw new Error('An activation id is 32 hex characters.');
    }
    const record = await getActivation(deps, env, activationId);
    const path = annotation(record, 'path');
    return {
        activationId,
        ...(typeof path === 'string' ? { action: path.split('/').slice(1).join('/') } : {}),
        ...(record.response?.status !== undefined ? { status: record.response.status } : {}),
        ...(record.response?.success !== undefined ? { success: record.response.success } : {}),
        ...(record.duration !== undefined ? { durationMs: record.duration } : {}),
        result: redactSecrets(record.response?.result),
        logs: await recordLogs(deps, env, record),
    };
}

/** An action's compacted lines, or a sequence's components' lines each under its action's name. */
async function recordLogs(deps: RuntimeNamespaceDeps, env: RuntimeNamespaceEnv, record: ActivationRecord): Promise<string[]> {
    const raw = Array.isArray(record.logs) ? record.logs.filter((l): l is string => typeof l === 'string') : [];
    const isSequence = annotation(record, 'kind') === 'sequence' || (raw.length > 0 && raw.every((l) => ACTIVATION_ID.test(l)));
    if (!isSequence) {
        return compactLogs(raw);
    }
    const lines: string[] = [];
    for (const id of raw) {
        const component = await getActivation(deps, env, id);
        const path = annotation(component, 'path');
        const name = typeof path === 'string' ? path.split('/').slice(1).join('/') : id;
        const componentLines = compactLogs(
            Array.isArray(component.logs) ? component.logs.filter((l): l is string => typeof l === 'string') : [],
        );
        // Never a component's result here: the Adobe-auth validator's result is the request
        // itself, headers and bearer included (leaked once, 2026-09-25). The sequence's own
        // result is the answer; a component with no lines yet says so.
        lines.push(`[${name}]`, ...(componentLines.length > 0 ? componentLines : ['(no log lines yet — Runtime attaches them up to a minute after a run; read again)']));
    }
    return compactLogs(lines);
}

/** What one invocation answered: the activation record a blocking `aio runtime action invoke` prints. */
export interface RuntimeInvocation {
    activationId: string;
    /** `success`, `application error`, `developer error` or `whisk internal error`. */
    status?: string;
    success?: boolean;
    durationMs?: number;
    /** The action's own answer (its `result`). */
    result: unknown;
    /** The run's log lines, when the record carried them. */
    logs: string[];
}

/** An action name is `<package>/<action>` or a bare action, in the characters Runtime allows. */
export const RUNTIME_ACTION_NAME = /^[A-Za-z0-9_.-]+(\/[A-Za-z0-9_.-]+)?$/u;

/**
 * Run one deployed action, blocking, with the payload as its parameters, and answer the
 * activation record. This is how a handler is replayed without Commerce or a timer: an
 * event handler takes `{ data: { value: … } }`, a web action its parameters directly
 * (the cart webhooks read either shape). The payload travels in a temp file (`--param-file`),
 * never on the command line, and the file is removed whatever happens.
 *
 * A blocking invoke answers the whole record — result and logs — even where Runtime does not
 * persist a successful blocking run (Adobe Runtime, "Logging and monitoring"), which is what
 * makes this the read that `list_runtime_activations` cannot be (2026-09-25).
 *
 * @throws When the action name is malformed, or the CLI answers nothing readable
 */
export async function invokeRuntimeAction(
    deps: RuntimeNamespaceDeps,
    env: RuntimeNamespaceEnv,
    action: string,
    payload: Record<string, unknown> = {},
): Promise<RuntimeInvocation> {
    if (!RUNTIME_ACTION_NAME.test(action)) {
        throw new Error('An action name is <package>/<action>, in letters, digits, dots, dashes and underscores.');
    }
    const paramFile = path.join(os.tmpdir(), `demo-builder-invoke-${process.pid}-${Date.now()}.json`);
    await fsPromises.writeFile(paramFile, JSON.stringify(payload), 'utf8');
    const command = `aio runtime action invoke "${action}" --blocking --param-file "${paramFile}"`;
    try {
        // On an application error the CLI exits non-zero but still prints the record.
        const record = parseRecord(command, await runInNamespace(deps, command, env));
        return {
            activationId: record.activationId,
            ...(record.response?.status !== undefined ? { status: record.response.status } : {}),
            ...(record.response?.success !== undefined ? { success: record.response.success } : {}),
            ...(record.duration !== undefined ? { durationMs: record.duration } : {}),
            result: redactSecrets(record.response?.result),
            logs: await recordLogs(deps, env, record),
        };
    } finally {
        await fsPromises.rm(paramFile, { force: true });
    }
}

/** What a web action answered when called through its URL. */
export interface WebInvocation {
    httpStatus: number;
    ok: boolean;
    /** The parsed JSON body, or the text when it was not JSON. */
    result: unknown;
}

/**
 * Call a web action the way Commerce does: through its URL, with the signed-in user's
 * bearer and org (the Adobe-auth validator in front of it accepts nothing else) and
 * `X-OW-EXTRA-LOGGING: on`, so Runtime keeps the run and its log can be read afterwards.
 * A direct `action invoke` of such an action fails in its validator with "server error"
 * (measured 2026-09-25), which is why web actions take this path.
 */
export async function invokeWebAction(
    url: string,
    auth: AppManagementAuth,
    payload: Record<string, unknown>,
    fetchImpl: typeof fetch,
): Promise<WebInvocation> {
    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${auth.accessToken}`,
            'x-gw-ims-org-id': auth.imsOrgId,
            'X-OW-EXTRA-LOGGING': 'on',
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });
    const text = await response.text();
    return {
        httpStatus: response.status,
        ok: response.ok,
        result: redactSecrets(parseJSON<unknown>(text) ?? text),
    };
}


