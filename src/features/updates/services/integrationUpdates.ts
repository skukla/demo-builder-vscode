/**
 * Integration pairs with newer code, as the extension's update check sees them
 * (AB-73): every deployed integration and its ERPs, across ALL projects, with
 * the same rule the Integrations screen applies (`checkIntegrationUpdates`),
 * and applied through the same pair update the card's Update button runs.
 *
 * Until this, an integration update was found only when the Integrations screen
 * opened, only for the open project, and `apply_updates` answered "up to date"
 * while one was waiting.
 *
 * Nothing here fetches a service: the per-project check, the org step of the
 * guard chain and the catalog arrive as a probe, and the pair update arrives on
 * the `UpdateContext` (`updateIntegrationPair`), both bound at a boundary.
 *
 * @module features/updates/services/integrationUpdates
 */

import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { sanitizeErrorForLogging } from '@/core/validation/SensitiveDataRedactor';
import { componentNameOf, pairUpdateOrder } from '@/features/app-builder/services/integrationPairUpdate';
import {
    hasIntegrationsToCheck,
    type IntegrationUpdateCheck,
} from '@/features/app-builder/services/integrationUpdateCheck';
import { integrationUsing, systemsUsedBy } from '@/features/components/services/appBuilderComponentLinks';
import { emptyResult, type CategoryResult } from '@/features/updates/services/updateApplyResult';
import type { UpdateContext } from '@/features/updates/services/updateCore';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** One deployed pair with newer code, in one project. */
export interface IntegrationPairUpdate {
    project: Project;
    /**
     * The member the pair update is asked for: the integration when it has newer
     * code (its ERPs with newer code then go first), else the ERP that has.
     */
    componentId: string;
    /** The members the update covers, in the order they update. */
    members: string[];
    /** The pair by name, integration first: "ERP Integration and Justrite ERP". */
    label: string;
    /**
     * True when the project's Adobe org is not the one the token reaches (the
     * org step of the guard chain): listed, but not deployed from this org.
     */
    otherOrg: boolean;
}

/** What the finder needs, bound at a boundary that has a handler context. */
export interface IntegrationUpdateProbe {
    /** The Integrations screen's own check, recorded on the project. */
    check: (project: Project) => Promise<IntegrationUpdateCheck | undefined>;
    /**
     * Whether the guard chain's org step refuses this project: its Adobe org is
     * not the one the signed-in token reaches. False when it could not tell (not
     * signed in), which leaves the pair selectable for the full chain to decide.
     */
    inOtherOrg: (project: Project) => Promise<boolean>;
    catalog: readonly AppBuilderComponentCatalogEntry[];
}

/** Why a pair in another Adobe org is listed but not applied from here. */
export const OTHER_ORG_NOTE =
    'uses a different Adobe organization: open that project and update it from its Integrations screen';

const NOT_AVAILABLE = 'Updating integrations is not available here.';

/** The pair's integration id for a member with newer code; a lone system is its own group. */
function integrationOf(project: Project, id: string, catalog: IntegrationUpdateProbe['catalog']): string {
    if (getAppBuilderComponent(project, id)?.kind !== 'system') return id;
    return integrationUsing(project, id, catalog) ?? id;
}

/** The pair by name, integration first, then every ERP it uses. */
function pairLabel(project: Project, integrationId: string, catalog: IntegrationUpdateProbe['catalog']): string {
    return [integrationId, ...systemsUsedBy(project, integrationId, catalog)]
        .map((id) => componentNameOf(project, id))
        .join(' and ');
}

/** One pair per integration whose members have newer code, in report order. */
function pairsOf(project: Project, availableIds: string[], probe: IntegrationUpdateProbe, otherOrg: boolean): IntegrationPairUpdate[] {
    const newerByIntegration = new Map<string, string[]>();
    for (const id of availableIds) {
        const integrationId = integrationOf(project, id, probe.catalog);
        newerByIntegration.set(integrationId, [...(newerByIntegration.get(integrationId) ?? []), id]);
    }
    return [...newerByIntegration.entries()].map(([integrationId, newer]) => {
        const componentId = newer.includes(integrationId) ? integrationId : newer[0];
        return {
            project,
            componentId,
            members: pairUpdateOrder(project, componentId, probe.catalog),
            label: pairLabel(project, integrationId, probe.catalog),
            otherOrg,
        };
    });
}

/**
 * Every deployed pair with newer code across `projects`, by the Integrations
 * screen's rule. A project with no deployed integration costs nothing; the org
 * step is asked once per project, and only when something is newer.
 *
 * @param projects - the projects to check, in the order to list them
 * @param probe - the check, the org step and the catalog, bound at the boundary
 * @returns one entry per pair, in project order
 */
export async function findIntegrationPairUpdates(
    projects: Project[],
    probe: IntegrationUpdateProbe,
): Promise<IntegrationPairUpdate[]> {
    const found: IntegrationPairUpdate[] = [];
    for (const project of projects.filter(hasIntegrationsToCheck)) {
        const checked = await probe.check(project);
        const availableIds = (checked?.reports ?? []).filter((r) => r.available).map((r) => r.id);
        if (availableIds.length === 0) continue;
        const otherOrg = await probe.inOtherOrg(project);
        found.push(...pairsOf(project, availableIds, probe, otherOrg));
    }
    return found;
}

/** The pair, with the other-org note when it must be updated from its own project. */
export function describeIntegrationUpdate(update: IntegrationPairUpdate): string {
    return update.otherOrg ? `${update.label} (${OTHER_ORG_NOTE})` : update.label;
}

/**
 * Apply each pair through the context's pair update, reporting each step. A
 * pair in another Adobe org is deferred with the note, never deployed from here;
 * a failed pair is a failure in plain words ("X in P did not update: why"), and
 * the next pair still runs.
 *
 * @param items - the pairs to update
 * @param ctx - the update context; `updateIntegrationPair` runs the pair
 * @param onProgress - where each step goes (a progress bar, or the agent's phases)
 * @returns the category result, with `applied` lines for what each update did
 */
export async function applyIntegrationUpdates(
    items: IntegrationPairUpdate[],
    ctx: UpdateContext,
    onProgress?: (message: string) => void,
): Promise<CategoryResult> {
    const result = emptyResult();
    for (const item of items) {
        const where = `${item.label} in ${item.project.name}`;
        if (item.otherOrg) {
            (result.deferred ??= []).push(`${where} ${OTHER_ORG_NOTE}.`);
            continue;
        }
        if (!ctx.updateIntegrationPair) {
            result.failCount++;
            result.errors.push(`${where} did not update: ${NOT_AVAILABLE}`);
            continue;
        }
        onProgress?.(`Updating ${where}`);
        try {
            const updated = await ctx.updateIntegrationPair(item.project, item.componentId, (message, subMessage) =>
                onProgress?.(`${where}: ${subMessage ?? message}`),
            );
            if (updated.success) {
                result.successCount++;
                if (updated.detail) (result.applied ??= []).push(updated.detail);
            } else {
                result.failCount++;
                result.errors.push(`${where} did not update: ${updated.error ?? 'no reason given'}`);
            }
        } catch (error) {
            result.failCount++;
            result.errors.push(`${where} did not update: ${sanitizeErrorForLogging(error as Error)}`);
            ctx.logger.error(`[Updates] Integration update failed for ${where}`, error as Error);
        }
    }
    return result;
}
