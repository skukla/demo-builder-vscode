/**
 * AGENTS.md section builders.
 *
 * Each builder returns one Markdown section (or `''` when it does not apply to
 * the project shape); `aiContextWriter.generateAgentsMd` composes them in
 * order. The storefront sections live in `agentsMdStorefrontSections.ts` and the
 * Adobe I/O / App Builder ones in `agentsMdAdobeSections.ts` (split by topic,
 * EDS-8, 2026-10-05); both are re-exported here. Extracted from `aiContextWriter.ts` when it outgrew the 500-line file
 * cap (2026-08-14 review) — same pattern as the `claudeSettingsWriter`
 * extraction from `mcpConfigWriter`.
 *
 * Security: all user-supplied values are sanitized before interpolation — see
 * sanitization.ts for details on each helper (heading injection, URL scheme
 * injection, Markdown link injection).
 */

import {
    sanitizeTemplateValue,
    sanitizeGithubSlug,
    sanitizeUrl,
    sanitizeBlockId,
    escapeMarkdown,
} from '../sanitization';
import { COMPONENT_IDS } from '@/core/constants';
import { resolveStorefrontForProject } from '@/features/components/services/storefrontResolver';
import {
    getEwCanvasBranch,
    resolveProjectAuthoringExperience,
} from '@/features/eds/handlers/edsHelpers';
import type { Project } from '@/types/base';
import type { Stack } from '@/types/stacks';
import {
    isEdsProject,
    getEdsLiveUrl,
    getEdsPreviewUrl,
    getEdsDaLiveUrl,
    getMeshEndpointUrl,
} from '@/types/typeGuards';

/**
 * Adobe's Commerce/EDS documentation router, pinned to a reviewed commit.
 * Upstream: https://github.com/adobe-commerce/wayfinder (head read 2026-08-04).
 */
const WAYFINDER_ROUTER_URL =
    'https://cdn.jsdelivr.net/gh/adobe-commerce/wayfinder@d7275860b9ead78986f16318f3e1dc9842481fea/skills/AGENTS.md';

export {
    buildAdobeIo,
    buildAppBuilderIntegrations,
    buildConsoleApiAccess,
    buildToolServers,
} from './agentsMdAdobeSections';
export { buildBlockLibraries, buildPdpRouting, buildStorefront } from './agentsMdStorefrontSections';

// ─── Section builders ────────────────────────────────────────────────────────

export function buildHeader(project: Project, stacksConfig: Stack[]): string {
    const packageName = escapeMarkdown(
        sanitizeTemplateValue(resolvePackageName(project)),
    );
    const stackName = escapeMarkdown(
        sanitizeTemplateValue(resolveStackName(project.selectedStack, stacksConfig)),
    );
    const createdDateRaw =
        project.created instanceof Date
            ? project.created.toISOString().split('T')[0]
            : String(project.created);
    const createdDate = escapeMarkdown(sanitizeTemplateValue(createdDateRaw));

    const name = escapeMarkdown(sanitizeTemplateValue(project.name));
    const status = escapeMarkdown(sanitizeTemplateValue(project.status));
    return [
        `# Demo Builder Project: ${name}`,
        '',
        // Scope promise (v28): sessions started in this directory are
        // connection-scoped by the MCP server — current-project tools act on
        // THIS project regardless of the dashboard's pointer, and never move
        // it (connectionScope.ts). Without this line an agent that also saw
        // the dashboard could reasonably wonder which project its writes hit
        // — the ambiguity the 2026-08-28 tier-2 battery run measured.
        '> Sessions started in this directory act on THIS project: the Demo Builder',
        "> MCP tools scope to it automatically, and never change the dashboard's",
        '> selected project. `get_current_project` confirms (`scope: "session-directory"`).',
        '',
        '## Project Overview',
        `- **Package:** ${packageName}`,
        `- **Stack:** ${stackName}`,
        `- **Status:** ${status}`,
        `- **Created:** ${createdDate}`,
    ].join('\n');
}

