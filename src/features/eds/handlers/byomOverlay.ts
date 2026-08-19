/**
 * BYOM overlay URL resolution and the messages that explain a missing overlay.
 *
 * Resolution and messaging sit together on purpose: every message here names a
 * specific cause the resolver distinguishes (disabled, no URL, rejected URL,
 * 403 on the write), and the pairing is the point — a generic "it failed"
 * string is what these replaced.
 *
 * @module features/eds/handlers/byomOverlay
 */

import * as vscode from 'vscode';
import { getLogger } from '@/core/logging';
import { redactUrlUserParam } from '@/core/utils/maskEmail';
import type { Logger } from '@/types/logger';

const BYOM_MAX_URL_LENGTH = 2048;
const BYOM_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Resolve the BYOM (Bring Your Own Markup) overlay URL with this precedence:
 *   1. VS Code setting `demoBuilder.byom.overlayUrl` (trimmed, non-empty, valid URL,
 *      `https://` scheme or `http://` on a loopback host, ≤ 2048 chars).
 *   2. `fromConfig` parameter (a fallback usually sourced from demo-packages.json).
 *   3. undefined.
 *
 * Invalid setting values log a fingerprint-only warning (raw URL is not logged,
 * to avoid leaking secrets that may appear in query strings) and fall through
 * to `fromConfig`.
 *
 * Used by storefront create, storefront reset, and the AI tool reset path so
 * every EDS create/recreate registers the same overlay against the AEM
 * Configuration Service when the SC has configured one.
 *
 * @param fromConfig - Optional URL from demo-packages.json or similar config
 * @returns The resolved URL, or undefined when none resolves
 */
export function resolveByomOverlayUrl(fromConfig?: string): string | undefined {
    const raw = vscode.workspace.getConfiguration('demoBuilder.byom').get<string>('overlayUrl', '');
    // VS Code's typed `get<string>` returns the default on type mismatch, but
    // be defensive about non-string values (corrupted user settings.json).
    const trimmed = typeof raw === 'string' ? raw.trim() : '';

    if (trimmed.length > 0) {
        const valid = trimmed.length <= BYOM_MAX_URL_LENGTH && isAcceptedOverlayUrl(trimmed);
        if (valid) {
            return trimmed;
        }
        getLogger().warn(
            `[BYOM] Ignoring invalid demoBuilder.byom.overlayUrl setting (${describeRejectedUrl(trimmed)}). Expected https:// (or http://localhost for local dev), max ${BYOM_MAX_URL_LENGTH} chars.`,
        );
        // fall through to fromConfig
    }

    return fromConfig && fromConfig.length > 0 ? fromConfig : undefined;
}

/**
 * Stamp the calling storefront's coordinates onto a BYOM overlay URL.
 *
 * The shared `render-pdp` action receives requests from Helix without a
 * site-context header (`x-forwarded-host` does not arrive). The action
 * recovers context by reading `org` and `site` query params from the
 * registered overlay URL, which Helix preserves verbatim across overlay
 * dispatch. So each storefront's Configuration Service registration
 * must carry its own coordinates on the URL.
 *
 * Existing query params are preserved; an existing `org` or `site` param
 * is overwritten with the supplied value (idempotent re-stamping on
 * reset).
 *
 * @throws if the URL is malformed, or if `org`/`site` is empty
 */
export function appendOverlayParams(url: string, org: string, site: string): string {
    if (!org) throw new Error('appendOverlayParams: org is required');
    if (!site) throw new Error('appendOverlayParams: site is required');
    const parsed = new URL(url); // throws on malformed input
    parsed.searchParams.set('org', org);
    parsed.searchParams.set('site', site);
    return parsed.toString();
}

/**
 * Compose the fully-stamped BYOM overlay URL for a storefront, or undefined
 * when no overlay should be registered.
 *
 * Two settings gate this:
 * 1. `demoBuilder.byom.enabled` (boolean, default true). When false, returns
 *    undefined immediately — the storefront registers without an overlay.
 * 2. `demoBuilder.byom.overlayUrl` (string). When enabled is true but the URL
 *    resolves to nothing (setting and fromConfig both empty), logs a warning
 *    and returns undefined — the user asked for BYOM but didn't supply a URL.
 */
export function resolveByomOverlayConfig(
    fromConfigUrl: string | undefined,
    org: string,
    site: string,
): string | undefined {
    const enabled = vscode.workspace
        .getConfiguration('demoBuilder.byom')
        .get<boolean>('enabled', true);
    if (!enabled) return undefined;

    const baseUrl = resolveByomOverlayUrl(fromConfigUrl);
    if (!baseUrl) {
        getLogger().warn(
            '[BYOM] demoBuilder.byom.enabled is on but demoBuilder.byom.overlayUrl is empty. Skipping overlay registration.',
        );
        return undefined;
    }
    return appendOverlayParams(baseUrl, org, site);
}

