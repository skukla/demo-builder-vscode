/**
 * What an App Builder app is deployed WITH, beyond the workspace credentials.
 *
 * Catalog app repos ship no `.env`; everything they take as an `inputs:` value
 * arrives in the deploy's process environment. Until the ERP pair (2026-09-14)
 * the only such values were the App Management IMS credentials. Two more kinds
 * exist now, and both resolve here so add and redeploy cannot drift on them:
 *
 *   - the entry's TEXT settings (`componentConfigs[id]`, set on the integration's
 *     tile): a bound system takes its integration's value first (the SC names the
 *     ERP once, on the integration), then its own, then the schema's `default`;
 *   - the values another component PROVIDES (`envSchema[].providedBy`), read off
 *     the persisted `providesEnvVars` of every component in the project.
 *
 * And the inverse: what a deployed component provides to others. A mesh provides
 * its endpoint; any other component provides the WEB BASE of its deployed
 * package (`…/api/v1/web/<package>`), which is what a consumer prefixes route
 * paths onto (the ERP's `ERP_BASE_URL`).
 *
 * @module features/app-builder/services/deployInputs
 */

import { getProvidedEnvVars } from '@/core/state/appBuilderComponentState';
import type { AppBuilderComponentCatalogEntry } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** The mesh's provided value is its GraphQL endpoint, resolved by the mesh tail, not here. */
const MESH_ENDPOINT = 'MESH_ENDPOINT';
const WEB_SEGMENT = '/api/v1/web/';

/**
 * The value of one text input for an entry. A system bound to an integration
 * reads the integration's value first: a setting both apps use is set once, on
 * the integration's tile (AB-21), and an older copy on the system must not win.
 * Then the entry's own value, then the schema default.
 */
function textInputValue(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    name: string,
    fallback: string | undefined,
): string | undefined {
    const owners = entry.boundTo ? [entry.boundTo, entry.id] : [entry.id];
    for (const owner of owners) {
        const value = project.componentConfigs?.[owner]?.[name];
        if (typeof value === 'string' && value.trim().length > 0) return value;
    }
    return fallback;
}

/**
 * Every deploy-time input the entry's `envSchema` names that has a value.
 *
 * Missing values are simply absent — a text var with no default and nothing
 * configured is the add door's problem (`userSuppliedEnvVars`), not the
 * deploy's; and a `providedBy` var whose provider is not deployed is caught by
 * `findMissingProvider` before this runs.
 *
 * Secret settings are not read here: they live in SecretStorage and join the
 * deploy env through `resolveSecretInputs` (`componentSettingSecrets`).
 *
 * @param project - the project (settings and provided values)
 * @param entry - the entry being deployed
 * @returns name → value, only for names that resolved
 */
export function resolveDeployInputs(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
): Record<string, string> {
    const provided = getProvidedEnvVars(project);
    const inputs: Record<string, string> = {};
    for (const envVar of entry.envSchema ?? []) {
        if (envVar.type === 'secret') continue;
        const value = envVar.providedBy
            ? provided[envVar.name]
            : textInputValue(project, entry, envVar.name, envVar.default);
        if (value !== undefined) {
            inputs[envVar.name] = value;
        }
    }
    return inputs;
}

/**
 * The web base of a deployed package: the first deployed URL that has a web
 * segment, cut after the package name.
 * `https://ns.adobeioruntime.net/api/v1/web/demo-erp/health` → `…/web/demo-erp`.
 */
export function deriveWebBase(deployedUrls: Record<string, string> | undefined): string | undefined {
    for (const url of Object.values(deployedUrls ?? {})) {
        const at = url.indexOf(WEB_SEGMENT);
        if (at === -1) continue;
        const afterWeb = at + WEB_SEGMENT.length;
        const slash = url.indexOf('/', afterWeb);
        return slash === -1 ? url : url.slice(0, slash);
    }
    return undefined;
}

/**
 * What a non-mesh component provides to its consumers, once deployed: every
 * name in its `providesEnvVars` set to the deployed package's web base.
 *
 * @param entry - the deployed entry
 * @param deployedUrls - the per-action URL map the deploy yielded
 * @returns the provided map, or undefined when the entry provides nothing (or
 *   nothing web-reachable deployed)
 */
export function deriveProvidedValues(
    entry: AppBuilderComponentCatalogEntry,
    deployedUrls: Record<string, string> | undefined,
): Record<string, string> | undefined {
    const names = (entry.providesEnvVars ?? []).filter((name) => name !== MESH_ENDPOINT);
    if (names.length === 0) return undefined;
    const base = deriveWebBase(deployedUrls);
    if (!base) return undefined;
    return Object.fromEntries(names.map((name) => [name, base]));
}

/**
 * The display name a component's row carries when its catalog entry says the
 * name comes from an input (`nameFromEnvVar`: the ERP is called whatever the
 * SC named it). Falls back to the entry's own name.
 *
 * @param entry - the catalog entry
 * @param inputs - the resolved deploy inputs
 * @returns the row's display name
 */
export function resolveDisplayName(
    entry: AppBuilderComponentCatalogEntry,
    inputs: Record<string, string>,
): string {
    const fromInput = entry.nameFromEnvVar ? inputs[entry.nameFromEnvVar] : undefined;
    return fromInput?.trim() || entry.name;
}