/**
 * The skills pointer.
 *
 * `diagnose-demo` is named rather than left to discovery because the moment it
 * matters is BEFORE anything gets edited, and the old wording ("guides for each
 * operation") framed the whole directory as how-to-DO instructions — an agent
 * reading it had no reason to think a diagnosis guide was in there at all.
 */
export function buildHowToChangeThings(): string {
    return [
        '## How to Change Things',
        '> See `.claude/skills/` for step-by-step guides for each operation.',
        '>',
        '> **If something is wrong and you do not yet know why, read the `diagnose-demo`',
        '> skill FIRST.** It routes the symptom to the check that answers it. Changing',
        '> things to see what moves is slower and destroys the evidence.',
    ].join('\n');
}

export function buildEndpoints(project: Project): string {
    const endpoints: string[] = [];

    if (project.commerce?.instance?.url) {
        endpoints.push(
            `- **Commerce URL:** ${escapeMarkdown(sanitizeUrl(project.commerce.instance.url))}`,
        );
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

/**
 * How to actually SEND a Commerce query, and the failure that makes it necessary.
 *
 * WHY THIS SECTION EXISTS. A survey of 48 sessions run inside demo projects
 * (2026-08-25) found the one long stretch of real Commerce work issuing **28
 * hand-assembled `curl`s** at the GraphQL endpoint, with the `Magento-*` headers
 * typed out each time — because nothing on a 104-tool surface answered "what is
 * this project's GraphQL endpoint". `get_commerce_endpoints` now does, and the
 * same survey is the reason this section exists at all: agents used 20 of 104
 * tools, and the ones they used were overwhelmingly the ones the bundle NAMED.
 * A tool nobody is told about is a tool nobody calls.
 *
 * ## It points at the tool rather than baking the values in
 *
 * The endpoint, the mesh and the store scope all change — deploy a mesh and the
 * storefront's target flips; reconfigure the backend and the endpoint moves.
 * `AGENTS.md` is regenerated on activation, so a baked value is correct at
 * WRITE time and can be wrong by the time it is read, and a confidently wrong
 * endpoint is worse than no endpoint: the agent curls a host that is not this
 * project's. The tool has no staleness window.
 *
 * (The `Remote Endpoints` section above DOES state values. Those are display
 * URLs — a live site, a preview, DA.live — which a person opens in a browser and
 * which do not silently change what a query returns.)
 *
 * ## The warning is the load-bearing half
 *
 * A Catalog Service query sent without the store-scope headers reaches the wrong
 * scope and returns an **empty result with no error**. That is not hypothetical:
 * the surveyed session spent turns on "why is phones empty?" against a catalog
 * that was not empty. An agent that knows the tool exists but not the failure
 * mode will still read an empty response as "no products".
 */
export function buildQueryingCommerce(project: Project): string {
    // TWO shapes, both live. `componentSelections.backend` is what a current
    // project carries (checked against a real manifest: bodea has
    // `adobe-commerce-accs` and NO top-level `commerce`), while `commerce` is the
    // older shape the sibling `buildEndpoints` still reads for its Commerce URL.
    // Keying on one alone would silently omit this section for half the corpus.
    // Returning '' is the file's own convention for a section that does not apply.
    if (!project.componentSelections?.backend && !project.commerce) return '';

    return [
        '## Querying Commerce',
        'Before sending ANY Commerce or Catalog Service request — a GraphQL query, a `curl`, a Postman collection, checking what a category contains — call the `get_commerce_endpoints` tool. Do not assemble the endpoint or the headers by hand, and do not read them out of a `.env`.',
        'It returns the backend GraphQL endpoint, the Catalog Service endpoint, the deployed API Mesh endpoint (when there is one), which of them the storefront itself queries, and the request headers with the store scope they select.',
        '**Send the headers it gives you.** A Catalog Service query with the wrong store scope returns an EMPTY result and no error — it looks exactly like a category with no products in it. If a query comes back empty, re-check the headers before concluding the catalog is empty.',
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
export function buildComponentRepositories(project: Project): string {
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


export function buildTryAskingClaude(project: Project): string {
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

/**
 * Where the agent should look for Adobe documentation.
 *
 * Every project this extension generates is an Adobe Commerce demo — EDS delivery,
 * storefront drop-ins, document authoring, App Builder, API Mesh. Wayfinder is
 * Adobe's own agent-routing system across exactly those properties, so the bundle
 * points at it rather than re-deriving that map per project. Unconditional: there
 * is no project shape here that those properties do not cover.
 *
 * PINNED TO A COMMIT, deliberately. This line makes a remote document part of the
 * agent's instructions in a user's repo. `@main` would let upstream change those
 * instructions with no review on our side; a SHA means a change is something we
 * opt into. Re-pin by reading the head of adobe-commerce/wayfinder and bumping
 * AI_CONTEXT_VERSION so existing projects are prompted to regenerate.
 */
export function buildDocumentationRouting(): string {
    return [
        '## Finding Adobe Documentation',
        `Before answering an Adobe question — EDS, storefront drop-ins, document authoring, Commerce Admin, App Builder, API Mesh — fetch and follow the routing guide at: ${WAYFINDER_ROUTER_URL}`,
        'It maps the question to the right Adobe property and gives an agent-optimised entry point for each. Fetch the docs it points at; do not answer these from training data, and do not invent config keys, CLI flags, GraphQL fields, or Admin paths.',
        "Read this project's own code first where it applies — it reflects actual current state and beats general documentation.",
    ].join('\n');
}

export function buildReportingStyle(): string {
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

export function buildNotesForAgents(project: Project): string {
    const edsInstance = project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT];
    const localPath = edsInstance?.path
        ? escapeMarkdown(sanitizeTemplateValue(edsInstance.path))
        : undefined;

    const lines: string[] = [
        '## Notes for AI Agents',
        "- Settings live in the project's .demo-builder.json; the components' .env files are generated from them",
        '- Do not edit .demo-builder.json directly — to set a value, use the configure_project MCP tool',
        '- Sync operations are available as MCP tools via .claude/mcp.json',
        '- Run get_auth_status BEFORE any multi-step flow (publish, reset, library refresh):' +
            ' sign-in is the one step that needs the user, so surface it at the start,' +
            ' never as a mid-pipeline stall. sign_in(provider:"dalive") returns immediately' +
            ' after opening the prompts — poll get_auth_status until dalive.authenticated is true',
        '- Destructive tools (the ones taking confirm:true) may also raise a native VS Code' +
            ' consent dialog before running (the demoBuilder.ai.requireAgentConsent setting).' +
            ' A prose "user declined" answer means the operation did NOT run — report it back' +
            ' and ask how to proceed; do not retry without new instructions',
        '- To return this project to its starting point, call reset_project — one tool for' +
            ' both kinds of project, Edge Delivery or headless. It needs confirm:true and' +
            ' cannot be undone. An Edge Delivery reset puts the storefront repo and DA.live' +
            ' content back to the template; a headless reset deletes the components and' +
            ' installs them again (integrations and configuration are kept) and refuses' +
            ' while the demo is running — call stop_demo first',
    ];

    if (isEdsProject(project) && localPath) {
        lines.push(
            `- For EDS projects: edit block files in ${localPath}/blocks/, then call sync_storefront — the MCP tool handles git push`,
        );
    }

    return lines.join('\n');
}

// ─── Lookup helpers ──────────────────────────────────────────────────────────

function resolvePackageName(project: Project): string {
    if (!project.selectedPackage && !project.demo) return 'Unknown';
    return resolveStorefrontForProject(project)?.package.name ?? project.selectedPackage ?? 'Unknown';
}

function resolveStackName(stackId: string | undefined, stacksConfig: Stack[]): string {
    if (!stackId) return 'Unknown';
    const stack = stacksConfig.find((s) => s.id === stackId);
    return stack?.name ?? stackId;
}
