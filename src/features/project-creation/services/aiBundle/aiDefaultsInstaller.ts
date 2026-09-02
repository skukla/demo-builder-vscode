/**
 * AI Defaults Installer
 *
 * Installs the MCP tool packages declared in `ai-defaults.json` into a
 * per-project ISOLATED directory — `<project>/.demo-builder-mcp/` — decoupled
 * from the storefront's `package.json`.
 *
 * Why isolated: the storefront's own `npm install` can abort (the b2b feature
 * pack injects `@dropins` B2B dropins that are 404 on public npm), which used
 * to take the public MCP tool packages down with it — leaving the generated
 * `.mcp.json` pointing at a `node_modules` that never materialized. Installing
 * the (public, always-resolvable) MCP tools in their own throwaway manifest
 * sidesteps the storefront entirely.
 *
 * `resolveMcpToolsDir(projectPath)` is the single source of truth for the
 * isolated location; the MCP config writer and the Adobe MCP update checker
 * anchor to it too.
 *
 * Idempotent: re-running rewrites the tools `package.json` (the declared
 * versions) and re-runs `npm install`, which is a fast no-op when nothing is
 * missing.
 *
 * Deliberately OUTSIDE the ADR-013 `GeneratedFileWriter` seam: npm itself
 * rewrites this tree on every install, so hash-and-skip semantics would break
 * the install loop — the tools manifest is machine state, not user-editable
 * bundle content. Used both at project creation and by the dashboard's
 * "Regenerate AI files" action.
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaultsConfig from '../../config/ai-defaults.json';
import { aiDefaultsEntryApplies } from './aiToolingGate';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import { DEFAULT_SHELL } from '@/core/shell/defaultShell';
import { TIMEOUTS } from '@/core/utils/timeoutConfig';
import type { AiDefaults } from '@/types/aiDefaults';
import type { Logger } from '@/types/logger';
import type { Project } from '@/types/base';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/** Isolated MCP tools directory name, at the project root (outside any git repo). */
const MCP_TOOLS_DIRNAME = '.demo-builder-mcp';

/** Bytes of npm stderr to surface in the failure message — enough for the
 *  npm ERR! tail without flooding the modal. */
const NPM_STDERR_TAIL_BYTES = 500;

/** Result of running the install pipeline. */
export interface InstallAiDefaultsResult {
    success: boolean;
    /** Diagnostic when `success` is false; safe to surface in the UI. */
    error?: string;
}

/**
 * Resolve the per-project isolated MCP tools directory.
 *
 * @param projectPath - absolute path to the project root
 * @returns `<projectPath>/.demo-builder-mcp`
 */
export function resolveMcpToolsDir(projectPath: string): string {
    return path.join(projectPath, MCP_TOOLS_DIRNAME);
}

/**
 * Install the ai-defaults MCP tool packages into the project's isolated
 * `.demo-builder-mcp/` directory.
 *
 * Writes a throwaway `package.json` whose `dependencies` are exactly the
 * ai-defaults packages, then runs `npm install` with cwd set to that dir — so
 * the tools land in `<project>/.demo-builder-mcp/node_modules/`, never touching
 * the storefront manifest.
 *
 * Failures are returned as a structured result so callers (project creation and
 * the `regenerate-ai-files` handler) can surface a clean message rather than
 * letting an exception bubble out.
 *
 * Only the entries that apply to THIS project (per each entry's `requires`
 * field — see aiToolingGate.ts) are installed, so an app-builder-only project
 * gets the Developer Agent tooling without pulling Playwright.
 *
 * @param projectPath - absolute path to the project root
 * @param project - the project record, used to resolve which entries apply
 */
/** npm's own warning prefix, both spellings it has shipped. */
const NPM_WARNING_LINE = /^npm (warn|WARN)\b/;

/**
 * Put npm's output on a channel a human can find, whatever it exited with.
 *
 * Warnings are raised to `warn` and named individually — an EBADENGINE says which
 * package wants which Node, and that is the whole content of the finding. Everything
 * else is debug: a clean install has nothing to say.
 */
