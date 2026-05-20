/**
 * Helix Admin API client (vscode-free).
 *
 * Pure HTTP wrapper for the subset of admin.hlx.page endpoints the storefront
 * sync flow needs (preview, publish, preview+publish). Exists so both the
 * extension process (via `helixService.ts`) and the standalone MCP server
 * process (via `mcp-server.ts`) can drive Helix without dragging in `vscode`.
 *
 * Tokens are passed in by callers — this module does NOT discover or refresh
 * them. The extension obtains tokens through `GitHubTokenService` and the
 * DA.live IMS flow; the MCP server reads them from environment variables.
 */

const HELIX_ADMIN_URL = 'https://admin.hlx.page';
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

function normalizeWebPath(p: string): string {
    if (!p) return '/';
    return p.startsWith('/') ? p : `/${p}`;
}

function buildHeaders(tokens: HelixTokens): Record<string, string> {
    return {
        'x-auth-token': tokens.githubToken,
        'x-content-source-authorization': `Bearer ${tokens.daLiveToken}`,
    };
}

async function callHelix(
    url: string,
    tokens: HelixTokens,
    operationLabel: string,
    options: HelixApiOptions = {},
): Promise<void> {
    const response = await fetch(url, {
        method: 'POST',
        headers: buildHeaders(tokens),
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
    const url = `${HELIX_ADMIN_URL}/preview/${org}/${site}/${branch}${normalizeWebPath(path)}`;
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
    const url = `${HELIX_ADMIN_URL}/live/${org}/${site}/${branch}${normalizeWebPath(path)}`;
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
