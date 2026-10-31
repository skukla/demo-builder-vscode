/**
 * The ai-defaults MCP tools of the HOME Chat at the projects root (PL-60, 2026-10-31).
 *
 * The home Chat carries every generated skill (`homeAiContextWriter`), including the four
 * that drive the Playwright browser, but its `.mcp.json` had only `demo-builder`: Playwright
 * lived in each project's own isolated tools dir, which a Chat rooted at the projects root
 * never loads. So "Create datapack → From a website", which opens that Chat, had a skill and
 * no browser.
 *
 * The home now has its own isolated tools dir, `<projectsRoot>/.demo-builder-mcp/`
 * (`resolveMcpToolsDir`, the same rule as a project's), installed by the same pipeline
 * (`installMcpEntries`). Which entries: `homeMcpEntryApplies` — the tools a generated skill
 * drives, after the third-party opt-out. An entry reaches the home's `.mcp.json`, and its
 * skills are written, only once its package is installed there: the same "applies AND
 * installed" rule `resolveAvailableMcpToolIds` holds a project to.
 *
 * Outside the ADR-013 seam, like the rest of the home: npm rewrites the tools dir itself,
 * and the home has no manifest to record hashes in.
 *
 * @module features/project-creation/services/aiBundle/homeMcpTools
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import aiDefaultsConfig from '../../config/ai-defaults.json';
import { type InstallAiDefaultsResult, installMcpEntries, resolveMcpToolsDir } from './aiDefaultsInstaller';
import { homeMcpEntryApplies } from './aiToolingGate';
import { buildAiDefaultsServerEntry, type McpServerEntry } from './mcpConfigWriter';
import type { CommandExecutor } from '@/core/shell/commandExecutor';
import type { AiDefaults, AiDefaultsMcpServer } from '@/types/aiDefaults';
import type { Logger } from '@/types/logger';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/** The entries the home gets, in ai-defaults order. */
export function homeMcpEntries(defaults: AiDefaults = aiDefaults): AiDefaultsMcpServer[] {
    return defaults.mcpServers.filter(homeMcpEntryApplies);
}

/** The home tools manifest's declared packages and versions; empty when there is none. */
async function declaredHomePackages(projectsRoot: string): Promise<Record<string, string>> {
    try {
        const raw = await fsPromises.readFile(path.join(resolveMcpToolsDir(projectsRoot), 'package.json'), 'utf-8');
        const parsed = JSON.parse(raw) as { dependencies?: Record<string, string> };
        return parsed.dependencies ?? {};
    } catch {
        return {};
    }
}

/** True when the package's own manifest is on disk in the home tools dir. */
async function packageOnDisk(projectsRoot: string, pkg: string): Promise<boolean> {
    try {
        await fsPromises.access(path.join(resolveMcpToolsDir(projectsRoot), 'node_modules', pkg, 'package.json'));
        return true;
    } catch {
        return false;
    }
}

/**
 * The home entries usable now: they apply, the manifest declares them at the version
 * ai-defaults asks for, and the package is on disk.
 */
export async function availableHomeMcpEntries(
    projectsRoot: string,
    defaults: AiDefaults = aiDefaults,
): Promise<AiDefaultsMcpServer[]> {
    const declared = await declaredHomePackages(projectsRoot);
    const entries = homeMcpEntries(defaults).filter((entry) => declared[entry.package] === entry.version);
    const onDisk = await Promise.all(entries.map((entry) => packageOnDisk(projectsRoot, entry.package)));
    return entries.filter((_entry, i) => onDisk[i]);
}

/**
 * The home's `.mcp.json` entries for its available tools, keyed by entry id.
 *
 * @param fnmPath - how a tool is launched (`EnvironmentSetup.findFnmPath`), asked only when
 *   there is a tool to launch
 */
export async function buildHomeToolEntries(
    projectsRoot: string,
    fnmPath: () => string | null,
    defaults: AiDefaults = aiDefaults,
): Promise<Record<string, McpServerEntry>> {
    const available = await availableHomeMcpEntries(projectsRoot, defaults);
    if (available.length === 0) return {};
    const toolsDir = resolveMcpToolsDir(projectsRoot);
    const launcher = fnmPath();
    return Object.fromEntries(
        available.map((entry) => [entry.id, buildAiDefaultsServerEntry(entry, toolsDir, launcher)]),
    );
}

/** What the home install did. */
export interface HomeInstallResult extends InstallAiDefaultsResult {
    /** npm ran (so the home's config and skills should be written again). */
    installed: boolean;
}

/**
 * Install the home's tools when any is missing or at another version. Runs on every
 * activation, so an install that is already in place costs two file reads and no npm run.
 * With nothing applying (the opt-out off) it installs nothing; a package already on disk is
 * left there, harmless, as for a project — the config and skills are the contract.
 */
export async function installHomeMcpTools(
    projectsRoot: string,
    commandManager: CommandExecutor,
    logger?: Pick<Logger, 'debug' | 'warn'>,
    defaults: AiDefaults = aiDefaults,
): Promise<HomeInstallResult> {
    const wanted = homeMcpEntries(defaults);
    if (wanted.length === 0) return { success: true, installed: false };
    const available = await availableHomeMcpEntries(projectsRoot, defaults);
    if (available.length === wanted.length) return { success: true, installed: false };
    const result = await installMcpEntries(resolveMcpToolsDir(projectsRoot), wanted, commandManager, undefined, logger);
    return { ...result, installed: result.success };
}
