/**
 * Reader for the da-auth-helper token cache (`~/.aem/da-token.json`).
 *
 * The `da-auth` agent skill (Adobe's `da-auth-helper` CLI) caches the DA.live
 * Adobe IMS token here after a browser sign-in. `DaLiveAuthService` reads it as
 * a fallback so a token the agent obtained via the skill is recognized by the
 * extension's DA.live operations and MCP tools — it's the same credential
 * (an `admin.da.live` IMS token), just a different front door.
 *
 * Pure and vscode-free so it's unit-testable; the path is injectable. Never
 * throws — a missing/malformed cache simply yields `null` (no token).
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface DaAuthHelperToken {
    accessToken: string;
    /** Expiry as a millisecond epoch. */
    expiresAt: number;
    email?: string;
}

/** Default location da-auth-helper writes its cached token to. */
export function daAuthHelperTokenPath(): string {
    return path.join(os.homedir(), '.aem', 'da-token.json');
}

/**
 * Read and normalize the da-auth-helper token cache. Returns `null` when the
 * file is absent, unreadable, malformed, or lacks a usable token/expiry.
 *
 * @param filePath Cache path (defaults to `~/.aem/da-token.json`); injectable for tests.
 */
export function readDaAuthHelperToken(filePath: string = daAuthHelperTokenPath()): DaAuthHelperToken | null {
    let raw: string;
    try {
        raw = fs.readFileSync(filePath, 'utf8');
    } catch {
        return null; // not present / unreadable
    }

    let data: Record<string, unknown>;
    try {
        data = JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null; // malformed JSON
    }

    const accessToken = pickString(data, ['access_token', 'accessToken', 'token']);
    if (!accessToken) {
        return null;
    }

    const rawExpiry = pickNumber(data, ['expires_at', 'expiresAt', 'expiry']);
    if (rawExpiry === undefined) {
        return null;
    }
    // da-auth-helper writes a millisecond epoch; be defensive about a seconds
    // epoch (values below ~year 2001 in ms are implausible as ms expiries).
    const expiresAt = rawExpiry < 1e12 ? rawExpiry * 1000 : rawExpiry;

    const email = pickString(data, ['email', 'user_email', 'preferred_username']);
    return { accessToken, expiresAt, ...(email ? { email } : {}) };
}

/**
 * Mirror a DA.live token into the da-auth-helper cache so a sign-in done through
 * the extension (webview / MCP `sign_in`) is recognized by the `da-auth` skill.
 *
 * Safe by construction (per da-auth-helper's `src/auth.js`, the cache holds only
 * `access_token` + `expires_at` and no refresh token):
 *  - MERGE-PRESERVE: keeps any unknown fields already in the file (future-proof),
 *    overwriting only `access_token` / `expires_at`.
 *  - FRESHNESS GUARD: never downgrades a cached token that is fresher than ours.
 *  - BEST-EFFORT: never throws; returns whether a write happened.
 *
 * @param token    The token + ms-epoch expiry to mirror.
 * @param filePath Cache path (defaults to `~/.aem/da-token.json`); injectable for tests.
 */
export function writeDaAuthHelperToken(
    token: { accessToken: string; expiresAt: number },
    filePath: string = daAuthHelperTokenPath(),
): boolean {
    try {
        // Don't downgrade a cached token that is at least as fresh as ours.
        const existing = readDaAuthHelperToken(filePath);
        if (existing && existing.expiresAt >= token.expiresAt) {
            return false;
        }

        // Merge-preserve: keep any other fields da-auth-helper may have written.
        let raw: Record<string, unknown> = {};
        try {
            raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, unknown>;
        } catch {
            raw = {};
        }
        const merged = { ...raw, access_token: token.accessToken, expires_at: token.expiresAt };

        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
        return true;
    } catch {
        return false; // best-effort; the extension's own token store is authoritative
    }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.length > 0) {
            return value;
        }
    }
    return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
        if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
            return Number(value);
        }
    }
    return undefined;
}
