/**
 * What did the SC change in this Edit? (PL-75)
 *
 * Edit's Finish used to rebuild the whole project even when nothing changed:
 * every integration and the mesh redeployed, the storefront republished, the
 * datapack re-imported. Now the wizard records the SC's CHOICES as they were when
 * it opened (`editBaseline`, set by `buildEditModeState`) and compares them on
 * the way out. When none changed, the storefront step is skipped and Finish only
 * saves the project. When the only change is integrations added or removed, the
 * storefront step is skipped too and Finish adds and removes just those
 * (`appliesInPlace`).
 *
 * Only choices are compared. Much of the wizard's state is screen-only (sign-in
 * status, caches, which tab is open, form verdicts) or derived from the package
 * as the wizard loads (the storefront template, patches, brand assets), and
 * comparing it would report a change on every Edit. Every field is classified
 * below, and the classification is a `Record` over the state's keys, so a field
 * added later does not compile until someone decides which it is. When in doubt,
 * a field is a choice: a false "changed" only costs the rebuild that always ran.
 *
 * @module features/project-creation/ui/wizard/editChanges
 */

import { isMeshComponentId } from '@/core/constants';
import type { EDSConfig, WizardState } from '@/types/webview';

type Kind = 'choice' | 'screen';

/** Every wizard field: something the SC chooses, or state of the screen itself. */
const WIZARD_FIELDS: Record<keyof WizardState, Kind> = {
    currentStep: 'screen',
    projectName: 'choice',
    projectTitle: 'choice',
    selectedPackage: 'choice',
    demo: 'choice',
    selectedBackend: 'choice',
    selectedStack: 'choice',
    selectedAddons: 'choice',
    selectedBlockLibraries: 'choice',
    selectedAppBuilderComponents: 'choice',
    appBuilderComponentSources: 'choice',
    selectedConsoleApis: 'choice',
    customBlockLibraries: 'choice',
    // Filled from the package as the wizard loads; the package itself is a choice.
    packageConfigDefaults: 'screen',
    components: 'choice',
    componentConfigs: 'choice',
    commerceConnectValid: 'screen',
    commerceCatalogValid: 'screen',
    commerceStoreViewChosen: 'screen',
    commerceStoreLoading: 'screen',
    storefrontRepoValid: 'screen',
    activeBuildArea: 'screen',
    datapack: 'choice',
    activeCommerceStep: 'screen',
    committedCommerceSteps: 'screen',
    activeStorefrontStep: 'screen',
    adobeAuth: 'screen',
    // Compared by id (`adobeIds`): their names and titles are refetched.
    adobeOrg: 'choice',
    adobeProject: 'choice',
    adobeWorkspace: 'choice',
    commerceConfig: 'choice',
    creationProgress: 'screen',
    projectSearchFilter: 'screen',
    // Compared field by field (`EDS_FIELDS`).
    edsConfig: 'choice',
    // The store structure as discovered from Commerce: a catalog, not a choice.
    storeDiscoveryData: 'screen',
    projectsCache: 'screen',
    workspacesCache: 'screen',
    githubReposCache: 'screen',
    githubRepoSearchFilter: 'screen',
    daLiveSitesCache: 'screen',
    daLiveSiteSearchFilter: 'screen',
    apiVerification: 'screen',
    apiMesh: 'screen',
    wizardMode: 'screen',
    editProjectPath: 'screen',
    editOriginalName: 'screen',
    // Set only by a package or backend change, which changes a choice anyway.
    foundationChanged: 'screen',
    editBaseline: 'screen',
};

