/**
 * Helix Admin API client (vscode-free).
 *
 * Pure HTTP wrapper for the subset of admin.hlx.page endpoints the storefront
 * sync flow needs (preview, publish, preview+publish, unpublish). Used by the
 * MCP server and `storefrontSyncService`.
 *
 * SINGLE SOURCE for Helix URL spelling and credentials (2026-08-22
 * consolidation): `buildPartitionUrl`, `buildPublishHeaders` and
 * `buildDeleteHeaders` are THE definitions — `helixService` imports them
 * rather than carrying its own (the two things that drifted twice were
 * exactly URL spelling and credentials: the DELETE credential in 2026-08-04,
 * the missing publish `Authorization` found by the spine sweep). Per-call
 * policy — error mapping, 429/400 retry loops, bulk orchestration, token
 * discovery — stays with each caller; only the wire spelling lives here.
 *
 * Tokens are passed in by callers — this module does NOT discover or refresh
 * them. The extension obtains tokens through `GitHubTokenService` and the
 * DA.live IMS flow; the MCP server reads them from environment variables.
 */

export const HELIX_ADMIN_URL = 'https://admin.hlx.page';
const DEFAULT_BRANCH = 'main';
const DEFAULT_TIMEOUT_MS = 180_000;

export interface HelixTokens {
    /** GitHub token used as `x-auth-token` header */
    githubToken: string;
    /** DA.live IMS access token used for the `x-content-source-authorization` header */
    daLiveToken: string;
}

export interface HelixApiOptions {
    /** AbortSignal timeout in milliseconds (default: 180000). */
    timeoutMs?: number;
}

export class HelixApiError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
        this.name = 'HelixApiError';
    }
}

/**
 * Canonical Helix path normalization: leading slash added, trailing slash
 * trimmed (except root) — the trim rule came from helixService's copy when
 * the two were unified.
 */
export function normalizeWebPath(p: string): string {
    if (!p) return '/';
    const withLead = p.startsWith('/') ? p : `/${p}`;
    return withLead.endsWith('/') && withLead !== '/' ? withLead.slice(0, -1) : withLead;
}

/** The Helix Admin partitions this codebase addresses. */
export type HelixPartition = 'preview' | 'live' | 'code' | 'status' | 'cache';

/** THE spelling of a partition URL — every Helix caller builds through here. */
export function buildPartitionUrl(
    partition: HelixPartition,
    org: string,
    site: string,
    branch: string,
    path: string,
): string {
    return `${HELIX_ADMIN_URL}/${partition}/${org}/${site}/${branch}${normalizeWebPath(path)}`;
}

/**
 * PUBLISH/PREVIEW credential. Authorization FIRST and load-bearing: once a
 * site carries any `access.admin` role — which the setup pipeline itself
 * grants — the admin API closes to callers without an accepted admin
 * identity, and the GitHub token is not one. This builder lacked the header
 * until the 2026-08-22 consolidation, so MCP-driven publishes failed on
 * exactly the protected sites the extension had just created (same drift
 * class as the DELETE credential, 2026-08-04).
 */
export function buildPublishHeaders(tokens: HelixTokens): Record<string, string> {
    return {
        Authorization: `Bearer ${tokens.daLiveToken}`,
        'x-auth-token': tokens.githubToken,
        'x-content-source-authorization': `Bearer ${tokens.daLiveToken}`,
    };
}

/**
 * DELETE credential — DIFFERENT from publish, and load-bearing.
 *
 * The Admin API refuses `DELETE /live` while the source still exists in
 * fstab.yaml. Only the DA.live IMS Bearer bypasses it; the tested matrix (ADR-002)
 * was GitHub token -> 403, API key -> 403, DA.live Bearer -> 204.
 *
 * This client reused {@link buildHeaders} for DELETE until 2026-08-04 — sending
 * the PUBLISH credential and no `Authorization` at all — while its docstring
 * claimed to mirror `helixService.deleteResource`. It mirrored the semantics
 * (204/404 ok, 401/403 non-fatal) and not the credential, and because 403 is
 * deliberately non-fatal the failure surfaced as a silent 'partial'.
 *
 * Matches `helixService.getDeleteAuthHeaders` exactly: the Bearer ALONE. The
 * publish token is withheld rather than sent alongside — the matrix says it 403s,
 * and sending both would leave it ambiguous which credential Helix honoured.
 */
