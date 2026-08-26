/**
 * aiIntegrations
 *
 * Adobe ships agent tooling in PAIRS — one MCP server plus the skill set
 * written for that project shape — and names the pair on one line:
 *
 *   "installs the @dropins/mcp server and a set of storefront-specific agent
 *    skills, alongside the standard commerce-extensibility MCP server and App
 *    Builder skills"
 *   — developer.adobe.com/commerce/extensibility/developer-agent/dropins-mcp-server
 *
 * The capability modal used to list every MCP server, then every skill, in two
 * separate sections. That split every pair down the middle, and it is why a
 * storefront project running the App Builder pair — and no storefront pair at
 * all — was invisible for months (AI-1m, AI-1o). Grouping by integration puts
 * a missing half on screen as a gap rather than leaving it to be inferred by
 * cross-referencing two lists.
 *
 * Pure and offline: partitioning only, no IO, no vscode.
 */

import type { McpInventoryEntry, SkillInventoryEntry } from '@/types/ai';

export interface AiIntegrationSection {
    key: string;
    label: string;
    mcps: McpInventoryEntry[];
    skills: SkillInventoryEntry[];
}

interface IntegrationDefinition {
    key: string;
    label: string;
    /** `.mcp.json` server ids that belong to this pair. */
    mcpIds: readonly string[];
    /** Does this skill belong to this pair? */
    owns: (skill: SkillInventoryEntry) => boolean;
}

/**
 * Render order: ours first (it is the thing this extension provides), then the
 * two Adobe pairs, then tooling that has no skill set of its own.
 *
 * Titles are Title Case throughout — these sit beside product names that carry
 * it ("Adobe Commerce App Builder MCP", "Dropins MCP"), and a sentence-cased
 * heading above them reads as an unfinished label rather than a deliberate one.
 */
const INTEGRATIONS: readonly IntegrationDefinition[] = [
    {
        key: 'demo-builder',
        label: 'Demo Builder',
        mcpIds: ['demo-builder'],
        owns: (s) => s.source === 'demo-builder',
    },
    {
        key: 'storefront',
        label: 'Storefront',
        mcpIds: ['dropins'],
        owns: (s) => s.bundle === 'aem',
    },
    {
        key: 'app-builder',
        label: 'App Builder',
        mcpIds: ['commerce-extensibility'],
        owns: (s) => s.bundle === 'appbuilder',
    },
    {
        // Playwright drives three of our own skills rather than shipping a set,
        // so it is a server with no partner. Say so by giving it a section
        // instead of hiding it in a list of things that do have partners.
        key: 'browser',
        label: 'Browser Automation',
        mcpIds: ['playwright'],
        owns: () => false,
    },
];

/** Anything we do not recognise — a user's own skills, a hand-added server. */
const OTHER_LABEL = 'Other';

/**
 * Group the inventory into integration sections. A section with neither an MCP
 * nor a skill is dropped; a section with only one half is KEPT, because the
 * missing half is the finding.
 */
export function buildIntegrationSections(
    mcps: McpInventoryEntry[],
    skills: SkillInventoryEntry[],
): AiIntegrationSection[] {
    const claimedMcps = new Set<string>();
    const claimedSkills = new Set<SkillInventoryEntry>();

    const sections = INTEGRATIONS.map(({ key, label, mcpIds, owns }) => {
        const sectionMcps = mcps.filter((m) => mcpIds.includes(m.id));
        sectionMcps.forEach((m) => claimedMcps.add(m.id));
        const sectionSkills = skills.filter((s) => owns(s));
        sectionSkills.forEach((s) => claimedSkills.add(s));
        return { key, label, mcps: sectionMcps, skills: sectionSkills };
    }).filter((s) => s.mcps.length > 0 || s.skills.length > 0);

    const leftoverMcps = mcps.filter((m) => !claimedMcps.has(m.id));
    const leftoverSkills = skills.filter((s) => !claimedSkills.has(s));
    if (leftoverMcps.length > 0 || leftoverSkills.length > 0) {
        sections.push({
            key: 'other',
            label: OTHER_LABEL,
            mcps: leftoverMcps,
            skills: leftoverSkills,
        });
    }

    return sections;
}
