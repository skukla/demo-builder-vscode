/**
 * AI Context Writer
 *
 * Generates the AGENTS.md project context file for AI agents (Claude Code, Cursor,
 * Codex, Copilot). Written into each project directory at creation time to give AI
 * agents full project context. Two CLAUDE.md pointer files (root + .claude/) defer
 * to AGENTS.md via Claude Code's `@AGENTS.md` import syntax.
 *
 * Covers: remote endpoints, storefront paths, block libraries, sync operations,
 * and example prompts.
 *
 * Security: all user-supplied values are sanitized before interpolation — see
 * sanitization.ts for details on each helper (heading injection, URL scheme
 * injection, Markdown link injection).
 */

import * as fsPromises from 'fs/promises';
import * as path from 'path';
import demoPackagesJson from '../config/demo-packages.json';
import { sanitizeTemplateValue, sanitizeGithubSlug, sanitizeUrl, sanitizeBlockId, escapeMarkdown } from './sanitization';
import { COMPONENT_IDS } from '@/core/constants';
import type { Project } from '@/types/base';
import type { DemoPackagesConfig } from '@/types/demoPackages';
import type { Stack } from '@/types/stacks';
import {
    isEdsProject,
    getEdsLiveUrl,
    getEdsPreviewUrl,
    getEdsDaLiveUrl,
    getMeshEndpointUrl,
} from '@/types/typeGuards';

const demoPackages = demoPackagesJson as unknown as DemoPackagesConfig;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate AGENTS.md content for a project.
 *
 * @param project - The project manifest
 * @param stacksConfig - Available stacks (used for display name lookup)
 * @returns AGENTS.md content as a string
 */
export function generateAgentsMd(project: Project, stacksConfig: Stack[]): string {
    const sections: string[] = [];

    sections.push(buildHeader(project, stacksConfig));
    sections.push(buildHowToChangeThings());
    sections.push(buildEndpoints(project));
    sections.push(buildStorefront(project));
    sections.push(buildComponentRepositories(project));
    sections.push(buildBlockLibraries(project));
    sections.push(buildAdobeIo(project));
    sections.push(buildTryAskingClaude(project));
    sections.push(buildNotesForAgents(project));

    return sections.filter(Boolean).join('\n\n');
}

/**
 * One-line content of the CLAUDE.md pointer files. Claude Code resolves
 * `@AGENTS.md` against the file's parent directory and inlines the target's
 * content into context.
 */
const CLAUDE_MD_POINTER = 'see @AGENTS.md\n';

/**
 * Write AGENTS.md to the project root, plus CLAUDE.md pointer files at the
 * project root and in `.claude/`. The pointers defer to AGENTS.md so AI tools
 * that look for CLAUDE.md find the same content via a single import.
 *
 * @param projectPath - Path to the project root directory
 * @param project - The project manifest
 * @param stacksConfig - Available stacks (used for display name lookup)
 */