export function buildDeleteHeaders(tokens: Pick<HelixTokens, 'daLiveToken'>): Record<string, string> {
    return { Authorization: `Bearer ${tokens.daLiveToken}` };
}

async function callHelix(
    url: string,
    tokens: HelixTokens,
    operationLabel: string,
    options: HelixApiOptions = {},
): Promise<void> {
    const response = await fetch(url, {
        method: 'POST',
        headers: buildPublishHeaders(tokens),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (response.status === 401) {
        throw new HelixApiError(
            `${operationLabel}: GitHub authentication failed (401). Token may be expired or lacking write access.`,
            401,
        );
    }
    if (response.status === 403) {
        throw new HelixApiError(
            `${operationLabel}: access denied (403). Token does not have permission for this site.`,
            403,
        );
    }
    if (!response.ok) {
        throw new HelixApiError(
            `${operationLabel} failed: ${response.status} ${response.statusText}`,
            response.status,
        );
    }
}

export async function previewPage(
    org: string,
    site: string,
    path: string,
    branch: string,
    tokens: HelixTokens,
    options?: HelixApiOptions,
): Promise<void> {
    const url = buildPartitionUrl('preview', org, site, branch, path);
    await callHelix(url, tokens, 'Preview', options);
}

export async function publishPage(
    org: string,
    site: string,
    path: string,
    branch: string,
    tokens: HelixTokens,
    options?: HelixApiOptions,
): Promise<void> {
    const url = buildPartitionUrl('live', org, site, branch, path);
    await callHelix(url, tokens, 'Publish', options);
}

/**
 * Preview then publish a single page. Mirrors `helixService.previewAndPublishPage`
 * but is vscode-free.
 */
export async function previewAndPublishPage(
    org: string,
    site: string,
    path: string = '/',
    branch: string = DEFAULT_BRANCH,
    tokens: HelixTokens,
    options?: HelixApiOptions,
): Promise<void> {
    await previewPage(org, site, path, branch, tokens, options);
    await publishPage(org, site, path, branch, tokens, options);
}

/**
 * Issue a DELETE against one Helix partition (live or preview).
 *
 * Mirrors `helixService.deleteResource` — semantics AND credential (see
 * {@link buildDeleteHeaders}; the credential half was missing until 2026-08-04) —
 * but vscode-free:
 *   - 204 / 404 → success (404 = already absent)
 *   - 401 / 403 → non-fatal failure (returns false; caller decides)
 *   - 429 / 5xx / other non-OK → throw `HelixApiError`
 */
async function deleteHelixPartition(
    partition: 'live' | 'preview',
    org: string,
    site: string,
    path: string,
    branch: string,
    tokens: HelixTokens,
    options: HelixApiOptions = {},
): Promise<boolean> {
    const url = buildPartitionUrl(partition, org, site, branch, path);
    const response = await fetch(url, {
        method: 'DELETE',
        headers: buildDeleteHeaders(tokens),
        signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    if (response.status === 204 || response.status === 404 || response.ok) {
        return true;
    }
    if (response.status === 401 || response.status === 403) {
        // Auth failure is non-fatal — the caller (unregister flow) reports it
        // as a partial result rather than aborting the whole operation.
        return false;
    }
    throw new HelixApiError(
        `Unpublish (${partition}) failed: ${response.status} ${response.statusText}`,
        response.status,
    );
}

/**
 * Unpublish a single page from the live partition, then delete its preview.
 *
 * Vscode-free counterpart to `helixService.unpublishPage`/`unpublishPages`.
 * Returns `false` if either partition DELETE hit an auth failure (401/403) —
 * non-fatal so the caller can report a partial unpublish. Throws on 5xx/429.
 *
 * @returns `true` when both live + preview deletes succeeded (or were already
 *          absent); `false` when an auth failure blocked one of them.
 */
export async function unpublishPage(
    org: string,
    site: string,
    path: string = '/',
    branch: string = DEFAULT_BRANCH,
    tokens: HelixTokens,
    options?: HelixApiOptions,
): Promise<boolean> {
    const liveOk = await deleteHelixPartition('live', org, site, path, branch, tokens, options);
    const previewOk = await deleteHelixPartition('preview', org, site, path, branch, tokens, options);
    return liveOk && previewOk;
}
