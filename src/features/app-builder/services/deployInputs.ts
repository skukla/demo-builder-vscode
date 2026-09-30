/**
 * What an App Builder app is deployed WITH, beyond the workspace credentials.
 *
 * Catalog app repos ship no `.env`; everything they take as an `inputs:` value
 * arrives in the deploy's process environment. Until the ERP pair (2026-09-14)
 * the only such values were the App Management IMS credentials. Four more kinds
 * exist now, and all resolve here so add and redeploy cannot drift on them:
 *
 *   - the entry's TEXT settings (`componentConfigs[id]`, set on the integration's
 *     tile): a bound system takes its integration's value first (the SC names the
 *     ERP once, on the integration), then its own, then the schema's `default`;
 *     the input an unbound entry is NAMED from falls back to its recorded name
 *     before the default, so a project older than that input keeps its name;
 *   - the values another component PROVIDES (`envSchema[].providedBy`), read off
 *     the persisted `providesEnvVars` of every component in the project;
 *   - for a second copy of a kind, which copy it is (`DEMO_BUILDER_COPY_NUMBER`).
 *   - for a system its integration serves in a list, its id there (`listedAs`: the
 *     ERP's `ERP_ID`, AB-16).
 *
 * And the inverse: what a deployed component provides to others. A mesh provides
 * its endpoint; any other component provides the WEB BASE of its deployed
 * package (`…/api/v1/web/<package>`), which is what a consumer prefixes route
 * paths onto (the ERP's `ERP_BASE_URL`).
 *
 * @module features/app-builder/services/deployInputs
 */

export { ensureCommerceAppId } from './commerceAppId';
import { getProvidedEnvVars } from '@/core/state/appBuilderComponentState';
import { pairedInstanceId } from '@/features/components/services/appBuilderComponentLinks';
import type { AppBuilderComponentCatalogEntry, AppBuilderComponentEnvVar } from '@/types/appBuilderComponents';
import type { Project } from '@/types/base';

/** The mesh's provided value is its GraphQL endpoint, resolved by the mesh tail, not here. */
const MESH_ENDPOINT = 'MESH_ENDPOINT';
const WEB_SEGMENT = '/api/v1/web/';
/** Tells a second copy of an app which copy it is (see `copyNumber`). */
const COPY_NUMBER = 'DEMO_BUILDER_COPY_NUMBER';
/** Tells a copy which id to declare to Commerce (see `commerceAppId.ts`). */
const APP_ID = 'DEMO_BUILDER_APP_ID';

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
    // The integration THIS system pairs with — a second ERP reads the second
    // integration's value, not the first's.
    const owners = entry.boundTo
        ? [pairedInstanceId(entry.id, entry.catalogId, entry.boundTo), entry.id]
        : [entry.id];
    for (const owner of owners) {
        const value = project.componentConfigs?.[owner]?.[name];
        if (typeof value === 'string' && value.trim().length > 0) return value;
    }
    return fallback;
}

/**
 * What a text input falls back to when nothing is set: the schema default — except the
 * input an entry is NAMED from, which first falls back to the name the entry is recorded
 * under. The ERP integration gained a name of its own (`INTEGRATION_DISPLAY_NAME`, AB-16o)
 * after projects already showed "Northwind ERP Integration"; without this their next
 * deploy would rename the card and Commerce's labels to the default (owner rule: existing
 * projects keep their names). Not for a bound system: it takes its integration's values
 * first, and its name stays exactly as it resolved before.
 */
function fallbackFor(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    envVar: AppBuilderComponentEnvVar,
): string | undefined {
    if (envVar.name !== entry.nameFromEnvVar || entry.boundTo) return envVar.default;
    const recorded = project.appBuilderComponents?.[entry.id]?.name?.trim();
    return recorded || envVar.default;
}

/**
 * A provided value from the provider THIS entry pairs with. The project-wide map is
 * last-writer-wins, so with two ERPs it held one address for both integrations and a
 * redeploy of the first could pick up the second's (AB-23).
 */
