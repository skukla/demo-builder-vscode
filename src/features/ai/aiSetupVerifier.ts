/**
 * AI Setup Verifier — backs the standalone AI Overview screen.
 *
 * Verifies that a project's AI context files are present and valid:
 * - AGENTS.md: exists and non-empty (the real AI context file; `CLAUDE.md`
 *   and `.claude/CLAUDE.md` are one-line pointers to it)
 * - .claude/mcp.json: exists, valid JSON, has mcpServers key
 * - mcp-binary: dist/mcp-proxy.js present at extension dist path (the stdio↔socket
 *   forwarder clients spawn; the standalone dist/mcp-server.js is retired)
 * - skill-files: at least one .md in .claude/skills/
 *
 * An `inventory` payload is populated in parallel with the checks: skills,
 * project-level MCPs (with their tools), and session-level MCPs.
 *
 * Pure fs/promises — no VS Code imports, easily unit-tested.
 */

import { createHash } from 'crypto';
import * as fsPromises from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { inspectAllServers } from './mcpInspector';
import { detectSessionMcps } from './sessionMcpDetector';
import { inspectSkills } from './skillInspector';
import type { AiInventory } from '@/types/ai';
import { parseJSON } from '@/types/typeGuards';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface AiCheckResult {
    name: string;
    status: 'ok' | 'warning' | 'error';
    message?: string;
}

export interface AiVerificationResult {
    status: 'ok' | 'warning' | 'error';
    checks: AiCheckResult[];
    /**
     * Inventory payload — populated alongside the file-presence checks. Each
     * inspector failing produces an empty slot rather than failing the whole
     * call; the surrounding `status` still reflects the file-presence checks
     * above.
     */
    inventory: AiInventory;
}

