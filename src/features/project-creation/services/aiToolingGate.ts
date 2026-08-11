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

import { COMPONENT_IDS, isMeshComponentId } from '@/core/constants';
import type { AiDefaultsMcpServer } from '@/types/aiDefaults';
import type { Project } from '@/types/base';

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
    if (entry.requires === 'eds-storefront') {
        return Boolean(project.componentInstances?.[COMPONENT_IDS.EDS_STOREFRONT]?.path);
    }
    return projectNeedsAppBuilderTooling(project);
}
