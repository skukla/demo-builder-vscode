/**
 * A storefront reset's steps, in the order they run, each with its line in the one
 * stage table (`operationStages.ts`, which spreads them into `OPERATION_STAGES`).
 *
 * Grouped by what an SC recognises (owner, 2026-10-16 release walk). Until then the
 * steps followed the code's structure: three were a single quick call, and the last
 * held nine different jobs, each shown as if it were the step ("Publishing block
 * library (11 of 11)" read as eleven of eleven libraries). Now a step is one job the
 * SC can name; what it is doing at the moment is the line under it.
 *
 * ORDER IS LOAD-BEARING: the position shown ("6 of 11") is the index here, so the
 * list follows the order the reset runs its work (`edsResetService.ts`). A step that
 * has nothing to do is skipped and the count moves on.
 *
 * Expectations measured from two resets of the scratch storefront on 2026-10-16
 * (5 minutes 45 seconds and 5 minutes 41 seconds end to end).
 */

export const RESET_STAGES = {
    resettingCode: {
        label: 'Resetting the code',
        expectation: 'Usually about a minute',
        detail: 'Putting the template code back in your repository',
    },
    publishingCodeAndSettings: {
        label: 'Publishing code, settings',
        expectation: 'Usually under a minute',
        detail: 'The code, its permissions and the site configuration',
    },
    clearingOldContent: {
        label: 'Clearing old content',
        expectation: 'Usually under a minute',
        detail: 'The pages the reset replaces',
    },
    copyingContent: {
        label: 'Copying the content',
        expectation: 'Usually under a minute',
        detail: "The demo's pages into DA.live",
    },
    settingUpAuthoring: {
        label: 'Setting up authoring',
        expectation: 'Usually under a minute',
        detail: 'The block library and DA.live settings',
    },
    publishingPages: {
        label: 'Publishing the pages',
        expectation: 'Usually about a minute',
        detail: 'Pages, sheets and the block library, to the live site',
    },
    removingOldPages: {
        label: 'Removing old pages',
        expectation: 'Usually a few seconds',
        detail: 'Pages from before the reset that are still live',
    },
    checkingCopiedPages: {
        label: 'Checking copied pages',
        expectation: 'Usually a few seconds',
        detail: 'That the live site serves every page the demo has',
    },
    warmingProductPages: {
        label: 'Warming product pages',
        expectation: 'Usually about a minute',
        detail: 'So product pages open fast the first time',
    },
    addingCatalogMenu: {
        label: 'Adding the catalog menu',
        expectation: 'Usually a few seconds',
        detail: "A page for each of the store's categories",
    },
    checkingSettings: {
        label: 'Checking the settings',
        expectation: 'Usually a few seconds',
        detail: 'That the live site has the new configuration',
    },
    redeployingMesh: {
        label: 'Redeploying the mesh',
        expectation: 'Usually a few minutes',
        detail: 'So the storefront reads the store through it',
    },
} as const;

type ResetStageKey = keyof typeof RESET_STAGES;

/** A reset step's position: 1-based, in run order. The mesh is last and only when there is one. */
export const RESET_STEP = Object.fromEntries(
    Object.keys(RESET_STAGES).map((key, index) => [key, index + 1]),
) as Readonly<Record<ResetStageKey, number>>;

/** Steps every reset runs; the mesh redeploy adds one. */
export const RESET_BASE_STEPS = Object.keys(RESET_STAGES).length - 1;

/**
 * The stage a reset step shows, by its position.
 *
 * @param step - the step's position, as reported
 * @returns its label, or undefined for a position no step has (0: a pre-step notice)
 */
export function resetStageLabel(step: number): string | undefined {
    const key = Object.keys(RESET_STAGES)[step - 1] as ResetStageKey | undefined;
    return key ? RESET_STAGES[key].label : undefined;
}