/**
 * User-facing message shown when the BYOM content overlay fails to register
 * with the Configuration Service. Without the overlay, Helix resolves
 * `/products/{urlKey}/{sku}` against the da.live content source (where no such
 * doc exists and which needs auth → 401), so product detail pages never load —
 * even though the smart-404 client code is vendored into the storefront. The
 * remedy is a storefront reset, which re-registers the overlay.
 */
export const BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE =
    "Product detail pages will not load: the storefront's BYOM overlay was not " +
    'registered with the Configuration Service. Reset the storefront to register it.';

/**
 * The 403 variant. "Reset the storefront" is the WRONG remedy for a 403: a reset
 * repeats the same PUT with the same identity and is refused the same way.
 *
 * The Configuration Service admin role is minted for the GitHub user who installs
 * the AEM Code Sync App at org creation, so an org predating that flow refuses even
 * its own owner (2026-08-13, leah-b2b-demo — Code Sync verified installed, DA.live
 * accepting the same token). The remedy is a role grant, and it is self-serve:
 * `tools.aem.live/bot/setup`'s "Site users" step writes
 * `POST config/{org}/sites/{site}/access/admin.json` (verified 2026-08-14). The
 * message names that rather than the GitHub App, because re-installing is the
 * slower path and does not help when the org roster is the gap.
 */
export const BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE =
    'Product detail pages will not load: the Configuration Service refused the BYOM overlay ' +
    'registration (403 not authorized). Your Adobe identity holds no admin role on this ' +
    "site's configuration — the role is minted when the AEM Code Sync GitHub App is first " +
    'installed, so an older site can refuse even its own owner. Fix: run ' +
    '"Demo Builder: Manage Site Access" — it names who holds the role and opens the AEM setup ' +
    'tool (https://tools.aem.live/bot/setup), where adding your email under "Site users" with ' +
    'the admin role grants it. Then run "Demo Builder: Repair Site Configuration" to retry ' +
    'this write and republish. Resetting the storefront retries with the same identity and ' +
    'will be refused again.';

/**
 * Pick the user-facing message for a failed overlay registration.
 *
 * @param statusCode - the Configuration Service response status, when known
 * @param setupUrl - the site's Code Sync setup deep link
 *   (`configServiceAccess.buildCodeSyncSetupUrl`). Appended for a 403 ONLY: it
 *   is the remedy for an authorization refusal specifically, and attaching it to
 *   every failure teaches users to ignore it.
 * @returns the 403 authorization message, or the generic registration message
 */
export function byomRegistrationFailureMessage(statusCode?: number, setupUrl?: string): string {
    if (statusCode !== 403) return BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE;
    return setupUrl
        ? `${BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE} Open this site's setup directly: ${setupUrl}`
        : BYOM_OVERLAY_NOT_AUTHORIZED_MESSAGE;
}

/**
 * Why no overlay was registered when none was even attempted.
 *
 * Distinct from {@link BYOM_OVERLAY_REGISTRATION_FAILED_MESSAGE}, which says
 * "was not registered" — wrong here, because there was nothing to register. The
 * two causes need different words: one may be deliberate, the other is a
 * misconfiguration the user can fix.
 */
export const BYOM_DISABLED_MESSAGE =
    'Product detail pages will not load: BYOM overlay registration is turned off ' +
    '(demoBuilder.byom.enabled). Turn it on and reset the storefront if this ' +
    'storefront needs product pages.';

export const BYOM_OVERLAY_URL_MISSING_MESSAGE =
    'Product detail pages will not load: no BYOM overlay URL is configured ' +
    '(demoBuilder.byom.overlayUrl), or the configured value was rejected. Set a ' +
    'valid https:// URL and reset the storefront.';

/**
 * Explain why no overlay URL resolved, for the caveat channel.
 *
 * Call only when the resolved overlay URL is absent. Setup previously reported
 * plain success in this case: the "not registered" check was gated on the URL
 * being truthy, so turning BYOM off or supplying an invalid URL skipped the
 * check entirely and the run ended on "Storefront setup completed
 * successfully!" for a storefront that can never serve a PDP.
 *
 * @returns the caveat sentence matching the cause
 */
export function explainAbsentOverlay(): string {
    const enabled = vscode.workspace
        .getConfiguration('demoBuilder.byom')
        .get<boolean>('enabled', true);
    return enabled ? BYOM_OVERLAY_URL_MISSING_MESSAGE : BYOM_DISABLED_MESSAGE;
}

