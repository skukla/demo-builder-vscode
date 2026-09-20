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
 * Every stage the runner and its handlers report is named here and used by reference,
 * so a stage and its expectation cannot drift apart. `operationStages.test.ts` fails
 * when a call site reports a literal instead.
 *
 * THE DURATIONS ARE FIRST ESTIMATES, from single measurements in the step timings
 * `timedSteps` writes to Debug Logs (2026-09-18: subscribing 30s, 43s cold in the
 * 2026-08-27 audit; `aio app deploy` 54s; Runtime credentials 4s; requirements 4s).
 * Correct them from those logs as more runs are read.
 */

export interface OperationStage {
    /** What is happening, as the SC reads it. */
    readonly label: string;
    /** How long it usually takes, or what it is waiting on. */
    readonly expectation: string;
    /**
     * Row 2 when a report names no step of its own: what the stage is working on.
     * Without it the row sat blank and the modal read as two lines with a gap.
     */
    readonly detail: string;
}

export const OPERATION_STAGES = {
    checkingRequirements: {
        label: 'Checking requirements',
        expectation: 'Usually a few seconds',
        detail: 'Adobe sign-in and developer access',
    },
    preparingNode: {
        label: 'Preparing Node',
        expectation: 'Up to 30 seconds, the first time only',
        detail: 'The Node version this app runs on',
    },
    subscribingApis: {
        label: 'Adding Adobe services',
        expectation: 'Usually under a minute',
        // The first thing it actually does, so row 2 is never filler: the
        // subscribe's own steps take over a beat later and start with this one.
        // The SC's own words (owner, 2026-09-19) — "subscriptions" and
        // "workspace" are what they say, where "the APIs on the credential" is
        // Console's vocabulary and meant nothing to a reader.
        detail: 'Checking what subscriptions the workspace already has',
    },
    // `buildComponent` reported a literal "Building..." until 2026-09-19 — an
    // off-table stage, so the modal showed an ellipsis title and no expectation
    // line at all. One entry per kind, because the two builds differ in what
    // they do and how long they take.
    buildingMesh: {
        label: 'Building the mesh',
        expectation: 'Usually a few seconds',
        detail: 'Compiling it before the deploy',
    },
    buildingApp: {
        label: 'Building the app',
        expectation: 'Usually under a minute',
        detail: 'Installing what it needs to run',
    },
    adding: {
        label: 'Preparing the app',
        expectation: 'Usually a few seconds',
        detail: 'Checking what it needs before it deploys',
    },
    deploying: {
        label: 'Preparing the deploy',
        expectation: 'Usually a few seconds',
        detail: 'Checking what it needs before it deploys',
    },
    removing: {
        label: 'Taking the app down',
        expectation: 'Usually under a minute',
        detail: 'Removing it from Adobe I/O Runtime',
    },
    generatingMeshConfig: {
        label: 'Building the mesh config',
        expectation: 'Usually a few seconds',
        detail: "From the project's Commerce settings",
    },
    resolvingCommerceCredentials: {
        label: 'Getting Commerce access',
        expectation: 'Usually a few seconds',
        detail: "For the mesh's Commerce connection",
    },
    updatingCli: {
        label: 'Updating Adobe CLI',
        expectation: 'A minute or two, and only when the CLI is out of date',
        detail: 'npm install -g @adobe/aio-cli',
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
        expectation: 'Usually under a minute, longer if Commerce asks for a retry',
        detail: "Through Commerce's App Management",
    },
    readingMeshConfig: {
        label: 'Reading the mesh config',
        expectation: 'Usually a few seconds',
        detail: "The mesh's mesh.json",
    },
    deployingMesh: {
        label: 'Deploying the mesh',
        expectation: 'Usually 1–2 minutes',
        detail: 'Running aio api-mesh',
    },
    verifyingMesh: {
        label: 'Checking the mesh is live',
        expectation: 'Up to a couple of minutes while Adobe finishes',
        detail: 'Waiting for Adobe to report it deployed',
    },
    removingFromCommerce: {
        label: 'Removing from Commerce',
        expectation: 'Usually under a minute, longer if Commerce asks for a retry',
        detail: "Through Commerce's App Management",
    },
    // A bound pair (the ERP integration and the ERP it uses): the system goes first.
    addingSystem: {
        label: 'Adding the system it uses',
        expectation: 'Usually 2–3 minutes: the system is deployed before the integration',
        detail: 'Deploying it before the integration that reads its address',
    },
    // The wizard's creation screen (PL-59 slice 8, plan rows 14-15). Same table
    // as every other surface, so a stage the SC reads while a project is being
    // built is worded like the same work anywhere else.
    preparingProject: {
        label: 'Preparing the project',
        expectation: 'Usually a few seconds',
        detail: 'Clearing anything left from before',
    },
    settingUpProject: {
        label: 'Setting up the project',
        expectation: 'Usually a few seconds',
        detail: 'Its folders and its settings',
    },
    loadingComponents: {
        label: 'Loading the components',
        expectation: 'Usually a few seconds',
        detail: 'What this stack is made of',
    },
    downloadingComponents: {
        label: 'Downloading components',
        expectation: 'Usually under a minute',
        detail: 'Cloning them from GitHub',
    },
    installingComponents: {
        label: 'Installing components',
        expectation: 'A minute or two',
        detail: 'Running npm install for each',
    },
    deployingIntegrations: {
        label: 'Deploying integrations',
        expectation: 'Usually 1–2 minutes each',
        detail: 'Onto Adobe I/O Runtime',
    },
    settingUpContent: {
        label: 'Setting up the content',
        expectation: 'Usually a minute',
        detail: 'Copying it into DA.live',
    },
    syncingConfig: {
        label: 'Syncing the settings',
        expectation: 'Usually under a minute',
        detail: "The storefront's config.json",
    },
    installingDatapack: {
        label: 'Installing the datapack',
        expectation: 'Minutes, depending on the pack',
        detail: 'Into your Commerce instance',
    },
    applyingChanges: {
        label: 'Applying the changes',
        expectation: 'Usually under a minute',
        detail: 'Swapping what the edit changed',
    },
    fetchingUpdate: {
        label: 'Fetching the update',
        expectation: 'Usually a few seconds',
        detail: 'From GitHub',
    },
    installingUpdateDependencies: {
        label: 'Installing dependencies',
        expectation: 'Usually under a minute',
        detail: 'Running npm install',
    },
} as const satisfies Record<string, OperationStage>;

const BY_LABEL: ReadonlyMap<string, OperationStage> = new Map(
    Object.values(OPERATION_STAGES).map((stage) => [stage.label, stage]),
);

/**
 * The expectation line for a reported stage, or `undefined` for a stage this table
 * does not name — which then shows no line rather than a guessed one.
 */
export function expectationFor(stage: string): string | undefined {
    return BY_LABEL.get(stage)?.expectation;
}

/**
 * The detail line for a reported stage that named no step, or `undefined` for a
 * stage this table does not name.
 */
export function detailFor(stage: string): string | undefined {
    return BY_LABEL.get(stage)?.detail;
}
