/**
 * An App Builder component's Settings: what its modal shows, what a save may
 * change, and which apps a change redeploys.
 *
 * Settings are the entry's catalog `envSchema` vars a person sets: text settings
 * (stored in `componentConfigs[id]`) and secret ones (SecretStorage,
 * `componentSettingSecrets.ts`). A var another component provides is shown
 * read-only; a var derived from known config is not shown at all. A setting both
 * apps of a pair declare (the ERP's name) is set once, on the integration: the
 * bound system reads it from there (`deployInputs.ts`), so its own Settings leave
 * it out.
 *
 * Pure. The extension builds each component's `ComponentSettings` and hands it to
 * the integrations webview, which renders it without deciding anything itself.
 *
 * @module features/app-builder/services/componentSettings
 */

import { getProvidedEnvVars } from '@/core/state/appBuilderComponentState';
import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import { classifyEnvSchema } from '@/features/project-creation/services/envVarClassifier';
import type {
    AppBuilderComponentCatalogEntry,
    AppBuilderComponentEnvVar,
    ComponentSettings,
} from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** The longest value a text setting may hold. */
export const MAX_SETTING_LENGTH = 500;

/** A save from the Settings modal: new text values, and secrets to store. */
export interface ComponentSettingsChange {
    values: Record<string, string>;
    secrets: Record<string, string>;
}

/** The settings a person sets on this entry (text, then secret), minus those its integration owns. */
export function editableSettingsOf(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
): AppBuilderComponentEnvVar[] {
    const { userText, userSecret } = classifyEnvSchema(entry.envSchema ?? []);
    const partner = entry.boundTo ? catalog.find((candidate) => candidate.id === entry.boundTo) : undefined;
    const ownedByPartner = new Set((partner?.envSchema ?? []).map((envVar) => envVar.name));
    return [...userText, ...userSecret].filter((envVar) => !ownedByPartner.has(envVar.name));
}

/** Whether the entry has anything to set: the Settings item and row appear only then. */
export function hasSettings(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
): boolean {
    return editableSettingsOf(entry, catalog).length > 0;
}

function typedValue(project: Project, id: string, name: string): string | undefined {
    const value = project.componentConfigs?.[id]?.[name];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * What the entry's Settings modal shows for this project.
 *
 * @param entry - the component's catalog entry
 * @param catalog - the catalog (to find a bound partner and a provider's name)
 * @param project - the project (typed values, provided values, display names)
 * @param secretFlags - whether each secret setting is stored (booleans only)
 * @returns the fields and the read-only connected rows
 */
export function buildComponentSettings(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
    project: Project,
    secretFlags: Record<string, boolean>,
): ComponentSettings {
    const fields = editableSettingsOf(entry, catalog).map((envVar) => ({
        name: envVar.name,
        label: envVar.label,
        type: envVar.type,
        required: envVar.default === undefined,
        ...(envVar.type === 'secret'
            ? { isSet: secretFlags[envVar.name] === true }
            : { value: typedValue(project, entry.id, envVar.name) ?? envVar.default ?? '' }),
    }));
    const provided = getProvidedEnvVars(project);
    const connected = classifyEnvSchema(entry.envSchema ?? []).autoWired.map((envVar) => {
        const kind = envVar.providedBy as string;
        // The provider THIS entry pairs with: a second ERP's integration shows the
        // second ERP and its address (AB-23).
        const providerId = pairedInstanceId(entry.id, entry.catalogId, kind);
        const provider = project.appBuilderComponents?.[providerId];
        const from = provider?.name ?? catalog.find((candidate) => candidate.id === kind)?.name ?? providerId;
        const value = provider?.providesEnvVars?.[envVar.name] ?? provided[envVar.name];
        return { name: envVar.name, label: envVar.label, from, value };
    });
    return { fields, connected };
}

function refusalFor(
    field: AppBuilderComponentEnvVar | undefined,
    name: string,
    value: unknown,
    type: 'text' | 'secret',
): string | undefined {
    if (!field || field.type !== type) return `"${name}" is not a ${type} setting of this integration.`;
    if (typeof value !== 'string') return `"${field.label}" must be text.`;
    if (value.length > MAX_SETTING_LENGTH) {
        return `"${field.label}" is longer than ${MAX_SETTING_LENGTH} characters.`;
    }
    const mayBeBlank = type === 'text' && field.default !== undefined;
    if (!mayBeBlank && value.trim().length === 0) return `"${field.label}" cannot be empty.`;
    return undefined;
}

type TypedPair = [name: string, value: unknown, type: 'text' | 'secret'];

function entriesOfType(map: Record<string, unknown> | undefined, type: 'text' | 'secret'): TypedPair[] {
    return Object.entries(map ?? {}).map(([name, value]): TypedPair => [name, value, type]);
}

/**
 * Why a save cannot be applied, or undefined when it can. Refuses names the entry
 * does not let a person set, a text value where a secret belongs (and the reverse),
 * blank required values and over-long ones, and a save that changes nothing.
 */
export function validateSettingsChange(
    entry: AppBuilderComponentCatalogEntry,
    catalog: AppBuilderComponentCatalogEntry[],
    change: ComponentSettingsChange,
): string | undefined {
    const editable = new Map(editableSettingsOf(entry, catalog).map((envVar) => [envVar.name, envVar]));
    const pairs = [...entriesOfType(change.values, 'text'), ...entriesOfType(change.secrets, 'secret')];
    if (pairs.length === 0) return 'Nothing to save.';
    for (const [name, value, type] of pairs) {
        const refusal = refusalFor(editable.get(name), name, value, type);
        if (refusal) return refusal;
    }
    return undefined;
}

/**
 * The components a settings change redeploys, in order: any system bound to this
 * entry that uses a changed setting comes first (the add path's order), then the
 * entry itself. Only components the project has.
 */
export function redeployOrder(
    entry: AppBuilderComponentCatalogEntry,
    changedNames: string[],
    catalog: AppBuilderComponentCatalogEntry[],
    project: Project,
): string[] {
    const kind = entry.catalogId ?? entry.id;
    const systems = catalog
        .filter((candidate) =>
            candidate.kind === 'system'
            && candidate.boundTo === kind
            && (candidate.envSchema ?? []).some((envVar) => changedNames.includes(envVar.name)))
        // Each as the instance this entry pairs with (AB-23).
        .map((system) => pairedInstanceId(entry.id, entry.catalogId, system.id))
        .filter((id) => project.appBuilderComponents?.[id] !== undefined);
    return [...systems, entry.id];
}

/**
 * A Configure Project save's component configs, with every integration's and
 * system's settings as stored rather than as sent. Configure sends back all it
 * loaded, but an integration's settings belong to its tile (AB-21): a Configure
 * window opened before a Settings save must not put the old values back. Meshes
 * are left alone, since Configure still edits the mesh's fields.
 *
 * @param sent - the configs Configure sent
 * @param project - the project as stored
 * @returns the configs to persist
 */
export function keepIntegrationSettings<T extends Record<string, Record<string, unknown>>>(
    sent: T,
    project: Project,
): T {
    const kept: Record<string, Record<string, unknown>> = { ...sent };
    for (const [id, state] of Object.entries(project.appBuilderComponents ?? {})) {
        if (state.kind === 'mesh') continue;
        const stored = project.componentConfigs?.[id];
        if (stored) kept[id] = stored;
        else delete kept[id];
    }
    return kept as T;
}
