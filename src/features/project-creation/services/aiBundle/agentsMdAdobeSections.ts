/**
 * AGENTS.md sections about Adobe I/O and App Builder: the project's org and
 * workspaces, its App Builder integrations, adding Console APIs, and the MCP
 * servers it has. Split from `agentsMdSections.ts` by topic (EDS-8, 2026-10-05);
 * that module re-exports each builder. The generated text is unchanged, so
 * AI_CONTEXT_VERSION does not move.
 *
 * Security: all user-supplied values are sanitized before interpolation — see
 * sanitization.ts.
 */

import aiDefaultsConfig from '../../config/ai-defaults.json';
import { sanitizeTemplateValue, escapeMarkdown } from '../sanitization';
import { integrationWorkspaceLines } from './agentsMdWorkspaces';
import { aiDefaultsEntryApplies, projectNeedsAppBuilderTooling } from './aiToolingGate';
import type { AiDefaults } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

export function buildAdobeIo(project: Project): string {
    if (!project.adobe) return '';

    const lines: string[] = ['## Adobe I/O Project'];

    if (project.adobe.organization) {
        lines.push(
            `- **Organization:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.organization))}`,
        );
    }
    if (project.adobe.projectTitle ?? project.adobe.projectName) {
        lines.push(
            `- **Project:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.projectTitle ?? project.adobe.projectName ?? ''))}`,
        );
    }
    if (project.adobe.workspaceTitle ?? project.adobe.workspace) {
        lines.push(
            `- **Workspace:** ${escapeMarkdown(sanitizeTemplateValue(project.adobe.workspaceTitle ?? project.adobe.workspace ?? ''))}`,
        );
    }
    lines.push(...integrationWorkspaceLines(project));

    // length > 1 means at least one field was populated beyond the section header.
    // Append the org-context warning only when the section is non-empty.
    if (lines.length <= 1) return '';

    lines.push('');
    lines.push(
        '> **Set your Adobe org target before any Adobe operation.** Demo Builder targets the Adobe',
    );
    lines.push(
        '> org *per operation* — it does not clobber a shared global, so concurrent windows and',
    );
    lines.push(
        '> agents stay isolated. Establish your target first with `select_org` → `select_project` →',
    );
    lines.push('> `select_workspace`. If an Adobe tool returns');
    lines.push(
        '> `{ error_type: "ORG_MISMATCH", non_retryable: true }`, **do not retry** — a blind retry hits',
    );
    lines.push(
        '> the same wrong-org 403. Surface it: ask the user to select the correct organization (or',
    );
    lines.push('> re-login to switch account), then proceed.');

    return lines.join('\n');
}

/**
 * Per-integration addressing for AI-built App Builder integrations — only for
 * App Builder-adjacent projects (same gate as the Console-API section). A
 * project can hold N integrations, each cloned into its own
 * `components/<id>/` folder; agents must confirm the target before editing.
 */
export function buildAppBuilderIntegrations(project: Project): string {
    if (!projectNeedsAppBuilderTooling(project)) return '';

    return [
        '## App Builder Integrations',
        'A project can hold multiple AI-built App Builder integrations. Each lives in its own',
        '`components/<id>/` folder with its own `app.config.yaml`, and each deploys into its own',
        'isolated OpenWhisk (I/O Runtime) package — and, when listed under **Integration',
        'workspaces**, into its own Adobe workspace.',
        '',
        '- Before editing, confirm WHICH integration (`components/<id>/`) the user means — ask',
        '  when more than one exists or the target is ambiguous.',
        '- Deploys are per-integration: call deploy_integration with the integration\'s id; it',
        "  deploys under the project's Adobe org, and deploying one never touches another's package.",
        '',
        'See the `extend-app-builder-app` skill for the full build loop.',
    ].join('\n');
}

/**
 * Runtime Console-API access guidance — only for App Builder-adjacent projects
 * (the tools guard themselves, but advertising them elsewhere is noise).
 */
export function buildConsoleApiAccess(project: Project): string {
    if (!projectNeedsAppBuilderTooling(project)) return '';

    return [
        '## Adding Adobe API Access',
        'Custom App Builder work often needs an Adobe API the project was not created with',
        '(e.g. Firefly Services). Before writing code that calls a new Adobe API:',
        '',
        "1. Call the `list_console_apis` MCP tool to find the service's sdk code (it flags",
        '   codes Demo Builder already manages).',
        '2. Confirm the code(s) with the user, then call `add_console_apis` — it subscribes',
        "   the API on a Developer Console workspace credential and persists the choice so",
        '   later component changes keep it. Pass `componentId` when the API is for one',
        "   integration: one listed under **Integration workspaces** runs in its own",
        "   workspace, and an API added without its id lands in the project's instead.",
        '3. If a service needs a product profile, the tool will say so — direct the user to',
        '   the Adobe Developer Console (Project → Workspace → Add API) instead.',
        '',
        'See the `extend-app-builder-app` skill for the full build loop.',
    ].join('\n');
}

/**
 * The OTHER MCP servers this project has, and what each is for.
 *
 * ## Why this section exists — and what it does NOT rest on
 *
 * It exists because an agent should know which servers it has. That is worth
 * stating plainly on its own merits.
 *
 * **It is not backed by a measurement.** It was written on one: seven battery
 * runs where the agent opened `dropins` zero times, read as "a server nobody
 * names is a server nobody uses". Two runs of a BETTER prompt disproved that the
 * same day — asked something only `dropins` can answer ("which slots does the
 * product-list block expose?"), the agent called `mcp__dropins__list_slots` on
 * its first call, by name, with no prompting and no exploration.
 *
 * The seven zeros were the wrong question, not a discoverability failure:
 * `cross-no-products` is answerable from the catalog and the rendered page, so
 * not reaching for `dropins` was the correct choice, not a missed one.
 *
 * So: keep this, because telling an agent what it has is reasonable. Do not cite
 * it as a fix for a problem that has not been shown to exist.
 *
 * Before this, the generated bundle named `demo-builder` four times and the
 * other three servers not once.
 *
 * ## Why it is generated from ai-defaults.json
 *
 * That file already carries a `description` and a `requires` gate per server and
 * is the same source `mcpConfigWriter` writes `.mcp.json` from. Generating from
 * it means this section cannot claim a server the project did not get, and a new
 * entry appears here without anyone remembering to add it — the drift that made
 * `get_commerce_endpoints` invisible to the battery for a day.
 *
 * Naming a server the project does NOT have is worse than silence: it sends the
 * agent looking for something absent. The gate is `aiDefaultsEntryApplies`, the
 * same predicate the installer and the config writer use.
 */
export function buildToolServers(project: Project): string {
    const servers = (aiDefaultsConfig as AiDefaults).mcpServers.filter((entry) =>
        aiDefaultsEntryApplies(entry, project),
    );
    if (servers.length === 0) return '';

    const lines = [
        '## Your MCP Servers',
        'This project has more than one MCP server. `demo-builder` is only the first —',
        'reach for the others when the job is theirs, and search by SERVER NAME when you',
        'do not know a tool\'s exact name:',
        '',
        '- **demo-builder** — this extension: projects, Commerce endpoints and queries,',
        '  published pages, datapacks, Adobe I/O, deploys.',
    ];
    for (const entry of servers) {
        lines.push(`- **${entry.id}** — ${entry.description}`);
    }
    lines.push(
        '',
        'A tool you cannot name is still findable: ask a server for its tools by name',
        'before deciding no tool exists and doing the job by hand. (How you search is',
        'your own: the mechanism and the tool-name spelling differ between agents.)',
    );
    return lines.join('\n');
}
