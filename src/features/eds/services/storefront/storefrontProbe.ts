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
 * ## Do not call a leg by what you wish it proved
 *
 * The first version reported `/products/default` as `prerendered`. That path is
 * the overlay's authored SOURCE — `render-pdp` fetches it and returns it as the
 * body for real PDPs — so it answers 200 whether or not the overlay is
 * registered, the action is deployed, or the snippet was ever vendored. A
 * storefront that could not serve a single PDP came back "Storefront delivery
 * looks correct." Each leg here is named for the request it makes, and the
 * verdict states what was NOT checked.
 *
 * Pattern: mirrors `configServiceProbe` — structured legs plus a one-line verdict,
 * so Diagnostics renders rather than reasons.
 *
 * @module features/eds/services/storefront/storefrontProbe
 */

import { SMART_404_HEAD_MARKER_START, SMART_404_MARKER_START } from '../pdp/pdp404Snippet';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

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
    /**
     * `/products/default` — the overlay's SOURCE template, not a prerendered page.
     *
     * `render-pdp` fetches this authored page and returns it as the body for a
     * real PDP path, so its absence breaks every PDP. Its presence proves only
     * that the input exists. Only present when a path was supplied.
     */
    authoredTemplate?: { path: string; status: number; published: boolean };
    /**
     * A real product's PDP — the only leg that exercises the whole chain.
     *
     * Present only when a SKU could be sampled from the catalog. The SKU is
     * known to exist, which is what removes the ambiguity that kept this probe
     * pointed at `/products/default`: a 404 here means the chain is broken, not
     * that the product has no page.
     */
    pdp?: { path: string; sku: string; status: number; served: boolean };
    /**
     * Which build of the shared overlay action is deployed.
     *
     * Reported for the reader to compare against `accs-discovery-service`'s git
     * log; the extension never asserts on it. Absent when no overlay URL was
     * supplied.
     */
    overlay?: OverlayVersion;
    /** One line naming the most likely cause, for the diagnostics summary. */
    verdict: string;
}

/** A catalog-confirmed product to probe. Built by `pickSampleSku`. */
export interface PdpProbeTarget {
    path: string;
    sku: string;
}

/** What the deployed overlay action reports about itself. */
export interface OverlayVersion {
    sha?: string;
    version?: string;
    /** True when the action answered but predates the `/__version` endpoint. */
    unknown: boolean;
}

/**
 * Ask the deployed overlay action which build it is.
 *
 * Reported, never compared. The extension does not know which revision it
 * wants: the overlay URL is a user setting pointing at an action in another
 * repo, so any expectation baked in here would go red on every legitimate
 * deploy of that action. A human compares the sha to the other repo's git log.
 *
 * A 404 means the action predates the endpoint, which is the normal state of
 * every storefront in the field until that action redeploys. That is "unknown",
 * not a fault.
 *
 * @param overlayUrl - the registered overlay URL (query string is discarded)
 * @returns the reported build, or `{unknown: true}` for anything else
 */
