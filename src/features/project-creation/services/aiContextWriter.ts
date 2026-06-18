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
import { getEwCanvasBranch, resolveProjectAuthoringExperience } from '@/features/eds/handlers/edsHelpers';
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
    sections.push(buildPdpRouting(project));
    sections.push(buildComponentRepositories(project));
    sections.push(buildBlockLibraries(project));
    sections.push(buildAdobeIo(project));
    sections.push(buildTryAskingClaude(project));
    sections.push(buildReportingStyle());
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

    const daLiveUrl = getEdsDaLiveUrl(
        project,
        resolveProjectAuthoringExperience(project),
        getEwCanvasBranch(),
    );
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
 * PDP routing context for EDS storefronts.
 *
 * Tells the AI what's not obvious from the code:
 *   1. Per-product URLs route through the canonical Adobe BYOM
 *      `content.overlay` pattern (replacement for deprecated folder
 *      mapping), NOT per-product DA pages.
 *   2. The full routing stack has four layers (pre-warming, overlay,
 *      Phase 2 template fetch, smart-404 recovery) — every AI suggestion
 *      should fit somewhere on this stack instead of inventing a new one.
 *   3. Don't suggest `aem-commerce-prerender` per-project, Tier 3 SSR
 *      (JSON-LD / Merchant Center), or folder mapping. All wrong for
 *      this design.
 */
function buildPdpRouting(project: Project): string {
    if (!isEdsProject(project)) return '';

    return [
        '## PDP Routing (How Product Pages Work)',
        '',
        'Per-product URLs (`/products/{urlKey}/{sku}`) are routed automatically using Adobe\'s canonical BYOM `content.overlay` pattern (the documented replacement for deprecated folder mapping). **Do not** create per-product DA pages, **do not** configure folder mapping, and **do not** suggest deploying `aem-commerce-prerender` per project.',
        '',
        '**The four-layer routing stack:**',
        '1. **Pre-warming at create/reset** — Demo Builder enumerates the Commerce catalog and pre-publishes every SKU\'s PDP URL into Helix content-bus during setup. Equivalent to one cycle of the canonical scheduled poller, run synchronously. After this runs, every catalog product loads instantly on first click. Check reset logs for `[Catalog Prewarm] Complete: N/N succeeded`.',
        '2. **BYOM `content.overlay` registration** — Configuration Service points Helix at a shared `render-pdp` action. Registration shape matches `aem-commerce-prerender`\'s canonical setup wizard (`{ url, type: "markup", suffix: ".html" }`).',
        '3. **`render-pdp` returns SC\'s authored template** (Phase 2 LIVE since 2026-06-09) — the overlay fetches the storefront\'s authored `/products/default` and returns it for any `/products/*/*` path. SC customizations to `/products/default` (header, footer, custom blocks, layout) inherit on every real PDP automatically. Generic shell remains as a fallback when the authored template fetch fails.',
        '4. **Smart-404 client-side recovery** — vendored into `head.html`, `404.html`, and `delayed.js`. When a user visits a PDP URL that wasn\'t pre-warmed (catalog churn after setup, brand-new SKU), the snippet triggers `prepublish-pdp` to publish on demand and redirects. Closes the gap Adobe acknowledges in `adobe-rnd/aem-commerce-prerender` issue #262 (event-driven recovery, OPEN at https://github.com/adobe-rnd/aem-commerce-prerender/issues/262).',
        '',
        '**Visitor behavior:**',
        '- Pre-warmed SKU → instant (content-bus has it from setup)',
        '- New SKU added after setup → smart-404 cycle (~2s) on first visit → published to content-bus → instant thereafter',
        '- Mixed-case URLs from PLPs → eager `head.html` redirect to lowercase before any paint',
        '- Deleted SKU → cached HTML still serves; drop-in detects empty Commerce data (backlog item to redirect to native `/404`)',
        '',
        '**When PDPs 404 in a freshly-created storefront**, check in this order:',
        '1. Is `demoBuilder.byom.overlayUrl` configured? (default points at the team\'s shared deployment)',
        '2. Did the latest reset complete the pre-warming step? (check `[Catalog Prewarm]` log lines)',
        '3. Is the `render-pdp` overlay action reachable? (`curl <overlayUrl>`)',
        '4. Is the smart `/404.html` published? (`curl https://main--{repo}--{owner}.aem.live/404.html`)',
        '5. Did the Configuration Service write include `suffix: ".html"` on the overlay? (this aligns with canonical; missing it caused live-tier 404s in earlier debugging)',
        '',
        '**Things to NOT suggest** — these are wrong for this architecture:',
        '- Deploying `aem-commerce-prerender` per project (it\'s single-tenant; conflicts with our multi-tenant Configuration Service writes — see `reference_commerce_prerender_unfit` memory entry)',
        '- Server-side SSR injection (JSON-LD, og:image per SKU, Merchant Center metadata) — Tier 3 from the canonical pattern, deliberately omitted for demos',
        '- Folder mapping in any form — deprecated by Adobe',
        '- Manual per-product DA pages — colleague\'s workaround that doesn\'t scale',
        '',
        'Full architecture, request flows, and load-bearing dependencies: see `docs/architecture/eds-byom-pdp-routing.md`. Decision rationale and canonical anchoring: `docs/architecture/adr/005-byom-pdp-routing.md` (ADR-005).',
    ].join('\n');
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

    // length > 1 means at least one field was populated beyond the section header.
    // Append the org-context warning only when the section is non-empty.
    if (lines.length <= 1) return '';

    lines.push('');
    lines.push('> **Set your Adobe org target before any Adobe operation.** Demo Builder targets the Adobe');
    lines.push('> org *per operation* — it does not clobber a shared global, so concurrent windows and');
    lines.push('> agents stay isolated. Establish your target first with `select_org` → `select_project` →');
    lines.push('> `select_workspace`. If an Adobe tool returns');
    lines.push('> `{ error_type: "ORG_MISMATCH", non_retryable: true }`, **do not retry** — a blind retry hits');
    lines.push('> the same wrong-org 403. Surface it: ask the user to select the correct organization (or');
    lines.push('> re-login to switch account), then proceed.');

    return lines.join('\n');
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

function buildReportingStyle(): string {
    return [
        '## Reporting Back to the User',
        'When you finish a task, write the final message for a demo builder, not an engineer. Keep it short and scannable:',
        '- **Lead with status in one line**, and separate what is *done* from what is *unverified or still up to them*. Never stack a confident "done!" against a long hedge — state both plainly (e.g. "X is live; Y isn\'t tested yet").',
        '- **Use plain language, not internals.** Skip function names, file paths, JSON/tool field names, and pixel breakpoints unless asked. Say what changed and what they can now do.',
        '- **Give the one next action or thing to verify** — not a QA checklist. Offer the full checklist only if they want it.',
        '- **Surface the single most important caveat.** Keep process trivia (commit/lint gates, re-auth retries) out of the headline — mention it in a line or save it to memory.',
        '- **Never paste raw tool-result JSON.** Translate sub-step results into a one-line outcome.',
    ].join('\n');
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