/** Every storefront field, the same way. Template fields follow the package. */
const EDS_FIELDS: Record<keyof EDSConfig, Kind> = {
    accsHost: 'choice',
    storeViewCode: 'choice',
    customerGroup: 'choice',
    dataSource: 'choice',
    accsValidated: 'screen',
    accsValidationError: 'screen',
    githubOwner: 'choice',
    githubAuth: 'screen',
    repoMode: 'choice',
    repoName: 'choice',
    // Compared by full name: the picker refetches the rest.
    selectedRepo: 'choice',
    existingRepo: 'choice',
    resetToTemplate: 'choice',
    daLiveOrg: 'choice',
    daLiveOrgVerified: 'screen',
    daLiveOrgError: 'screen',
    siteMode: 'choice',
    daLiveSite: 'choice',
    // Compared by id, for the same reason.
    selectedSite: 'choice',
    resetSiteContent: 'choice',
    daLiveAuth: 'screen',
    templateOwner: 'screen',
    templateRepo: 'screen',
    contentSource: 'screen',
    accountContentSource: 'screen',
    byomOverlayUrl: 'screen',
    patches: 'screen',
    contentPatches: 'screen',
    contentPatchSource: 'screen',
    codePatches: 'screen',
    codePatchSource: 'screen',
    brandAssets: 'screen',
    // A repository created in the picker is a new storefront.
    createdRepo: 'choice',
    skipContent: 'choice',
    // What the storefront step reports back once it has run.
    preflightComplete: 'screen',
    repoUrl: 'screen',
    brokenLinks: 'screen',
    installedBlockLibraries: 'screen',
};

/**
 * The SC's choices, one entry per choice, each in a form two states compare by.
 * A keyed choice (a setting per component, a storefront field) is one entry per
 * key: `componentConfigs.erp-integration`, `edsConfig.repoName`.
 */
export type EditChoices = Record<string, string>;

/** Choices kept per component, so a change names the component it belongs to. */
const KEYED_CHOICES = ['componentConfigs', 'selectedConsoleApis', 'appBuilderComponentSources'] as const;

function choicesOf<T extends object>(source: T | undefined, fields: Record<keyof T, Kind>) {
    const picked: Record<string, unknown> = {};
    for (const key of Object.keys(fields) as Array<keyof T>) {
        if (fields[key] === 'choice' && source) picked[key as string] = source[key];
    }
    return picked;
}

/** What identifies an Adobe org, project or workspace, or a repo or site: its id. */
function idOf(entity: { id?: string; fullName?: string } | undefined): string | undefined {
    return entity?.fullName ?? entity?.id;
}

/**
 * A stable form of a value: object keys sorted, lists of plain values sorted,
 * and every empty value (undefined, null, '', [], {}) left out, so seeding a list
 * the project never had does not read as a change.
 */
