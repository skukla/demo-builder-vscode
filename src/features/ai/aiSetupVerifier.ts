/**
 * AI Setup Verifier — backs the Configure screen's AI Configuration tab.
 *
 * Verifies that a project's AI context files are present and valid:
 * - AGENTS.md: exists and non-empty (the real AI context file since Cycle A.2;
 *   `CLAUDE.md` and `.claude/CLAUDE.md` are one-line pointers to it)
 * - .claude/mcp.json: exists, valid JSON, has mcpServers key
 * - mcp-binary: dist/mcp-server.js present at extension dist path
 * - skill-files: at least one .md in .claude/skills/
 *
 * Cycle C adds an `inventory` payload populated in parallel with the checks:
 * skills, project-level MCPs (with their tools), and session-level MCPs.
 *
 * Pure fs/promises — no VS Code imports, easily unit-tested.
 */

import * as fsPromises from 'fs/promises';
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
     * Cycle C inventory payload — populated alongside the existing checks.
     * Each inspector failing produces an empty slot rather than failing the
     * whole call; the surrounding `status` still reflects the file-presence
     * checks above.
     */
    inventory: AiInventory;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function verifyAiSetup(
    projectPath: string,
    extensionDistPath: string,
): Promise<AiVerificationResult> {
    const [checks, inventory] = await Promise.all([
        Promise.all([
            checkAgentsMd(projectPath),
            checkMcpConfig(projectPath),
            checkMcpBinary(extensionDistPath),
            checkSkillFiles(projectPath),
        ]),
        gatherInventory(projectPath),
    ]);

    return { status: aggregateStatus(checks), checks, inventory };
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
        ...(mcpsResult.status === 'rejected'
            ? { mcpsError: errorMessage(mcpsResult.reason) }
            : {}),
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
    // AGENTS.md is the real AI-context file since Cycle A.2 — CLAUDE.md
    // (root and .claude/) are one-line pointers to it. Checking the pointer
    // would report 'ok' on a healthy project even if AGENTS.md were missing,
    // and warn 'empty' on every project (the pointer is one line by design).
    const filePath = path.join(projectPath, 'AGENTS.md');
    try {
        const content = await fsPromises.readFile(filePath, 'utf-8');
        if (!content.trim()) {
            return { name: 'AGENTS.md', status: 'warning', message: 'File is empty — run Regenerate to fix' };
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
        return { name: '.claude/mcp.json', status: 'warning', message: 'Missing — run Regenerate to fix' };
    }

    const parsed = parseJSON<{ mcpServers?: unknown }>(raw);
    if (parsed === null) {
        return { name: '.claude/mcp.json', status: 'error', message: 'Invalid JSON — run Regenerate to fix' };
    }
    if (!parsed.mcpServers) {
        return { name: '.claude/mcp.json', status: 'warning', message: 'Missing mcpServers key — run Regenerate to fix' };
    }
    return { name: '.claude/mcp.json', status: 'ok' };
}

async function checkMcpBinary(extensionDistPath: string): Promise<AiCheckResult> {
    const binaryPath = path.join(extensionDistPath, 'mcp-server.js');
    try {
        await fsPromises.access(binaryPath);
        return { name: 'mcp-binary', status: 'ok' };
    } catch {
        return {
            name: 'mcp-binary',
            status: 'warning',
            message: 'MCP server binary not found — run npm run build to compile it',
        };
    }
}

async function checkSkillFiles(projectPath: string): Promise<AiCheckResult> {
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    try {
        const entries = await fsPromises.readdir(skillsDir, { withFileTypes: true });
        const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'));
        if (mdFiles.length === 0) {
            return { name: 'skill-files', status: 'warning', message: 'No skill files found — run Regenerate to fix' };
        }
        return { name: 'skill-files', status: 'ok' };
    } catch {
        return { name: 'skill-files', status: 'warning', message: 'Skills directory missing — run Regenerate to fix' };
    }
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

function aggregateStatus(checks: AiCheckResult[]): 'ok' | 'warning' | 'error' {
    if (checks.some(c => c.status === 'error')) return 'error';
    if (checks.some(c => c.status === 'warning')) return 'warning';
    return 'ok';
}