/** Cheap existence probe (access-based; false on any error). */
async function fsExists(p: string): Promise<boolean> {
    try {
        await fsPromises.access(p);
        return true;
    } catch {
        return false;
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify a project's AI setup: file-presence checks + capability inventory.
 *
 * `recordedHashes` (optional) is the project's ADR-013 `aiFileHashes` map —
 * when supplied, `inventory.editedFiles` lists the bundle files whose current
 * disk sha-256 differs from the recorded one (user edits the hash-and-skip
 * writer keeps). Omitted (pre-ADR projects) → `editedFiles` is empty: no
 * false "edited" flags. Pure fs — the caller passes the hashes in; the
 * verifier never reads VS Code state.
 */
export async function verifyAiSetup(
    projectPath: string,
    extensionDistPath: string,
    recordedHashes?: Record<string, string>,
): Promise<AiVerificationResult> {
    const [checks, inventory, editedFiles] = await Promise.all([
        Promise.all([
            checkAgentsMd(projectPath),
            checkMcpConfig(projectPath),
            checkMcpBinary(extensionDistPath),
            checkSkillFiles(projectPath),
            checkPlaywrightBrowser(projectPath),
        ]).then((results) => results.filter((c): c is AiCheckResult => c !== null)),
        gatherInventory(projectPath),
        detectEditedFiles(projectPath, recordedHashes),
    ]);

    return { status: aggregateStatus(checks), checks, inventory: { ...inventory, editedFiles } };
}

/**
 * `.claude/settings.json` is MERGED on every refresh (user hooks/permissions
 * incorporated, hash re-recorded), never kept-as-is — so a hash mismatch there
 * means "the user customized it and the merge will fold it in", not
 * "we kept your version". Flagging it would be false for the one file users
 * are explicitly invited to edit.
 */
const MERGED_NOT_KEPT = new Set(['.claude/settings.json']);

/**
 * ADR-013 derived list: recorded files whose disk content no longer matches
 * the hash taken at the last generate (sha-256 over utf-8 content — the same
 * hashing the `GeneratedFileWriter` seam records). A missing file is NOT
 * "edited" (it was removed; the presence checks / regenerate flow own that
 * case), and merged-path files (see {@link MERGED_NOT_KEPT}) are excluded.
 * Sorted for a stable render/log order.
 */
async function detectEditedFiles(
    projectPath: string,
    recordedHashes?: Record<string, string>,
): Promise<string[]> {
    if (!recordedHashes) return [];
    const flags = await Promise.all(
        Object.entries(recordedHashes).map(async ([relPath, recorded]) => {
            if (MERGED_NOT_KEPT.has(relPath)) return null;
            // Containment (2026-08-14 review): these keys come verbatim from the
            // project manifest — a crafted key must never make this read outside
            // the project (or leak the key into the modal as "edited"). Lexical
            // rejection of traversal/absolute keys, then a realpath check so a
            // symlinked file cannot smuggle the read out either.
            if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) return null;
            try {
                const absolute = path.join(projectPath, relPath);
                const [realRoot, realFile] = await Promise.all([
                    fsPromises.realpath(projectPath),
                    fsPromises.realpath(absolute),
                ]);
                if (realFile !== realRoot && !realFile.startsWith(realRoot + path.sep)) {
                    return null;
                }
                const content = await fsPromises.readFile(absolute, 'utf-8');
                const current = createHash('sha256').update(content, 'utf-8').digest('hex');
                return current !== recorded ? relPath : null;
            } catch {
                return null; // absent/unreadable = not edited
            }
        }),
    );
    return flags.filter((p): p is string => p !== null).sort();
}

/**
 * Gather the AI inventory (skills + project MCPs + session MCPs) for a
 * project. Each inspector runs independently via `Promise.allSettled` so a
 * single inspector failing does not break the others — failures degrade to
 * an empty list with no exception surface.
 */
export async function gatherInventory(projectPath: string): Promise<AiInventory> {
    const [skillsResult, mcpsResult, sessionMcpsResult] = await Promise.allSettled([
        inspectSkills(projectPath),
        inspectAllServers(projectPath),
        detectSessionMcps(),
    ]);

    return {
        skills: skillsResult.status === 'fulfilled' ? skillsResult.value : [],
        ...(skillsResult.status === 'rejected'
            ? { skillsError: errorMessage(skillsResult.reason) }
            : {}),
        mcps: mcpsResult.status === 'fulfilled' ? mcpsResult.value : [],
        ...(mcpsResult.status === 'rejected' ? { mcpsError: errorMessage(mcpsResult.reason) } : {}),
        sessionMcps: sessionMcpsResult.status === 'fulfilled' ? sessionMcpsResult.value : [],
        ...(sessionMcpsResult.status === 'rejected'
            ? { sessionMcpsError: errorMessage(sessionMcpsResult.reason) }
            : {}),
    };
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

// ─── Individual checks ────────────────────────────────────────────────────────

async function checkAgentsMd(projectPath: string): Promise<AiCheckResult> {
    // AGENTS.md is the real AI-context file — CLAUDE.md (root and .claude/)
    // are one-line pointers to it. Checking the pointer would report 'ok' on
    // a healthy project even if AGENTS.md were missing, and warn 'empty' on
    // every project (the pointer is one line by design).
    const filePath = path.join(projectPath, 'AGENTS.md');
    try {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        if (!content.trim()) {
            return {
                name: 'AGENTS.md',
                status: 'warning',
                message: 'File is empty — run Regenerate to fix',
            };
        }
        return { name: 'AGENTS.md', status: 'ok' };
    } catch {
        return { name: 'AGENTS.md', status: 'warning', message: 'Missing — run Regenerate to fix' };
    }
}

async function checkMcpConfig(projectPath: string): Promise<AiCheckResult> {
    const filePath = path.join(projectPath, '.claude', 'mcp.json');
    let raw: string;
    try {
        raw = await fsPromises.readFile(filePath, 'utf-8');
    } catch {
        return {
            name: '.claude/mcp.json',
            status: 'warning',
            message: 'Missing — run Regenerate to fix',
        };
    }

    const parsed = parseJSON<{ mcpServers?: unknown }>(raw);
    if (parsed === null) {
        return {
            name: '.claude/mcp.json',
            status: 'error',
            message: 'Invalid JSON — run Regenerate to fix',
        };
    }
    if (!parsed.mcpServers) {
        return {
            name: '.claude/mcp.json',
            status: 'warning',
            message: 'Missing mcpServers key — run Regenerate to fix',
        };
    }
    return { name: '.claude/mcp.json', status: 'ok' };
}

async function checkMcpBinary(extensionDistPath: string): Promise<AiCheckResult> {
    // The MCP client (Claude Code) spawns the stdio→socket proxy, which bridges
    // to the in-extension server. The retired standalone `mcp-server.js` is no
    // longer built, so the proxy is the binary that must be present.
    const binaryPath = path.join(extensionDistPath, 'mcp-proxy.js');
    try {
        await fsPromises.access(binaryPath);
        return { name: 'mcp-binary', status: 'ok' };
    } catch {
        return {
            name: 'mcp-binary',
            status: 'warning',
            message: 'MCP proxy binary not found — run npm run build to compile it',
        };
    }
}

async function checkSkillFiles(projectPath: string): Promise<AiCheckResult> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    try {
        const entries = await fsPromises.readdir(skillsDir, { withFileTypes: true });
        // v27+ layout: `<name>/SKILL.md` directories. Legacy flat `<name>.md`
        // files still count — a not-yet-regenerated project is not unhealthy.
        const hasFlat = entries.some((e) => e.isFile() && e.name.endsWith('.md'));
        const dirHasSkillMd = async (dirName: string): Promise<boolean> => {
            try {
                await fsPromises.access(path.join(skillsDir, dirName, 'SKILL.md'));
                return true;
            } catch {
                return false;
            }
        };
        const dirChecks = await Promise.all(
            entries.filter((e) => e.isDirectory()).map((e) => dirHasSkillMd(e.name)),
        );
        if (!hasFlat && !dirChecks.some(Boolean)) {
            return {
                name: 'skill-files',
                status: 'warning',
                message: 'No skill files found — run Regenerate to fix',
            };
        }
        return { name: 'skill-files', status: 'ok' };
    } catch {
        return {
            name: 'skill-files',
            status: 'warning',
            message: 'Skills directory missing — run Regenerate to fix',
        };
    }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function aggregateStatus(checks: AiCheckResult[]): 'ok' | 'warning' | 'error' {
    if (checks.some((c) => c.status === 'error')) return 'error';
    if (checks.some((c) => c.status === 'warning')) return 'warning';
    return 'ok';
}

/**
 * A browser Playwright can actually drive — the third-party-tooling item's
 * Chrome-less pre-check (step 5).
 *
 * `@playwright/mcp` drives the machine's installed Google Chrome by default
 * (measured 2026-08-22 on 0.0.75/0.0.79 — no download when Chrome exists).
 * A Chrome-less machine needs the one-time ~150 MB Chromium the server's
 * `install-browser` subcommand fetches into the ms-playwright cache. Without
 * either, the three scraping skills fail MID-SCRAPE with no warning — this
 * check makes the absence visible up front. Knowing is the win: nothing is
 * downloaded here, deliberately.
 *
 * Runs only when the Playwright package is actually installed in the
 * project's isolated tools dir (absent = not applicable or opted out — the
 * skills are gated with it, so there is nothing to warn about). Returns null
 * to stay out of the checks list entirely in that case.
 */
async function checkPlaywrightBrowser(projectPath: string): Promise<AiCheckResult | null> {
    const playwrightInstalled = await fsExists(
        path.join(projectPath, '.demo-builder-mcp', 'node_modules', '@playwright', 'mcp'),
    );
    if (!playwrightInstalled) return null;

    const chromePaths =
        process.platform === 'darwin'
            ? ['/Applications/Google Chrome.app']
            : process.platform === 'win32'
              ? [
                    path.join(
                        process.env['PROGRAMFILES'] ?? 'C:\\Program Files',
                        'Google/Chrome/Application/chrome.exe',
                    ),
                ]
              : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];
    for (const p of chromePaths) {
        if (await fsExists(p)) return { name: 'playwright-browser', status: 'ok' };
    }

    const cacheDir =
        process.platform === 'darwin'
            ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
            : process.platform === 'win32'
              ? path.join(process.env['LOCALAPPDATA'] ?? '', 'ms-playwright')
              : path.join(os.homedir(), '.cache', 'ms-playwright');
    try {
        const entries = await fsPromises.readdir(cacheDir);
        if (entries.some((e) => e.startsWith('chromium'))) {
            return { name: 'playwright-browser', status: 'ok' };
        }
    } catch {
        // absent cache — fall through to the warning
    }

    return {
        name: 'playwright-browser',
        status: 'warning',
        message:
            'No Google Chrome and no cached Playwright browser found — the site-scraping ' +
            'skills cannot drive a browser on this machine. Install Google Chrome, or run ' +
            '"npx playwright install chromium" (one-time ~150 MB).',
    };
}
