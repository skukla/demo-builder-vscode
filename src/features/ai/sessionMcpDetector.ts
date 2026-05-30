/**
 * Session MCP Detector
 *
 * Detects Adobe MCPs the user has connected through Claude Code's catalog
 * (the `mcp__claude_ai_*` runtime tool prefixes the agent sees inside a
 * Claude Code session).
 *
 * Data source — best-effort across two undocumented Claude Code files:
 *   1. `~/.claude.json::claudeAiMcpEverConnected` — top-level array of
 *      display names (e.g., `"claude.ai AEM Content - Prod"`). Historical:
 *      entries stay even after a user disconnects the MCP. The only
 *      disk-readable list of session-level MCPs.
 *   2. `~/.claude/mcp-needs-auth-cache.json` — negative-state cache. When
 *      Claude Code attempts an MCP call and gets a 401-equivalent, the
 *      display name is written here. Absence is the closest disk-readable
 *      proxy for "currently authenticated."
 *
 * Schema caveat: both files are undocumented Claude Code internal state.
 * `needsAuth: false` means "not currently flagged for re-auth" — NOT a
 * hard "authenticated" guarantee. Schemas may change without notice.
 *
 * Pure stdlib — no VS Code coupling.
 */

import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import type { SessionMcpEntry } from '@/types/ai';

interface NeedsAuthEntry {
    timestamp?: number;
    id?: string;
}

/**
 * Return one `SessionMcpEntry` per `claudeAiMcpEverConnected` string, with
 * `needsAuth` derived from the needs-auth cache.
 *
 * Returns `[]` when `~/.claude.json` is missing or lacks the array. Throws
 * when `~/.claude.json` exists but is malformed — refuse to silently
 * misread a valid-but-unreadable user config.
 *
 * The needs-auth cache fails soft: missing or malformed treats all entries
 * as `needsAuth: false`. This is intentional — the cache is undocumented
 * internal state, and absence of the file is meaningful (Claude Code hasn't
 * needed to write it yet).
 */
export async function detectSessionMcps(): Promise<SessionMcpEntry[]> {
    const home = os.homedir();
    const everConnected = await readEverConnected(path.join(home, '.claude.json'));
    if (everConnected.length === 0) return [];

    const needsAuth = await readNeedsAuthCache(path.join(home, '.claude', 'mcp-needs-auth-cache.json'));

    return everConnected.map((displayName): SessionMcpEntry => {
        const cacheEntry = needsAuth.get(displayName);
        if (!cacheEntry) {
            return { displayName, needsAuth: false };
        }
        return {
            displayName,
            needsAuth: true,
            ...(typeof cacheEntry.timestamp === 'number' ? { lastSeen: cacheEntry.timestamp } : {}),
        };
    });
}

// ─── Private helpers ──────────────────────────────────────────────────────────

async function readEverConnected(configPath: string): Promise<string[]> {
    let raw: string;
    try {
        raw = await fsPromises.readFile(configPath, 'utf-8');
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw err;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `~/.claude.json is malformed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }

    if (!parsed || typeof parsed !== 'object') return [];
    const everConnected = (parsed as Record<string, unknown>).claudeAiMcpEverConnected;
    if (!Array.isArray(everConnected)) return [];

    return everConnected.filter((v): v is string => typeof v === 'string');
}

async function readNeedsAuthCache(cachePath: string): Promise<Map<string, NeedsAuthEntry>> {
    let raw: string;
    try {
        raw = await fsPromises.readFile(cachePath, 'utf-8');
    } catch {
        // Cache is undocumented internal state; treat any IO failure as empty.
        return new Map();
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return new Map();
    }
    if (!parsed || typeof parsed !== 'object') return new Map();

    const out = new Map<string, NeedsAuthEntry>();
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (value && typeof value === 'object') {
            out.set(key, value as NeedsAuthEntry);
        }
    }
    return out;
}