function logNpmOutput(
    stdout: string | undefined,
    stderr: string | undefined,
    logger?: Pick<Logger, 'debug' | 'warn'>,
): void {
    if (!logger) return;
    const lines = `${stdout ?? ''}\n${stderr ?? ''}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) return;

    const warnings = lines.filter((line) => NPM_WARNING_LINE.test(line));
    for (const warning of warnings) {
        logger.warn(`[AI Tools] ${warning}`);
    }
    logger.debug(
        `[AI Tools] npm install output (${lines.length} line(s), ${warnings.length} warning(s)):\n` +
            lines.join('\n'),
    );
}

export async function installAiDefaultsMcpTools(
    projectPath: string,
    project: Project,
    commandManager: CommandExecutor,
    onProgress?: (message: string) => void,
    logger?: Pick<Logger, 'debug' | 'warn'>,
): Promise<InstallAiDefaultsResult> {
    const toolsDir = resolveMcpToolsDir(projectPath);

    try {
        await fsPromises.mkdir(toolsDir, { recursive: true });

        const dependencies: Record<string, string> = {};
        for (const entry of aiDefaults.mcpServers) {
            if (!aiDefaultsEntryApplies(entry, project)) continue;
            dependencies[entry.package] = entry.version;
        }
        if (Object.keys(dependencies).length === 0) {
            // Nothing applies to this project — skip the npm run entirely.
            return { success: true };
        }
        const pkg = {
            name: 'demo-builder-mcp-tools',
            private: true,
            version: '1.0.0',
            dependencies,
        };
        await fsPromises.writeFile(
            path.join(toolsDir, 'package.json'),
            JSON.stringify(pkg, null, 2) + '\n',
            'utf-8',
        );
    } catch (err) {
        return { success: false, error: describeInstallerError(err) };
    }

    const executor = commandManager;
    try {
        // Stream npm's own output into the caller's progress line — real
        // progress instead of one opaque block with a guessed duration
        // (third-party-tooling item, step 6). npm prints sparsely without a
        // TTY, so lines are forwarded as they come; the caller's step title
        // carries the package names either way.
        const result = await executor.execute('npm install', {
            cwd: toolsDir,
            timeout: TIMEOUTS.VERY_LONG,
            enhancePath: true,
            shell: DEFAULT_SHELL,
            ...(onProgress
                ? {
                      streaming: true,
                      onOutput: (data: string) => {
                          const line = data.trim().split('\n').pop()?.trim();
                          if (line) onProgress(line);
                      },
                  }
                : {}),
        });

        // LOG WHAT NPM SAID, whatever it exited with.
        //
        // Until 2026-09-02 npm's output was read ONLY on a non-zero exit, and the
        // progress hook above keeps just the LAST line of each chunk. So a WARNING —
        // npm exits 0 — was seen by nobody: it flashed past on the progress line and
        // reached no channel at all. An EBADENGINE (a package declaring a Node range
        // this machine does not satisfy) went unrecorded exactly that way, and the
        // only reason it was noticed is that someone happened to be watching the
        // progress line at the right moment.
        //
        // Warnings go to `warn` so they survive a debug-off session; the rest is
        // debug-level, because a successful install is noise until it is not.
        logNpmOutput(result.stdout, result.stderr, logger);

        if (result.code !== 0) {
            const tail = (result.stderr ?? '').slice(-NPM_STDERR_TAIL_BYTES).trim();
            const suffix = tail ? `: ${tail}` : '';
            return {
                success: false,
                error: `npm install exited with code ${result.code}${suffix}`,
            };
        }
    } catch (err) {
        return { success: false, error: describeInstallerError(err) };
    }

    return { success: true };
}

/**
 * The ai-defaults packages that apply to this project RIGHT NOW, per each
 * entry's `requires` gate. The composition axis of the AI-context freshness
 * check compares this against {@link readInstalledMcpPackages} — a project
 * that gained a qualifying component after creation (dashboard add, storefront
 * setup) is exactly the case where the two diverge.
 */
export function applicableMcpPackages(project: Project): string[] {
    return aiDefaults.mcpServers
        .filter((entry) => aiDefaultsEntryApplies(entry, project))
        .map((entry) => entry.package);
}

/**
 * The packages actually declared in the isolated tools manifest
 * (`<project>/.demo-builder-mcp/package.json`). Empty when the manifest is
 * absent or unreadable — which reads as "nothing installed", the safe
 * direction for a staleness check (it can only cause a warning, never mask one).
 */
export async function readInstalledMcpPackages(projectPath: string): Promise<string[]> {
    try {
        const raw = await fsPromises.readFile(
            path.join(resolveMcpToolsDir(projectPath), 'package.json'),
            'utf-8',
        );
        const parsed = JSON.parse(raw) as { dependencies?: Record<string, string> };
        return Object.keys(parsed.dependencies ?? {});
    } catch {
        return [];
    }
}

/** One-line description of an installer failure, safe to show to the user. */
function describeInstallerError(err: unknown): string {
    if (err instanceof Error) return err.message;
    return String(err);
}
