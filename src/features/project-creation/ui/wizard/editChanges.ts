/**
 * Did the SC change anything in this Edit? (PL-75 steps 1 and 2)
 *
 * Edit's Finish used to rebuild the whole project even when nothing changed:
 * every integration and the mesh redeployed, the storefront republished, the
 * datapack re-imported. Now the wizard records the SC's CHOICES as they were when
 * it opened (`editBaseline`, set by `buildEditModeState`) and compares them on
 * the way out. When none changed, the storefront step is skipped and Finish only
 * saves the project.
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

/** The SC's choices, as compared. Opaque: only `isEditUnchanged` reads it. */
export type EditChoices = string;

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
 * A stable text form of a value: object keys sorted, lists of plain values sorted,
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

/**
 * The SC's choices in a wizard state, in a form two states can be compared by.
 *
 * @param state - the wizard state
 * @returns the choices as text
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
    return JSON.stringify(stable(choices) ?? {});
}

/**
 * Whether this is an Edit in which the SC changed nothing.
 *
 * @param state - the wizard state
 * @returns true only in Edit, and only when every choice is as it was when the wizard opened
 */
export function isEditUnchanged(state: Partial<WizardState>): boolean {
    if (state.wizardMode !== 'edit' || state.editBaseline === undefined) return false;
    return editChoicesOf(state) === state.editBaseline;
}
