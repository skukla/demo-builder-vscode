/**
 * An integration's Settings, saved from its tile (AB-21).
 *
 * `saveIntegrationSettings` checks the change against the entry's settings,
 * stores text values in `componentConfigs[id]` and secrets in SecretStorage,
 * then redeploys what uses them: a bound system that shares a changed setting
 * first, then the integration. A setting reaches an app only through its
 * deploy, so a save without the redeploy would look done and change nothing.
 * The modal's button says "Save and redeploy"; pressing it is the confirmation.
 *
 * Answers with its result (Pattern B), including the fresh settings.
 *
 * @module features/dashboard/handlers/componentSettingsHandlers
 */

import { handleRedeployAppBuilderComponent, resolveComponentTarget } from './appBuilderComponentHandlers';
import { getAppBuilderComponent } from '@/core/state/appBuilderComponentState';
import { catalogEntryFor, entryFromState } from '@/features/app-builder/services/componentEntry';
import {
    type ComponentSettingsChange,
    redeployOrder,
    validateSettingsChange,
} from '@/features/app-builder/services/componentSettings';
import {
    loadProjectComponentSettings,
    persistAppBuilderComponentSecrets,
} from '@/features/app-builder/services/componentSettingSecrets';
import { getAvailableAppBuilderComponents } from '@/features/components/services/appBuilderComponentCatalogLoader';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';
import { ErrorCode } from '@/types/errorCodes';
import type { HandlerContext, HandlerResponse, MessageHandler } from '@/types/handlers';
import type {
    SaveIntegrationSettingsRequestPayload,
    SaveIntegrationSettingsResult,
} from '@/types/webviewRequests';

/**
 * The project's catalog, plus an entry for every imported integration it holds.
 * An import has no catalog row of its own; its entry is rebuilt from its record
 * the way redeploy does, so a seeded import (a kit under its own id) keeps the
 * seed's settings.
 */
export function settingsCatalogOf(project: Project): AppBuilderComponentCatalogEntry[] {
    const catalog = getAvailableAppBuilderComponents(
        project.componentSelections?.backend ?? '',
        project.componentSelections?.frontend ?? '',
    );
    const imported = Object.entries(project.appBuilderComponents ?? {})
        .filter(([id, state]) => state.kind !== 'mesh' && !catalog.some((entry) => entry.id === id))
        // A second copy of a catalog kind is its catalog entry under its own id.
        .map(([id, state]) => catalogEntryFor(project, id, catalog) ?? entryFromState(id, state));
    return [...catalog, ...imported];
}

async function storeChange(
    context: HandlerContext,
    project: Project,
    id: string,
    change: ComponentSettingsChange,
): Promise<void> {
    if (Object.keys(change.values).length > 0) {
        project.componentConfigs = {
            ...project.componentConfigs,
            [id]: { ...project.componentConfigs?.[id], ...change.values },
        };
        await context.stateManager.saveProject(project);
    }
    const secrets = Object.entries(change.secrets)
        .map(([varName, value]) => ({ appBuilderComponentId: id, varName, value }));
    await persistAppBuilderComponentSecrets(secrets, project.path, context.context.secrets, context.logger);
}

/** Redeploy each in order; the first failure stops the rest and is returned. */
async function redeployEach(
    context: HandlerContext,
    project: Project,
    ids: string[],
): Promise<string | undefined> {
    for (const id of ids) {
        const result = await handleRedeployAppBuilderComponent(context, { id });
        if (!result.success) {
            const name = getAppBuilderComponent(project, id)?.name ?? id;
            return `Settings saved, but redeploying ${name} failed: ${result.error ?? 'unknown error'}`;
        }
    }
    return undefined;
}

/** Store an integration's settings change, then redeploy what uses it. */
export async function saveIntegrationSettings(
    context: HandlerContext,
    payload: SaveIntegrationSettingsRequestPayload | undefined,
): Promise<SaveIntegrationSettingsResult> {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error as SaveIntegrationSettingsResult;
    const { id, project } = target;

    const catalog = settingsCatalogOf(project);
    const entry = catalog.find((candidate) => candidate.id === id);
    if (!entry || !getAppBuilderComponent(project, id)) {
        const error = `"${id}" is not an integration in this project.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }
    const change: ComponentSettingsChange = {
        values: payload?.values ?? {},
        secrets: payload?.secrets ?? {},
    };
    const refusal = validateSettingsChange(entry, catalog, change);
    if (refusal) return { success: false, error: refusal, code: ErrorCode.CONFIG_INVALID };

    await storeChange(context, project, id, change);
    const changed = [...Object.keys(change.values), ...Object.keys(change.secrets)];
    context.logger.info(`[Settings] Saved ${changed.length} setting(s) for ${id}`);
    const failure = await redeployEach(context, project, redeployOrder(entry, changed, catalog, project));
    const current = (await context.stateManager.getCurrentProject()) ?? project;
    const settings = (await loadProjectComponentSettings(current, catalog, context.context.secrets))[id];
    return failure
        ? { success: false, saved: true, error: failure, settings }
        : { success: true, saved: true, settings };
}

/**
 * Handle 'getIntegrationSettings' — what one integration's Settings modal shows:
 * each setting's value, whether each secret is stored (never its value), and the
 * settings another app provides. The agent surface's read of the same thing.
 */
export const handleGetIntegrationSettings: MessageHandler<{ id?: string }> = async (
    context,
    payload,
): Promise<HandlerResponse> => {
    const target = await resolveComponentTarget(context, payload?.id);
    if (!target.ok) return target.error;
    const { id, project } = target;
    if (!getAppBuilderComponent(project, id)) {
        const error = `"${id}" is not an integration in this project.`;
        return { success: false, error, code: ErrorCode.INVALID_OPERATION };
    }
    const catalog = settingsCatalogOf(project);
    const settings = (await loadProjectComponentSettings(project, catalog, context.context.secrets))[id];
    return { success: true, data: { id, settings: settings ?? { fields: [], connected: [] } } };
};

/** Handle 'saveIntegrationSettings'. */
export const handleSaveIntegrationSettings: MessageHandler<SaveIntegrationSettingsRequestPayload> =
    saveIntegrationSettings;
