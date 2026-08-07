/**
 * Storefront delivery probe.
 *
 * Answers a question the setup logs cannot: they record what the run that CREATED
 * the site attempted, not what is serving now. When a colleague reports "PDPs
 * don't work", nothing said whether the smart-404 snippet and the eager redirect
 * are actually deployed, or whether a given PDP URL resolves at all — so triage
 * reread creation logs that had been accurate at the time and were silent about
 * the present.
 *
 * ## Read-only by construction
 *
 * Every leg is a GET, and a test enforces it. A diagnostic that wrote to a live
 * storefront could break the demo it was called to explain.
 *
 * ## What it deliberately does NOT do
 *
 * Nothing here executes page JavaScript, so it cannot see whether the PDP dropin
 * hydrated or what its GraphQL call returned. That needs a real browser or in-page
 * instrumentation. This probe covers the delivery layer — which is the class of
 * failure that has actually cost time.
 *
 * Pattern: mirrors `configServiceProbe` — structured legs plus a one-line verdict,
 * so Diagnostics renders rather than reasons.
 *
 * @module features/eds/services/storefrontProbe
 */

import { SMART_404_HEAD_MARKER_START, SMART_404_MARKER_START } from './pdp404HandlerPublisher';
// HOTFIX ADAPTATION (.126, off v1.0.0-beta.125): develop extracted these markers
// into `pdp404Snippet.ts`; on this lineage they still live in the publisher, where
// they were module-private until this change. Reconcile at the merge-back —
// develop's location wins.
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/** The block the commerce PDP template renders into — present on any served PDP. */
const PDP_BLOCK_CLASS = 'class="product-details"';

/** One fetched artifact and whether it carries the marker that proves it installed. */
interface MarkerLeg {
    installed: boolean;
    status?: number;
    error?: string;
}

export interface StorefrontProbeResult {
    baseUrl: string;
    /** Whether the site answers at all. Later legs are skipped when it does not. */
    site: { reachable: boolean; status?: number; error?: string };
    /** `scripts/delayed.js` — the client-side smart-404 handler. */
    smart404Snippet?: MarkerLeg;
    /** `404.html` — the eager redirect that runs before the handler. */
    eagerRedirect?: MarkerLeg;
    /** Only present when a path was supplied — an invented one 404s like a finding. */
    pdp?: { path: string; status: number; prerendered: boolean };
    /** One line naming the most likely cause, for the diagnostics summary. */
    verdict: string;
}

/**
 * The published live URL for a GitHub-keyed storefront.
 *
 * GitHub owner/repo, NOT the DA.live org/site — per `project_config_service_key`
 * those are different keys and are not interchangeable.
 *
 * @param owner - GitHub owner
 * @param repo - GitHub repository name
 * @returns the aem.live base URL, no trailing slash
 */
export function aemLiveBaseUrl(owner: string, repo: string): string {
    return `https://main--${repo}--${owner}.aem.live`;
}

/** GET a path, returning its status and body. Never anything but GET. */
async function get(
    baseUrl: string,
    path: string,
): Promise<{ status: number; body: string; error?: string }> {
    try {
        const response = await fetch(`${baseUrl}${path}`, {
            method: 'GET',
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        return { status: response.status, body: await response.text() };
    } catch (error) {
        return { status: 0, body: '', error: (error as Error).message };
    }
}

/** Fetch an artifact and report whether it carries its install marker. */
async function markerLeg(baseUrl: string, path: string, marker: string): Promise<MarkerLeg> {
    const { status, body, error } = await get(baseUrl, path);
    if (error) return { installed: false, error };
    return { installed: status === 200 && body.includes(marker), status };
}

/**
 * Compose the one-line verdict from the legs.
 *
 * Names the missing piece rather than restating the legs — the report already
 * prints those, and a verdict that adds nothing is noise.
 */
function verdictFor(result: StorefrontProbeResult): string {
    if (!result.site.reachable) {
        return (
            `Storefront unreachable at ${result.baseUrl}` +
            `${result.site.status ? ` (HTTP ${result.site.status})` : ''}.`
        );
    }
    const missing: string[] = [];
    if (result.smart404Snippet && !result.smart404Snippet.installed)
        missing.push('smart 404 handler');
    if (result.eagerRedirect && !result.eagerRedirect.installed) missing.push('eager redirect');
    if (missing.length > 0) {
        return (
            `Storefront is serving, but the PDP fallback is incomplete: ${missing.join(' and ')}` +
            ' missing. Reset the storefront to reinstall.'
        );
    }
    if (result.pdp && !result.pdp.prerendered) {
        // Deliberately not called a failure: a 404 here also means that SKU simply
        // has no published page, which is not a broken storefront.
        return (
            `PDP fallback installed. ${result.pdp.path} returned ${result.pdp.status} —` +
            ' either no page is published for that SKU, or publishing did not reach it.'
        );
    }
    return 'Storefront delivery looks correct.';
}

/**
 * Probe what a storefront is actually serving.
 *
 * @param owner - GitHub owner
 * @param repo - GitHub repository name
 * @param logger - for the one-line verdict
 * @param pdpPath - optional PDP path to test, e.g. `/products/default`
 * @returns the legs plus a verdict
 */
export async function probeStorefrontDelivery(
    owner: string,
    repo: string,
    logger: Logger,
    pdpPath?: string,
): Promise<StorefrontProbeResult> {
    const baseUrl = aemLiveBaseUrl(owner, repo);
    const root = await get(baseUrl, '/');

    const result: StorefrontProbeResult = {
        baseUrl,
        site: {
            reachable: root.status >= 200 && root.status < 400,
            status: root.status || undefined,
            error: root.error,
        },
        verdict: '',
    };

    // A dead site would report every marker as missing, which reads as "reinstall"
    // when the answer is "the site is down". Stop here instead.
    if (result.site.reachable) {
        result.smart404Snippet = await markerLeg(
            baseUrl,
            '/scripts/delayed.js',
            SMART_404_MARKER_START,
        );
        result.eagerRedirect = await markerLeg(baseUrl, '/404.html', SMART_404_HEAD_MARKER_START);

        if (pdpPath) {
            const pdp = await get(baseUrl, pdpPath);
            result.pdp = {
                path: pdpPath,
                status: pdp.status,
                prerendered: pdp.status === 200 && pdp.body.includes(PDP_BLOCK_CLASS),
            };
        }
    }

    result.verdict = verdictFor(result);
    logger.info(`[Storefront Probe] ${result.verdict}`);
    return result;
}