function providedValue(
    project: Project,
    entry: AppBuilderComponentCatalogEntry,
    providedBy: string,
    name: string,
): string | undefined {
    const provider = pairedInstanceId(entry.id, entry.catalogId, providedBy);
    return project.appBuilderComponents?.[provider]?.providesEnvVars?.[name];
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
            ? providedValue(project, entry, envVar.providedBy, envVar.name) ?? provided[envVar.name]
            : textInputValue(project, entry, envVar.name, fallbackFor(project, entry, envVar));
        if (value !== undefined) {
            inputs[envVar.name] = value;
        }
    }
    if (entry.listedAs) {
        inputs[entry.listedAs.envVar] = listIdOf(project, entry);
    }
    const copy = copyNumber(entry);
    if (copy) {
        inputs[COPY_NUMBER] = copy;
        // The id this copy declares to Commerce: recorded on the component the first
        // time it deploys and reused ever after, because Commerce refuses an id change
        // on an upgrade. Absent only for a copy that predates the record.
        const appId = project.appBuilderComponents?.[entry.id]?.commerceAppId;
        if (appId) inputs[APP_ID] = appId;
    }
    return inputs;
}

/**
 * The id a listed system has in its integration's list (`listedAs`, AB-16): `firstId` for
 * the system its integration brings, its own component id for one added from the
 * integration's card.
 *
 * The brought system is the catalog's own entry, or a numbered copy whose numbered
 * integration is in the project (`erp-integration-2` brings `demo-erp-2`, from before the
 * integration was add-once). An ERP added from the card is numbered where no such
 * integration exists (`nextListedSystemId`), so it is never mistaken for one.
 *
 * `firstId` is the integration's single-ERP id (`erp`), not the component id: the
 * integration reads an event or a key map row that names no ERP as that one, and the
 * credit attributes it wrote are keyed by it, so a first ERP keeps its history.
 *
 * @param project - the project
 * @param entry - a system entry with `listedAs`
 * @returns its id in the list
 */
export function listIdOf(project: Pick<Project, 'appBuilderComponents'>, entry: AppBuilderComponentCatalogEntry): string {
    const firstId = entry.listedAs?.firstId ?? entry.id;
    if (!entry.catalogId || entry.id === entry.catalogId) return firstId;
    const partner = entry.boundTo ? pairedInstanceId(entry.id, entry.catalogId, entry.boundTo) : undefined;
    return partner && project.appBuilderComponents?.[partner] ? firstId : entry.id;
}

/**
 * Which copy of its kind an entry is: `erp-integration-2` → `'2'`; the entry
 * itself → undefined.
 *
 * Every copy is told its number because Commerce knows an App Management app by
 * the id the app declares, and names its webhooks and events from it — so a
 * second ERP integration on the same Commerce store needs an id of its own,
 * which the app builds from this number (AB-15). The first copy is told nothing
 * and keeps the id it was installed with; Commerce refuses to change an
 * installed app's id.
 */
function copyNumber(entry: AppBuilderComponentCatalogEntry): string | undefined {
    const { id, catalogId } = entry;
    if (!catalogId || id === catalogId || !id.startsWith(`${catalogId}-`)) return undefined;
    return id.slice(catalogId.length + 1);
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
 * SC named it; the ERP integration by its own name, AB-16o). Falls back to the
 * entry's own name when the input is empty.
 *
 * @param entry - the catalog entry
 * @param inputs - the resolved deploy inputs
 * @returns the row's display name
 */
export function resolveDisplayName(
    entry: AppBuilderComponentCatalogEntry,
    inputs: Record<string, string>,
): string {
    const fromInput = entry.nameFromEnvVar ? inputs[entry.nameFromEnvVar]?.trim() : undefined;
    return fromInput || entry.name;
}

/**
 * The name the SC knows a component by in this project: its recorded name (a
 * rename, or the one typed when it was added), else what its inputs make it,
 * else the catalog's. Works before the component has a record at all, which is
 * when a bound system names its integration's workspace.
 *
 * @param project - the project
 * @param entry - the catalog entry
 * @returns the display name
 */
export function displayNameInProject(project: Project, entry: AppBuilderComponentCatalogEntry): string {
    return (
        project.appBuilderComponents?.[entry.id]?.name ??
        resolveDisplayName(entry, resolveDeployInputs(project, entry))
    );
}
