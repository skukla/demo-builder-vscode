/**
 * The stages an App Builder component operation reports, each with the ONE line that
 * tells an SC how long it usually takes (PL-59).
 *
 * A stage is what is happening ("Deploying the app"); the step under it is the detail
 * of the moment ("Running aio app deploy"). The expectation belongs to the stage, not
 * the step, and never changes while the stage runs — the rule the Storefront setup
 * step settled on in its 2026-08-22 loading-message audit, so the block does not
 * reflow as steps come and go.
 *
 * Every stage the runner and its handlers report is named here (the storefront's in
 * `storefrontStages.ts`, spread in) and used by reference, so a stage and its
 * expectation cannot drift apart. `operationStages.test.ts` fails when a call site
 * reports a literal instead.
 *
 * THE DURATIONS ARE FIRST ESTIMATES, from single measurements in the step timings
 * `timedSteps` writes to Debug Logs (2026-09-18: subscribing 30s, 43s cold in the
 * 2026-08-27 audit; `aio app deploy` 54s; Runtime credentials 4s; requirements 4s).
 * Correct them from those logs as more runs are read.
 */

import { ADOBE_PROJECT_STAGES } from './adobeProjectStages';
import { CREATION_STAGES } from './creationStages';
import { DATAPACK_STAGES } from './datapackStages';
import { namedStageBase } from './packStage';
import { RESET_STAGES } from './resetStages';
import { STOREFRONT_STAGES } from './storefrontStages';
import { UPDATE_STAGES } from './updateStages';

export interface OperationStage {
    /** What is happening, as the SC reads it. */
    readonly label: string;
    /** How long it usually takes, or what it is waiting on. */
    readonly expectation: string;
    /**
     * Row 2 when a report names no step of its own: what the stage is working on.
     * Without it the row sat blank and the modal read as two lines with a gap; a stage whose
     * label says it all leaves it out, and the row is dropped (`noBlankRows`), not left blank
     * (Phase 1, owner 2026-11-10: Clear Demo Data's labels stand alone).
     */
    readonly detail?: string;
}