export async function probeOverlayVersion(overlayUrl: string): Promise<OverlayVersion> {
    try {
        const base = new URL(overlayUrl);
        base.search = '';
        const response = await fetch(`${base.toString().replace(/\/$/, '')}/__version`, {
            method: 'GET',
            signal: AbortSignal.timeout(TIMEOUTS.QUICK),
        });
        if (response.status !== 200) return { unknown: true };
        const body = (await response.json()) as { sha?: unknown; version?: unknown };
        const sha = typeof body?.sha === 'string' ? body.sha : undefined;
        const version = typeof body?.version === 'string' ? body.version : undefined;
        // A malformed body is as uninformative as a 404 — do not surface a
        // half-answer that reads like a real version.
        if (!sha && !version) return { unknown: true };
        return { sha, version, unknown: false };
    } catch {
        return { unknown: true };
    }
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
    if (result.authoredTemplate && !result.authoredTemplate.published) {
        // Not ambiguous the way a real SKU would be: `render-pdp` reads this exact
        // page and returns it as the body for every PDP, so its absence breaks all
        // of them.
        return (
            `PDP fallback installed, but the overlay's source template ` +
            `${result.authoredTemplate.path} returned ${result.authoredTemplate.status}. ` +
            'Publish it or reset the storefront — every PDP renders from this page.'
        );
    }
    if (result.pdp && !result.pdp.served) {
        // Two causes, and this probe cannot separate them — say both.
        //
        // Confirming the SKU exists removes one ambiguity (it is not a typo or a
        // deleted product) but not the other. Cold-path recovery is CLIENT-side:
        // `delayed.js` runs in a browser and calls prepublish-pdp. A fetch never
        // triggers it, so any SKU that pre-warming did not cover and no visitor
        // has opened returns 404 on a perfectly healthy storefront.
        //
        // Observed 2026-08-10 on a storefront whose other legs were all green:
        // pre-warming had never run (catalog enumeration was failing under a
        // stale scope), so catalog SKUs were simply unpublished. Naming the
        // chain as the cause there would be a false alarm — the same
        // over-claiming, pointed the other way, that made this probe report a
        // prerender that never happened.
        return (
            `SKU ${result.pdp.sku} exists in the catalog but ${result.pdp.path} returned ` +
            `${result.pdp.status}. Either no page has been published for it ` +
            '(pre-warming did not cover it, and this check cannot trigger the ' +
            'browser-side recovery), or the prerender chain is not serving PDPs. ' +
            'Open the URL in a browser to tell the two apart.'
        );
    }
    if (result.pdp) {
        // Says what was proved and stops there: nothing here runs page
        // JavaScript, so an empty product block still renders as a 200.
        return (
            `PDP for SKU ${result.pdp.sku} renders. Page scripts were not executed, ` +
            'so this does not confirm the product data loaded.'
        );
    }
    // Bounded on purpose. Four GETs establish that the delivery pieces are in
    // place; they do not establish that any product page renders. Claiming
    // "delivery looks correct" outright was how a broken storefront came back
    // clean.
    return 'Storefront delivery looks correct (fallback installed, template published). No SKU was checked.';
}

/**
 * Probe what a storefront is actually serving.
 *
 * @param owner - GitHub owner
 * @param repo - GitHub repository name
 * @param logger - for the one-line verdict
 * @param templatePath - optional path to the overlay's SOURCE template,
 *   `/products/default`. Not a PDP: see `authoredTemplate`.
 * @param pdpTarget - optional catalog-confirmed product to probe. Supplying it
 *   is what turns this from "the pieces are installed" into "a product page
 *   actually renders"; resolve it with `pickSampleSku`.
 * @returns the legs plus a verdict
 */
export async function probeStorefrontDelivery(
    owner: string,
    repo: string,
    logger: Logger,
    templatePath?: string,
    pdpTarget?: PdpProbeTarget,
    overlayUrl?: string,
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

        if (templatePath) {
            // A 200 is the whole signal. The earlier version also required the
            // commerce block markup and called the result `prerendered`, which
            // conflated "this authored page is published" with "a PDP rendered" —
            // two different claims, and only the first is testable here.
            const template = await get(baseUrl, templatePath);
            result.authoredTemplate = {
                path: templatePath,
                status: template.status,
                published: template.status === 200,
            };
        }

        if (pdpTarget) {
            const pdp = await get(baseUrl, pdpTarget.path);
            result.pdp = {
                path: pdpTarget.path,
                sku: pdpTarget.sku,
                status: pdp.status,
                served: pdp.status === 200,
            };
        }
    }

    // Independent of site reachability: which action is deployed is worth
    // knowing even when the storefront itself is down.
    if (overlayUrl) {
        result.overlay = await probeOverlayVersion(overlayUrl);
    }

    result.verdict = verdictFor(result);
    logger.info(`[Storefront Probe] ${result.verdict}`);
    return result;
}
