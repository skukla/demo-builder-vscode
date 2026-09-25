/**
 * runtimeLogText — what a Runtime log line and result look like when an agent reads them:
 * compacted (the time of day once, the level, the message; not the date twice, the stream
 * and the action's path on every line) and redacted (no bearer token, no secret-named field
 * at any depth). Pure text; split from runtimeActivations.ts on 2026-09-25.
 *
 * @module features/app-builder/services/runtimeLogText
 */

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