export const OPERATION_STAGES = {
    checkingRequirements: {
        label: 'Checking requirements',
        expectation: 'Usually a few seconds',
        detail: 'Checking sign-in and developer access',
    },
    preparingNode: {
        label: 'Preparing Node',
        // Kept off line 3, which stays short (owner, 2026-10-16): the first time only.
        expectation: 'Up to 30 seconds',
        detail: 'Installing required Node version',
    },
    reinstallingPackages: {
        label: 'Reinstalling packages',
        expectation: 'A minute per component',
        detail: 'Rebuilding for the new Node version',
    },
    subscribingApis: {
        label: 'Adding Adobe services',
        expectation: 'Usually under a minute',
        // What the stage is for, so row 2 is never filler and never claims a step
        // that may not run: an ADD skips the "what does it already have" check (a
        // new workspace has nothing), yet this row used to say it was checking —
        // then flashed that step for 0ms (2026-09-21). The subscribe's own steps
        // replace it as they happen. The SC's own words (owner, 2026-09-19) —
        // "subscriptions" and "workspace" are what they say.
        detail: "Subscriptions this app's workspace needs",
    },
    // Both were silent until 2026-09-21: creating the workspace ran under
    // "Preparing Node", and the clone and npm install under "Adding Adobe
    // services" — so the subscribe read as a minute when it took 25s.
    makingWorkspace: {
        label: 'Setting up the workspace',
        expectation: 'Usually a few seconds',
        detail: 'Creating app workspace',
    },
    gettingCode: {
        label: 'Getting the code',
        expectation: 'Usually under a minute',
        detail: 'Downloading and installing',
    },
    // `buildComponent` reported a literal "Building..." until 2026-09-19 — an
    // off-table stage, so the modal showed an ellipsis title and no expectation
    // line at all. One entry per kind, because the two builds differ in what
    // they do and how long they take.
    buildingMesh: {
        label: 'Building the mesh',
        expectation: 'Usually a few seconds',
        detail: 'Compiling mesh',
    },
    buildingApp: {
        label: 'Building the app',
        expectation: 'Usually under a minute',
        detail: 'Installing dependencies',
    },
    adding: {
        label: 'Preparing the app',
        expectation: 'Usually a few seconds',
        detail: 'Checking prerequisites',
    },
    deploying: {
        label: 'Preparing the deploy',
        expectation: 'Usually a few seconds',
        detail: 'Checking prerequisites',
    },
    removing: {
        label: 'Undeploying the app',
        expectation: 'Usually under a minute',
        detail: 'Removing from Adobe I/O Runtime',
    },
    generatingMeshConfig: {
        label: 'Building the mesh configuration',
        expectation: 'Usually a few seconds',
        detail: 'Reading Commerce settings',
    },
    resolvingCommerceCredentials: {
        label: 'Getting Commerce access',
        expectation: 'Usually a few seconds',
        detail: 'Creating Commerce credentials',
    },
    loadingErpDemoData: {
        label: 'Loading demo data',
        expectation: 'Usually a minute',
        detail: 'Loading products and companies',
    },
    assigningErpProducts: {
        label: 'Tagging the products',
        expectation: 'Usually under a minute',
        detail: 'Setting erp_owner on products',
    },
    updatingErps: {
        label: 'Updating the ERPs',
        expectation: 'Usually a minute',
        detail: 'Updating changed ERPs',
    },
    // The demo setup's words, one name for it everywhere (AB-82, 2026-10-26).
    preparingStore: { label: 'Applying the demo setup', expectation: 'Usually under a minute', detail: 'Each step checked first' },
    // Its undo once read the apply's stage under its own title (2026-10-22).
    undoingStorePreparation: {
        label: 'Undoing the demo setup',
        expectation: 'Usually under a minute',
        detail: 'Reverting setup steps',
    },
    changingAttributeSets: {
        label: 'Changing attribute sets',
        expectation: 'A few seconds per set',
        detail: 'Adding erp_owner to attribute sets',
    },
    undoingStoreSetup: {
        label: 'Undoing the store setup',
        expectation: 'Usually a minute',
        detail: 'Reverting tags and attribute sets',
    },
    resettingErpRecords: {
        label: 'Resetting the records',
        expectation: 'Usually a minute or two',
        detail: 'Reverting ERP changes in Commerce',
    },
    updatingCli: {
        label: 'Updating Adobe CLI',
        // Kept off line 3, which stays short (owner, 2026-10-16): only when the CLI is out of date.
        expectation: 'A minute or two',
        detail: 'Installing latest Adobe CLI',
    },
    deployingApp: {
        label: 'Deploying the app',
        expectation: 'Usually 1–2 minutes',
        detail: 'Running aio app deploy',
    },
    resolvingAppUrl: {
        label: "Finding the app's address",
        expectation: 'Usually a few seconds',
        detail: 'Running aio app get-url',
    },
    installingIntoCommerce: {
        label: 'Installing into Commerce',
        // Kept off line 3, which stays short (owner, 2026-10-16): longer if Commerce asks for a
        // retry.
        expectation: 'Usually under a minute',
        detail: 'Using Commerce App Management',
    },
    readingMeshConfig: {
        label: 'Reading the mesh configuration',
        expectation: 'Usually a few seconds',
        detail: 'Reading mesh.json',
    },
    deployingMesh: {
        label: 'Deploying the mesh',
        expectation: 'Usually 1–2 minutes',
        detail: 'Running aio api-mesh',
    },
    verifyingMesh: {
        label: 'Checking the mesh is live',
        // Kept off line 3, which stays short (owner, 2026-10-16): while Adobe finishes.
        expectation: 'Up to a couple of minutes',
        detail: 'Waiting for deployment status',
    },
    // A removal ran as ONE line for 3m 39s on 2026-09-21
    // while it undid Commerce writes, uninstalled, undeployed two apps, deleted
    // eight leftovers and waited on Adobe for the workspace. Each phase now says so.
    undoingCommerceChanges: {
        label: 'Undoing Commerce changes',
        expectation: 'Usually under a minute',
        detail: 'Reverting integration changes',
    },
    clearingRecords: {
        label: 'Deleting the records',
        expectation: 'Usually under a minute',
        detail: 'Deleting integration data',
    },
    // "Checking nothing is left" covered three jobs with one line and said which
    // in none of them (owner, 2026-10-09). Every reporter now names its job.
    checkingLeftovers: {
        label: 'Checking for leftovers',
        expectation: 'Usually under a minute',
        detail: 'Checking Runtime and Admin registration',
    },
    // The storefront's stages (republish, and the pages after a store change).
    ...STOREFRONT_STAGES,
    ...RESET_STAGES,
    ...ADOBE_PROJECT_STAGES,
    removingWorkspace: {
        label: 'Deleting the workspace',
        expectation: 'Up to a couple of minutes',
        detail: 'Waiting for Adobe to confirm',
    },
    removingFromCommerce: {
        label: 'Uninstalling from Commerce',
        // Kept off line 3, which stays short (owner, 2026-10-16): longer if Commerce asks for a
        // retry.
        expectation: 'Usually under a minute',
        detail: 'Using Commerce App Management',
    },
    // Changing a project's Adobe destination (AB-23). Both were literals until the
    // progress vocabulary's enforcer found them (slice 8, 2026-10-16).
    // FIRST ESTIMATES, NOT MEASURED.
    savingDestination: {
        label: 'Saving the destination',
        expectation: 'Usually a few seconds',
        detail: 'Saving project and workspace',
    },
    movingIntegrations: {
        label: 'Moving the integrations',
        expectation: 'Usually 1–2 minutes each',
        detail: 'Deploying to new workspace',
    },
    // A bound pair (the ERP integration and the ERP it uses): the system goes first.
    addingSystem: {
        label: 'Adding the system it uses',
        // Kept off line 3, which stays short (owner, 2026-10-16): the system is deployed before
        // the integration.
        expectation: 'Usually 2–3 minutes',
        detail: 'Deploying required system',
    },
    // The wizard's creation screen and an Edit (`creationStages.ts`).
    ...CREATION_STAGES,
    fetchingUpdate: {
        label: 'Fetching the update',
        expectation: 'Usually a few seconds',
        detail: 'Downloading from GitHub',
    },
    installingUpdateDependencies: {
        label: 'Installing dependencies',
        expectation: 'Usually under a minute',
        detail: 'Running npm install',
    },
    // "Save store changes to this pack" on a datapack's flyout (`datapackStages.ts`).
    ...DATAPACK_STAGES,
    // Check for Updates and applying what it found (`updateStages.ts`).
    ...UPDATE_STAGES,
} as const satisfies Record<string, OperationStage>;

const BY_LABEL: ReadonlyMap<string, OperationStage> = new Map(
    Object.values(OPERATION_STAGES).map((stage) => [stage.label, stage]),
);

/** A reported stage's table label: itself, or the step a named one stands for (`packStage`). */
export function baseStage(stage: string): string {
    return BY_LABEL.has(stage) ? stage : (namedStageBase(stage) ?? stage);
}

/**
 * The expectation line for a reported stage, or `undefined` for a stage this table
 * does not name — which then shows no line rather than a guessed one.
 */
export function expectationFor(stage: string): string | undefined {
    return BY_LABEL.get(baseStage(stage))?.expectation;
}

/**
 * The detail line for a reported stage that named no step, or `undefined` for a
 * stage this table does not name.
 */
export function detailFor(stage: string): string | undefined {
    return BY_LABEL.get(baseStage(stage))?.detail;
}
