/**
 * Last-known-good (LKG) SHA reader.
 *
 * Per ADR-006 D2 the patches repo (`eds-demo-patches`) hosts a plain-text
 * `last-known-good` file at its root holding ONLY the verified canonical
 * SHA. This matches the Chromium LKGR / Nix `git-revision` convention: the
 * file's git history is the audit log; rich detail (verifiedAt, canonical
 * ref, patch-set state) belongs in the automation commit message.
 *
 * Returns `undefined` for ALL failure modes (HTTP error, network error,
 * malformed body) so the caller can fall back to canonical HEAD per D1
 * proceed-and-warn. Each failure path logs a warn line — silent failure
 * is never the contract.
 *
 * @module features/eds/services/lkgReader
 */

import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { Logger } from '@/types';

/** Strict 40-hex SHA shape. */
const SHA_PATTERN = /^[0-9a-f]{40}$/;

/** Cap malformed-body excerpts in log lines so they don't dominate the log. */
const MALFORMED_BODY_LOG_CAP = 80;

/**
 * Patches-repo coordinates needed to construct the LKG fetch URL.
 *
 * Note: this is intentionally narrower than `CodePatchSource` — LKG lives
 * at the patches-repo ROOT, not in any `path` subdirectory. Callers pass
 * `{owner, repo}` directly without leaking their `path` choice.
 */
export interface LkgSource {
    owner: string;
    repo: string;
}

/**
 * Fetch the verified canonical SHA from the patches repo's `last-known-good`
 * file.
 *
 * Validates 40-hex shape after trimming whitespace. Returns the SHA on
 * success; logs a warn line and returns `undefined` on any failure (HTTP
 * non-2xx, network error, missing file, malformed body, short / non-hex
 * content). Caller decides what to do — typical fallback is canonical HEAD.
 */
export async function readLkgSha(
    source: LkgSource,
    logger: Logger,
): Promise<string | undefined> {
    const url = `https://raw.githubusercontent.com/${source.owner}/${source.repo}/main/last-known-good`;
    try {
        const response = await fetch(url, {
            signal: AbortSignal.timeout(TIMEOUTS.NORMAL),
        });
        if (!response.ok) {
            logger.warn(`[LKG] Fetch failed: HTTP ${response.status} ${response.statusText}`);
            return undefined;
        }
        const raw = await response.text();
        const trimmed = raw.trim();
        if (!SHA_PATTERN.test(trimmed)) {
            const excerpt = trimmed.length > MALFORMED_BODY_LOG_CAP
                ? `${trimmed.substring(0, MALFORMED_BODY_LOG_CAP)}…`
                : trimmed;
            logger.warn(`[LKG] Invalid SHA shape in last-known-good: "${excerpt}"`);
            return undefined;
        }
        return trimmed;
    } catch (error) {
        logger.warn(`[LKG] Fetch error: ${(error as Error).message}`);
        return undefined;
    }
}