function stable(value: unknown): unknown {
    if (Array.isArray(value)) {
        const items = value.map(stable).filter((item) => item !== undefined);
        if (items.length === 0) return undefined;
        const plain = items.every((item) => typeof item !== 'object');
        return plain ? [...items].sort() : items;
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .map(([key, inner]) => [key, stable(inner)] as const)
            .filter(([, inner]) => inner !== undefined)
            .sort(([a], [b]) => a.localeCompare(b));
        return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return value === null || value === '' ? undefined : value;
}

/** Each key of a keyed choice as its own entry, named `field.key`. */
function spread(choices: Record<string, unknown>, field: string, into: EditChoices): void {
    const keyed = (choices[field] ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(keyed)) put(into, `${field}.${key}`, value);
    delete choices[field];
}

function put(into: EditChoices, name: string, value: unknown): void {
    const settled = stable(value);
    if (settled !== undefined) into[name] = JSON.stringify(settled);
}

/**
 * The SC's choices in a wizard state, in a form two states can be compared by.
 *
 * @param state - the wizard state
 * @returns one entry per choice that has a value
 */
export function editChoicesOf(state: Partial<WizardState>): EditChoices {
    const choices = choicesOf(state, WIZARD_FIELDS);
    choices.adobeOrg = idOf(state.adobeOrg);
    choices.adobeProject = idOf(state.adobeProject);
    choices.adobeWorkspace = idOf(state.adobeWorkspace);
    const eds = choicesOf(state.edsConfig, EDS_FIELDS);
    eds.selectedRepo = idOf(state.edsConfig?.selectedRepo);
    eds.selectedSite = idOf(state.edsConfig?.selectedSite);
    // "Do not reset" reads the same unset or false; the pickers set false on mount.
    eds.resetToTemplate = state.edsConfig?.resetToTemplate || undefined;
    eds.resetSiteContent = state.edsConfig?.resetSiteContent || undefined;
    choices.edsConfig = eds;
    const out: EditChoices = {};
    for (const field of [...KEYED_CHOICES, 'edsConfig']) spread(choices, field, out);
    for (const [name, value] of Object.entries(choices)) put(out, name, value);
    return out;
}

/**
 * Which choices the SC changed in this Edit.
 *
 * @param state - the wizard state
 * @returns the changed choices' names, sorted (empty when nothing changed);
 *   undefined outside an Edit or with no baseline, which means "assume everything"
 */
export function editChangesOf(state: Partial<WizardState>): string[] | undefined {
    const baseline = state.editBaseline;
    if (state.wizardMode !== 'edit' || baseline === undefined) return undefined;
    const now = editChoicesOf(state);
    const names = new Set([...Object.keys(baseline), ...Object.keys(now)]);
    return [...names].filter((name) => baseline[name] !== now[name]).sort();
}

/**
 * Whether this is an Edit in which the SC changed nothing.
 *
 * @param state - the wizard state
 * @returns true only in Edit, and only when every choice is as it was when the wizard opened
 */
export function isEditUnchanged(state: Partial<WizardState>): boolean {
    return editChangesOf(state)?.length === 0;
}

/** The integrations an Edit adds and removes, from the selection before and after. */
export interface SelectionDelta {
    added: string[];
    removed: string[];
}

/**
 * What changed between two selections.
 *
 * @param before - the selection when the Edit opened, or as the project records it
 * @param after - the selection Finish was given
 * @returns the ids added and the ids removed
 */
export function selectionDelta(before: readonly string[], after: readonly string[]): SelectionDelta {
    return {
        added: after.filter((id) => !before.includes(id)),
        removed: before.filter((id) => !after.includes(id)),
    };
}

/**
 * Whether Finish can apply this Edit in place: it only adds or removes
 * integrations, and every other changed choice belongs to one it adds or
 * removes (its settings, its API picks, its source). The mesh is not included
 * yet: it also feeds the storefront's settings, which the full Finish rebuilds.
 *
 * Read by the wizard (to skip the storefront step) and by Finish (to choose the
 * path), so both decide the same way.
 *
 * @param changes - the changed choices (`editChangesOf`)
 * @param delta - the integrations added and removed
 * @param isMesh - whether an id is the mesh
 * @returns true when nothing but those integrations changed
 */
export function appliesInPlace(
    changes: readonly string[],
    delta: SelectionDelta,
    isMesh: (id: string) => boolean,
): boolean {
    const touched = [...delta.added, ...delta.removed];
    if (touched.length === 0 || touched.some(isMesh)) return false;
    const owned = new Set(KEYED_CHOICES.flatMap((field) => touched.map((id) => `${field}.${id}`)));
    return changes.every((name) => name === 'selectedAppBuilderComponents' || owned.has(name));
}

/** The selection a baseline recorded (`editChoicesOf` writes it as a sorted list). */
function baselineSelection(baseline: EditChoices): string[] {
    const recorded = baseline.selectedAppBuilderComponents;
    return recorded ? (JSON.parse(recorded) as string[]) : [];
}

/**
 * Whether this Edit's Finish runs without the storefront step: nothing changed,
 * or only integrations were added or removed (`appliesInPlace`). The step pushes
 * and republishes the storefront, which neither needs.
 *
 * @param state - the wizard state
 * @returns true only in an Edit that Finish applies without a rebuild
 */
export function editSkipsStorefrontStep(state: Partial<WizardState>): boolean {
    const changes = editChangesOf(state);
    if (!changes || !state.editBaseline) return false;
    if (changes.length === 0) return true;
    const delta = selectionDelta(
        baselineSelection(state.editBaseline),
        state.selectedAppBuilderComponents ?? [],
    );
    return appliesInPlace(changes, delta, isMeshComponentId);
}
