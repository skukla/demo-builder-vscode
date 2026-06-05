# Step 4: `collaboratorGate` Helper (token read + identity + collaborator check + TTL cache, graceful)

**Purpose:** A single small focused module that answers one question: "Is the current user a verified collaborator on `skukla/demo-builder-vscode`?" It reads the EDS-stored token directly via `context.secrets`, calls `GET /user` then the collaborator endpoint, caches the boolean with a TTL, and returns `false` on ANY failure. No class hierarchy, no DI, no interfaces.

**Prerequisites:**
- [x] Steps 1-3 green

---

## Tests to Write First

### Unit Tests: `tests/features/updates/services/collaboratorGate.test.ts`

Mocks: `vscode` (SecretStorage), `@/core/utils/timeoutConfig` (`CACHE_TTL.MEDIUM`, `TIMEOUTS.QUICK`), `@/features/updates/services/githubApiClient` (`GITHUB_API_BASE`, `fetchWithTimeout`), `global.fetch`. Mirror mock style from `updateManager-channels.test.ts`. Call `clearCollaboratorCache()` in `beforeEach`.

#### Group 1: token read
- [ ] No `'github-token'` secret → returns `false`, makes NO fetch calls
- [ ] Secret present but invalid JSON → `false` (parse guarded), no throw
- [ ] Secret JSON missing `.token` → `false`

#### Group 2: identity + collaborator happy path
- [ ] Valid token; `GET /user` → `200 { login: 'octocat' }`; collaborator endpoint → `204` → `true`
- [ ] `GET /user` ok; collaborator endpoint → `404` → `false`

#### Group 3: failure → not-collaborator (graceful)
- [ ] `GET /user` → `401` → `false`
- [ ] `GET /user` → network reject → `false`
- [ ] collaborator endpoint → `403` → `false`
- [ ] collaborator endpoint → `500` → `false`

#### Group 4: caching (TTL)
- [ ] Two calls within TTL → only ONE round of fetches (2nd is cache hit)
- [ ] Failure result also cached within TTL (no new fetch on 2nd call)
- [ ] `clearCollaboratorCache()` forces a re-check

#### Group 5: security
- [ ] Token value never appears in any logger call (inspect all mock logger call args)
- [ ] `Authorization` header uses `token <value>` form (assert header KEY present on fetch args; never log the value)

---

## Files to Create/Modify
- [ ] `src/features/updates/services/collaboratorGate.ts` (new)
- [ ] `tests/features/updates/services/collaboratorGate.test.ts` (new)

---

## Implementation Details

### `src/features/updates/services/collaboratorGate.ts`
```typescript
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
    const data = await res.json() as { login?: unknown };
    return typeof data.login === 'string' ? data.login : null;
}

async function fetchIsCollaborator(token: string, login: string): Promise<boolean> {
    const url = `${GITHUB_API_BASE}/repos/${EA_OWNER}/${EA_REPO}/collaborators/${login}`;
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
```

Notes:
- Reuses `fetchWithTimeout` (`githubApiClient.ts:72`, `TIMEOUTS.QUICK`) — no magic numbers.
- Cache TTL = `CACHE_TTL.MEDIUM` (5 min, `timeoutConfig.ts:293`).
- Token never passed to logger.
- Builds its own headers; does NOT use `buildGitHubHeaders` (which reads the different `'githubToken'` raw key — left untouched per the gate-only decision).

### REFACTOR
- Confirm no nested ternaries (early returns). Single responsibility.

---

## Acceptance Criteria
- [ ] All Step 4 tests green, including caching and security (no token logging)
- [ ] Returns `false` on every failure mode; never throws
- [ ] Uses `CACHE_TTL.MEDIUM` + `fetchWithTimeout` (no magic numbers)
- [ ] 100% coverage for `collaboratorGate.ts`

**Estimated Time:** 4-5 hours