export async function writeAgentsMd(
    projectPath: string,
    project: Project,
    stacksConfig: Stack[],
): Promise<void> {
    const content = generateAgentsMd(project, stacksConfig);
    const claudeDir = path.join(projectPath, '.claude');

    await fsPromises.writeFile(path.join(projectPath, 'AGENTS.md'), content, 'utf-8');
    await fsPromises.writeFile(path.join(projectPath, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8');
    await fsPromises.mkdir(claudeDir, { recursive: true });
    await fsPromises.writeFile(path.join(claudeDir, 'CLAUDE.md'), CLAUDE_MD_POINTER, 'utf-8');
}

// ─── Section builders ────────────────────────────────────────────────────────

function buildHeader(project: Project, stacksConfig: Stack[]): string {
    const packageName = escapeMarkdown(sanitizeTemplateValue(resolvePackageName(project.selectedPackage)));
    const stackName = escapeMarkdown(sanitizeTemplateValue(resolveStackName(project.selectedStack, stacksConfig)));
    const createdDateRaw = project.created instanceof Date
        ? project.created.toISOString().split('T')[0]
        : String(project.created);
    const createdDate = escapeMarkdown(sanitizeTemplateValue(createdDateRaw));

    const name = escapeMarkdown(sanitizeTemplateValue(project.name));
    const status = escapeMarkdown(sanitizeTemplateValue(project.status));
    return [
        `# Demo Builder Project: ${name}`,
        '',
        '## Project Overview',
        `- **Package:** ${packageName}`,
        `- **Stack:** ${stackName}`,
        `- **Status:** ${status}`,
        `- **Created:** ${createdDate}`,
    ].join('\n');
}

function buildHowToChangeThings(): string {
    return [
        '## How to Change Things',
        '> See `.claude/skills/` for step-by-step guides for each operation.',
    ].join('\n');
}

function buildEndpoints(project: Project): string {
    const endpoints: string[] = [];

    if (project.commerce?.instance?.url) {
        endpoints.push(`- **Commerce URL:** ${escapeMarkdown(sanitizeUrl(project.commerce.instance.url))}`);
    }

    const meshEndpoint = getMeshEndpointUrl(project);
    if (meshEndpoint) {
        endpoints.push(`- **API Mesh:** ${escapeMarkdown(sanitizeUrl(meshEndpoint))}`);
    }

    const liveUrl = getEdsLiveUrl(project);
    if (liveUrl) {
        endpoints.push(`- **Live URL:** ${escapeMarkdown(sanitizeUrl(liveUrl))}`);
    }

    const previewUrl = getEdsPreviewUrl(project);
    if (previewUrl) {
        endpoints.push(`- **Preview URL:** ${escapeMarkdown(sanitizeUrl(previewUrl))}`);
    }

    const daLiveUrl = getEdsDaLiveUrl(project);
    if (daLiveUrl) {
        endpoints.push(`- **DA.live:** ${escapeMarkdown(sanitizeUrl(daLiveUrl))}`);
    }

    if (endpoints.length === 0) return '';
    return ['## Remote Endpoints', ...endpoints].join('\n');
}

function buildStorefront(project: Project): string {
    if (!isEdsProject(project)) return '';

    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    if (!edsInstance?.path) return '';

    // githubRepo is NOT escaped — it's used inside a URL path where backslash breaks things
    const githubRepo = sanitizeGithubSlug(sanitizeTemplateValue((edsInstance.metadata?.githubRepo as string | undefined) ?? ''));
    const localPath = escapeMarkdown(sanitizeTemplateValue(edsInstance.path));

    const lines: string[] = [
        '## Storefront',
        `- **Local path:** ${localPath}  (git clone of the GitHub repo — edit files here)`,
    ];

    if (githubRepo) {
        lines.push(`- **GitHub repo:** https://github.com/${githubRepo}`);
    }

    const previewUrl = getEdsPreviewUrl(project);
    if (previewUrl) {
        lines.push(`- **Preview URL:** ${escapeMarkdown(sanitizeUrl(previewUrl))}`);
    }

    const liveUrl = getEdsLiveUrl(project);
    if (liveUrl) {
        lines.push(`- **Live URL:** ${escapeMarkdown(sanitizeUrl(liveUrl))}`);
    }

    lines.push('');
    lines.push(`> Block files live in \`${localPath}/blocks/\`. Edit them here with standard file tools.`);
    lines.push('> Helix picks up pushes to the GitHub repo automatically for preview.');
    lines.push('> For live: push changes to GitHub — Helix picks up the update automatically.');

    return lines.join('\n');
}

/**
 * List every component instance with a `metadata.githubRepo` value.
 *
 * Gives AI agents a single place to look up the GitHub repo for any component
 * in the project — not just the storefront. Skipped entirely when no component
 * has a githubRepo.
 *
 * Component IDs are sanitized with `sanitizeBlockId` (kebab-case-only). Repo
 * slugs are double-sanitized — same defense-in-depth pattern as buildStorefront.
 */
function buildComponentRepositories(project: Project): string {
    const componentInstances = project.componentInstances ?? {};
    const rows: string[] = [];

    for (const [compId, instance] of Object.entries(componentInstances)) {
        const rawRepo = (instance.metadata?.githubRepo as string | undefined) ?? '';
        if (!rawRepo) continue;

        const repoSlug = sanitizeGithubSlug(sanitizeTemplateValue(rawRepo));
        if (!repoSlug) continue;

        const safeId = escapeMarkdown(sanitizeBlockId(compId));
        rows.push(`- \`${safeId}\`: https://github.com/${repoSlug}`);
    }

    if (rows.length === 0) return '';
    return ['## Component Repositories', ...rows].join('\n');
}

// All values are sanitized before interpolation — see ./sanitization for the threat model.
// GitHub owner/repo values are double-sanitized: sanitizeTemplateValue first (strips Markdown
// control characters), then sanitizeGithubSlug (enforces the slug allowlist). Both layers
// are intentional — sanitizeGithubSlug's allowlist alone is sufficient, but the layering
// provides defense-in-depth and makes the sanitization intent explicit at each call site.
function buildBlockLibraries(project: Project): string {
    if (!isEdsProject(project)) return '';

    const installed = project.installedBlockLibraries;
    if (!installed || installed.length === 0) return '';

    const customLibs = project.customBlockLibraries ?? [];
    const customKeys = new Set(customLibs.map(lib => `${lib.source.owner}/${lib.source.repo}`));

    const lines: string[] = ['## Block Libraries'];

    for (const lib of installed) {
        // Owner/repo are NOT escaped — they're inside URL paths where backslash breaks things
        const owner = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.owner));
        const repo = sanitizeGithubSlug(sanitizeTemplateValue(lib.source.repo));
        const type = customKeys.has(`${lib.source.owner}/${lib.source.repo}`) ? 'custom' : 'built-in';
        const blockList = lib.blockIds.map(id => escapeMarkdown(sanitizeBlockId(id))).join(', ');
        const libName = escapeMarkdown(sanitizeTemplateValue(lib.name));

        lines.push('');
        lines.push(`- **${libName}** (${type})`);
        lines.push(`  - Source: https://github.com/${owner}/${repo}`);
        lines.push(`  - Blocks: ${blockList}`);
        if (lib.commitSha) {
            lines.push(`  - Source commit: ${escapeMarkdown(sanitizeTemplateValue(lib.commitSha))}`);
        }
    }

    lines.push('');
    lines.push('> Blocks are copied into the storefront repo during setup — they are NOT separate local');
    lines.push('> repositories. To edit a block, modify it in `blocks/` and call `sync_storefront` to push');
    lines.push('> to the storefront.');
    lines.push('>');
    lines.push('> Block libraries are read-only sources — edits to copied block files live in this');
    lines.push('> storefront\'s repo, not the library repo. Library promotion is a planned future Demo');
    lines.push('> Builder feature.');

    return lines.join('\n');
}

