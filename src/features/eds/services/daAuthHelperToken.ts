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
