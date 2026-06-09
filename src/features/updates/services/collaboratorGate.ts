import * as vscode from 'vscode';
import { GITHUB_API_BASE, fetchWithTimeout } from './githubApiClient';
import { CACHE_TTL } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types/logger';

/**
 * EDS stores the GitHub OAuth token under this key as JSON
 * `{ token, tokenType, scopes }` — see
 * src/features/eds/services/githubTokenService.ts:27 and :49-50
 * (type at src/features/eds/services/types.ts:11-17).
 * We read it directly (not via the EDS service) to respect the
 * features-import rule (updates must not import from features/eds).
 */
const EDS_TOKEN_KEY = 'github-token';

/** Repo whose collaborators may use the early-access channel. */
const EA_OWNER = 'skukla';
const EA_REPO = 'demo-builder-vscode';

interface CacheEntry {
    isCollaborator: boolean;
    timestamp: number;
}
let cache: CacheEntry | null = null;

/** Test/maintenance hook to force a fresh check. */
export function clearCollaboratorCache(): void {
    cache = null;
}

async function readEdsToken(secrets: vscode.SecretStorage): Promise<string | null> {
    const stored = await secrets.get(EDS_TOKEN_KEY);
    if (!stored) return null;
    try {
        const parsed = JSON.parse(stored) as { token?: unknown };
        return typeof parsed.token === 'string' && parsed.token.length > 0
            ? parsed.token
            : null;
    } catch {
        return null;
    }
}

function authHeaders(token: string): Record<string, string> {
    return {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Demo-Builder-VSCode',
        Authorization: `token ${token}`,
    };
}

async function fetchLogin(token: string): Promise<string | null> {
    const res = await fetchWithTimeout(`${GITHUB_API_BASE}/user`, { headers: authHeaders(token) });
    if (!res.ok) return null;
    const data = (await res.json()) as { login?: unknown };
    return typeof data.login === 'string' ? data.login : null;
}

async function fetchIsCollaborator(token: string, login: string): Promise<boolean> {
    // Encode the login (from GET /user) defensively, even though GitHub logins
    // are constrained — never trust a remote value interpolated into a URL path.
    const url = `${GITHUB_API_BASE}/repos/${EA_OWNER}/${EA_REPO}/collaborators/${encodeURIComponent(login)}`;
    const res = await fetchWithTimeout(url, { headers: authHeaders(token) });
    // 204 => collaborator; 404 => not; anything else => treat as not (graceful)
    return res.status === 204;
}

async function computeIsCollaborator(
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<boolean> {
    try {
        const token = await readEdsToken(secrets);
        if (!token) {
            logger.debug('[Updates] Early-access gate: no GitHub token; treating as non-collaborator');
            return false;
        }
        const login = await fetchLogin(token);
        if (!login) {
            logger.debug('[Updates] Early-access gate: identity check failed; treating as non-collaborator');
            return false;
        }
        const isCollab = await fetchIsCollaborator(token, login);
        logger.debug(`[Updates] Early-access gate: collaborator=${isCollab}`);
        return isCollab;
    } catch (error) {
        logger.debug(`[Updates] Early-access gate check failed: ${(error as Error).message}`);
        return false;
    }
}

/**
 * Returns true only when the current GitHub user is a verified collaborator
 * on skukla/demo-builder-vscode. ANY failure (no token, bad JSON, 401/403/404,
 * network, timeout) returns false. Result cached for CACHE_TTL.MEDIUM.
 * Never logs the token.
 */
export async function isRepoCollaborator(
    secrets: vscode.SecretStorage,
    logger: Logger,
): Promise<boolean> {
    if (cache && Date.now() - cache.timestamp < CACHE_TTL.MEDIUM) {
        return cache.isCollaborator;
    }
    const result = await computeIsCollaborator(secrets, logger);
    cache = { isCollaborator: result, timestamp: Date.now() };
    return result;
}