function buildAdobeIo(project: Project): string {
    if (!project.adobe) return '';

    const lines: string[] = ['## Adobe I/O Project'];

    if (project.adobe.organization) {
        lines.push(`- **Organization:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.organization))}`);
    }
    if (project.adobe.projectTitle ?? project.adobe.projectName) {
        lines.push(`- **Project:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.projectTitle ?? project.adobe.projectName ?? ''))}`);
    }
    if (project.adobe.workspaceTitle ?? project.adobe.workspace) {
        lines.push(`- **Workspace:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.workspaceTitle ?? project.adobe.workspace ?? ''))}`);
    }

    // length > 1 means at least one field was populated beyond the section header
    return lines.length > 1 ? lines.join('\n') : '';
}

function buildTryAskingClaude(project: Project): string {
    const lines: string[] = ['## Try asking Claude'];

    if (isEdsProject(project)) {
        lines.push('- "Update the hero block background to white and push the changes"');
        lines.push('- "Add a newsletter block to the homepage and publish it"');
        lines.push('- "Show me what block libraries are installed and where they came from"');
    } else {
        lines.push('- "Update the Commerce storefront URL in the component config"');
        lines.push('- "Show me the current mesh endpoint and whether the config is stale"');
    }

    lines.push('- "What components is this project using and what are their config values?"');
    lines.push('- "Check if there are any pending updates for this project"');

    return lines.join('\n');
}

function buildNotesForAgents(project: Project): string {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const localPath = edsInstance?.path ? escapeMarkdown(sanitizeTemplateValue(edsInstance.path)) : undefined;

    const lines: string[] = [
        '## Notes for AI Agents',
        '- Component .env files hold all mutable configuration',
        '- Do not edit .demo-builder.json directly — use the update_project_config MCP tool',
        '- Sync operations are available as MCP tools via .claude/mcp.json',
    ];

    if (isEdsProject(project) && localPath) {
        lines.push(`- For EDS projects: edit block files in ${localPath}/blocks/, then call sync_storefront — the MCP tool handles git push`);
    }

    return lines.join('\n');
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────

function resolvePackageName(packageId: string | undefined): string {
    if (!packageId) return 'Unknown';
    const pkg = demoPackages.packages.find(p => p.id === packageId);
    return pkg?.name ?? packageId;
}

function resolveStackName(stackId: string | undefined, stacksConfig: Stack[]): string {
    if (!stackId) return 'Unknown';
    const stack = stacksConfig.find(s => s.id === stackId);
    return stack?.name ?? stackId;
}
