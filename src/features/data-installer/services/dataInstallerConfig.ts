/**
 * Data Installer API configuration.
 *
 * One place that knows how to read the `demoBuilder.dataInstaller.*` settings,
 * decide whether a configured base URL is usable, and build an action URL from
 * it. The Runtime gateway routes on the LAST path segment, so a wrong segment is
 * a 404 rather than an error worth reading — `actionUrl` exists so that rule
 * lives in exactly one tested function.
 *
 * Callers own their own error messaging: this module reports WHY a base URL was
 * rejected and says nothing about how to tell the user. Same contract as
 * `selectDiscoveryService` in `accsDiscoveryConfig.ts`.
 *
 * @module features/data-installer/services/dataInstallerConfig
 */

import * as vscode from 'vscode';
import { validateURL } from '@/core/validation';

/** Longest base URL we will accept from settings. */
export const DATA_INSTALLER_MAX_URL_LENGTH = 2048;

const SETTINGS_SECTION = 'demoBuilder.dataInstaller';

/**
 * Whether the Data Installer feature is switched on.
 *
 * Defaults to true, and treats a corrupted non-boolean setting as true rather
 * than silently disabling the feature — a broken settings.json should not look
 * like a deliberate opt-out.
 */
export function isDataInstallerEnabled(): boolean {
    const raw = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<boolean>('enabled', true);
    return typeof raw === 'boolean' ? raw : true;
}

/**
 * Outcome of resolving the base URL — success carries the validated value.
 *
 * A rejection carries a `fingerprint` rather than the value, so a caller can log
 * something diagnostic without this module having to know how to phrase it, and
 * without anyone re-reading the setting just to describe it.
 */
export type BaseUrlResolution =
    | { ok: true; baseUrl: string }
    | { ok: false; reason: 'not-configured' | 'invalid-url'; fingerprint?: string };

/**
 * Read and validate the Data Installer base URL.
 *
 * `https` only: this is a remote Adobe Runtime service, so there is no local-dev
 * exception to make (unlike the BYOM overlay, which can point at localhost).
 *
 * @returns The validated base URL with any trailing slash removed, or why not
 */
export function resolveDataInstallerBaseUrl(): BaseUrlResolution {
    const raw = vscode.workspace.getConfiguration(SETTINGS_SECTION).get<string>('apiBaseUrl', '');

    // VS Code's typed `get` returns the default on type mismatch, but be
    // defensive about a hand-edited settings.json.
    if (typeof raw !== 'string') {
        return { ok: false, reason: 'not-configured' };
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { ok: false, reason: 'not-configured' };
    }

    if (trimmed.length > DATA_INSTALLER_MAX_URL_LENGTH) {
        return { ok: false, reason: 'invalid-url', fingerprint: fingerprintUrl(trimmed) };
    }

    try {
        validateURL(trimmed, ['https']);
    } catch {
        return { ok: false, reason: 'invalid-url', fingerprint: fingerprintUrl(trimmed) };
    }

    return { ok: true, baseUrl: stripTrailingSlash(trimmed) };
}

/** Query values accepted by {@link actionUrl}; `false` and `0` are kept. */
export type ActionQuery = Record<string, string | number | boolean | undefined>;

/**
 * Build the URL for one deployed Runtime action.
 *
 * The action name MUST be the last path segment (or second-to-last when a path
 * parameter follows, as the two status endpoints require) — Runtime routes on it.
 *
 * @param baseUrl - Validated base, with or without a trailing slash
 * @param action - Deployed action name, e.g. `find-datapacks`
 * @param query - Optional query parameters; undefined/null/'' keys are omitted
 * @param pathParam - Optional trailing segment, e.g. an activation id
 * @returns The absolute URL
 */
export function actionUrl(
    baseUrl: string,
    action: string,
    query?: ActionQuery,
    pathParam?: string,
): string {
    const base = stripTrailingSlash(baseUrl);
    const path = pathParam ? `${action}/${encodeURIComponent(pathParam)}` : action;
    const search = buildSearch(query);
    return `${base}/${path}${search}`;
}

/**
 * Describe a URL without reproducing it.
 *
 * A rejected setting value may carry a secret in its query string, so the value
 * itself must never reach a log line. Scheme and host are safe and are what a
 * reader actually needs.
 *
 * Not shared with `describeRejectedUrl` in `edsHelpers.ts` on purpose: that one
 * is file-private and hardcodes the BYOM length cap. This is the second instance
 * of the idea; a third should extract one parameterised helper into
 * `@/core/validation` and retire both.
 *
 * @param value - The rejected value
 * @param maxLength - Cap above which only the length is reported
 * @returns A safe description, never containing the input
 */
export function fingerprintUrl(value: string, maxLength = DATA_INSTALLER_MAX_URL_LENGTH): string {
    if (value.length > maxLength) {
        return `length=${value.length} chars, exceeds ${maxLength}`;
    }
    try {
        const parsed = new URL(value);
        return `scheme="${parsed.protocol.replace(/:$/, '')}", host="${parsed.hostname}"`;
    } catch {
        return `length=${value.length} chars, not URL-shaped`;
    }
}

/** Drop one trailing slash so joined paths never double up. */
function stripTrailingSlash(url: string): string {
    return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** Serialize query params, omitting the ones with nothing to say. */
function buildSearch(query?: ActionQuery): string {
    if (!query) {
        return '';
    }
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        params.append(key, String(value));
    }
    const search = params.toString();
    return search.length > 0 ? `?${search}` : '';
}