/**
 * Append a PDP caveat, skipping duplicates.
 *
 * Structurally typed rather than taking `RepoInfo`, so this module stays free of
 * the setup types and the phases can call it without an import cycle. Dedupes
 * because phase 3's catch path and its success path can both fire for one run.
 *
 * @param target - the repoInfo (or any caveat carrier) being threaded
 * @param caveat - a user-facing sentence
 */
export function addPdpCaveat(target: { pdpCaveats?: string[] }, caveat: string): void {
    target.pdpCaveats ??= [];
    if (!target.pdpCaveats.includes(caveat)) target.pdpCaveats.push(caveat);
}

/**
 * Explain a skipped smart-404 install.
 *
 * `installSmart404Handler` is non-fatal by design and returns `{installed,
 * reason}`. Both call sites discarded that value, so a storefront could ship
 * without the client-side PDP recovery and still report Complete.
 *
 * @param reason - the publisher's own reason string, when it gave one
 */
export function describeSmart404Skip(reason?: string): string {
    return (
        'Product detail pages may not recover on first visit: the smart-404 handler ' +
        `was not installed${reason ? ` (${reason})` : ''}. Reset the storefront to ` +
        'reinstall it.'
    );
}

/**
 * Surface a failed BYOM overlay registration. Logs at error level always;
 * shows a warning toast only when a `showWarning` callback is wired. Called from
 * storefront create and reset when an overlay URL was configured but the
 * Configuration Service write did not succeed — preventing a storefront from
 * silently shipping with smart-404 client code but no overlay to back it (the
 * state that makes every PDP show "Product not available").
 *
 * Headless safety mirrors `reportUnapplied` in `patchReportHelper`: MCP / AI
 * contexts pass nothing and get logging only; UI-bound callers wire
 * `vscode.window.showWarningMessage`.
 */
export function surfaceOverlayRegistrationFailure(
    logger: Logger,
    showWarning?: (message: string, ...actions: string[]) => Thenable<string | undefined> | void,
    statusCode?: number,
    setupUrl?: string,
): void {
    const message = byomRegistrationFailureMessage(statusCode, setupUrl);
    // The LOG copy is redacted; the toast and the browser get the full URL.
    // The setup link carries the signed-in address as `?user=`, percent-encoded,
    // and `logger.error` is buffered into the debug export users paste into
    // tickets. Encoding is why the generic email masking missed it.
    logger.error(`[BYOM] ${redactUrlUserParam(message)}`);

    // A 403 is the only case with an in-app route: the role has to change hands
    // first, then the refused write has to be retried. Other failures get the
    // plain toast, because offering a repair that will fail the same way is
    // worse than offering nothing.
    const actions = statusCode === 403 ? OVERLAY_403_ACTIONS : [];
    const shown = showWarning?.(message, ...actions);

    // `void` covers the headless callers, which pass a plain logger-ish sink.
    if (!shown || typeof (shown as Thenable<string | undefined>).then !== 'function') return;
    void (shown as Thenable<string | undefined>).then((choice) => {
        if (choice === MANAGE_ACCESS_ACTION) {
            void vscode.commands.executeCommand('demoBuilder.manageSiteAccess');
        } else if (choice === REPAIR_ACTION) {
            void vscode.commands.executeCommand('demoBuilder.repairSiteConfiguration');
        }
    });
}

const MANAGE_ACCESS_ACTION = 'Manage Site Access';
const REPAIR_ACTION = 'Repair Site Configuration';
/** Diagnose first, then retry — the order someone actually has to do them in. */
const OVERLAY_403_ACTIONS = [MANAGE_ACCESS_ACTION, REPAIR_ACTION];

function isAcceptedOverlayUrl(value: string): boolean {
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        return false;
    }
    if (parsed.protocol === 'https:') return true;
    if (parsed.protocol === 'http:' && BYOM_LOOPBACK_HOSTS.has(parsed.hostname)) return true;
    return false;
}

/**
 * Describe a rejected URL without echoing it. Avoids leaking secrets that
 * sometimes appear in query strings (e.g., when a user pastes a token-bearing
 * URL by mistake).
 */
function describeRejectedUrl(value: string): string {
    if (value.length > BYOM_MAX_URL_LENGTH) {
        return `length=${value.length} chars, exceeds ${BYOM_MAX_URL_LENGTH}`;
    }
    try {
        const parsed = new URL(value);
        return `scheme="${parsed.protocol.replace(/:$/, '')}", host="${parsed.hostname}"`;
    } catch {
        return `length=${value.length} chars, not URL-shaped`;
    }
}
