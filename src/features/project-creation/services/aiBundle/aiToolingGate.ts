/**
 * AI tooling gate.
 *
 * Decides which projects receive the Adobe Commerce Extensibility Developer
 * Agent tooling (the `commerce-extensibility` MCP from `ai-defaults.json` and
 * its skill bundles), and which ai-defaults entries apply to a given project.
 *
 * History: the tooling used to be gated on an EDS storefront being present,
 * which left headless / mesh / app-builder-only projects — exactly the
 * projects doing App Builder development — with no AI tooling at all. The
 * predicate here widens delivery: storefront OR mesh OR attached App Builder
 * component. Playwright stays storefront-only (it exists for the EDS
 * site-scraping skills), expressed via each entry's `requires` field.
 */

import aiDefaultsConfig from '../../config/ai-defaults.json';
import { COMPONENT_IDS, isMeshComponentId } from '@/core/constants';
import type { AiDefaults, AiDefaultsMcpServer } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

const aiDefaults: AiDefaults = aiDefaultsConfig as AiDefaults;

/**
 * Whether third-party tooling is enabled — injected by the extension at
 * activation (`setThirdPartyToolsResolver`, wired to the
 * `demoBuilder.ai.enableThirdPartyTools` setting). Defaults to true so pure
 * callers and tests see the shipped default; the same injection pattern as
 * `HelixService.setDefaultDaLiveTokenProvider`.
 *
 * This is deliberately the ONE code point for the opt-out: every gate seam
 * (mcpConfigWriter, aiDefaultsInstaller both call sites,
 * resolveAvailableMcpToolIds → skillsWriter) routes through
 * {@link aiDefaultsEntryApplies}, so a `thirdParty` entry and its dependent
 * skills switch off together — atomically, per the third-party-tooling item's
 * "change all or none" constraint.
 */
let thirdPartyToolsEnabled: () => boolean = () => true;

/** Wire the setting in (activation); tests may inject a stub. */
export function setThirdPartyToolsResolver(resolver: () => boolean): void {
    thirdPartyToolsEnabled = resolver;
}

/**
 * True when the project does App Builder-adjacent development: an EDS
 * storefront (Commerce extensibility), any mesh component, or an attached
 * App Builder component.
 */
export function projectNeedsAppBuilderTooling(project: Project): boolean {
    if (project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path) {
        return true;
    }
    if (Object.keys(project.componentInstances ?? {}).some(isMeshComponentId)) {
        return true;
    }
    return Object.keys(project.appBuilderComponents ?? {}).length > 0;
}

/**
 * True when an ai-defaults MCP entry applies to the project, per the entry's
 * `requires` declaration.
 */
export function aiDefaultsEntryApplies(entry: AiDefaultsMcpServer, project: Project): boolean {
    // The third-party escape hatch gates BEFORE the composition check: a
    // disabled tool applies to no project, so its package is not installed,
    // its .mcp.json entry is not written, and the skills that drive it are
    // gated out by resolveAvailableMcpToolIds — one switch, every seam.
    if (entry.thirdParty && !thirdPartyToolsEnabled()) {
        return false;
    }
    if (entry.requires === 'eds-storefront') {
        return Boolean(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path);
    }
    return projectNeedsAppBuilderTooling(project);
}

/**
 * The ai-defaults entry ids whose MCP tool is usable by this project RIGHT
 * NOW: the entry applies (its `requires` gate passes) AND its package is
 * declared installed in the isolated `.demo-builder-mcp` manifest. Offline
 * and pure — callers supply the installed-package list (from
 * `readInstalledMcpPackages`); matching is on package names, not entry ids.
 *
 * `writeSkillFiles` consumes this with `SKILL_MCP_TOOL_DEPENDENCIES`
 * (`@/types/ai`) to gate tool-driving skills: a skill whose declared tool is
 * not available is not written, and a previously-delivered copy is reconciled
 * through the ADR-013 removal matrix (positive proof of ownership only).
 */
export function resolveAvailableMcpToolIds(
    project: Project,
    installedPackages: string[],
): Set<string> {
    const installed = new Set(installedPackages);
    return new Set(
        aiDefaults.mcpServers
            .filter((entry) => aiDefaultsEntryApplies(entry, project))
            .filter((entry) => installed.has(entry.package))
            .map((entry) => entry.id),
    );
}

/** Why a tool-driving skill is absent — rendered by the AI Capabilities modal. */
export interface GatedSkillReason {
    /** Skill filename (e.g. 'scrape-reference-site.md'). */
    file: string;
    /** The ai-defaults tool id the skill drives. */
    toolId: string;
    /**
     * - 'setting-disabled': the tool is thirdParty and the opt-out is off.
     * - 'tool-missing': the tool applies but its package is not installed
     *   (Regenerate AI Files installs it).
     */
    reason: 'setting-disabled' | 'tool-missing';
}

/**
 * The tool-driving skills this project QUALIFIES for but does not have, each
 * with why — so the AI Capabilities modal can state the reason instead of
 * silently omitting a skill (third-party-tooling item, step 4). A skill whose
 * tool does not apply to the project at all (e.g. Playwright on a non-EDS
 * project) is not listed: that absence is composition, not a condition.
 */
export function gatedSkillReasons(
    project: Project,
    installedPackages: string[],
    dependencies: Readonly<Record<string, string>>,
): GatedSkillReason[] {
    const installed = new Set(installedPackages);
    const reasons: GatedSkillReason[] = [];
    for (const [file, toolId] of Object.entries(dependencies)) {
        const entry = aiDefaults.mcpServers.find((e) => e.id === toolId);
        if (!entry) continue;
        if (aiDefaultsEntryApplies(entry, project)) {
            if (!installed.has(entry.package)) {
                reasons.push({ file, toolId, reason: 'tool-missing' });
            }
            continue;
        }
        // Does not apply — distinguish the opt-out from plain composition by
        // asking again with the third-party check bypassed.
        if (entry.thirdParty && !thirdPartyToolsEnabled()) {
            const appliesOtherwise =
                entry.requires === 'eds-storefront'
                    ? Boolean(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path)
                    : projectNeedsAppBuilderTooling(project);
            if (appliesOtherwise) {
                reasons.push({ file, toolId, reason: 'setting-disabled' });
            }
        }
    }
    return reasons;
}
