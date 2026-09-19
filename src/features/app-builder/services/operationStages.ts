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
        label: 'Subscribing Adobe APIs',
        expectation: 'Usually under a minute',
        detail: "The APIs on the workspace's credential",
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
        label: 'Generating mesh configuration',
        expectation: 'Usually a few seconds',
        detail: "From the project's Commerce settings",
    },
    resolvingCommerceCredentials: {
        label: 'Resolving Commerce IMS credentials',
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
    removingFromCommerce: {
        label: 'Removing the app from Commerce',
        expectation: 'Usually under a minute, longer if Commerce asks for a retry',
        detail: "Through Commerce's App Management",
    },
    // A bound pair (the ERP integration and the ERP it uses): the system goes first.
    addingSystem: {
        label: 'Adding the system it uses',
        expectation: 'Usually 2–3 minutes: the system is deployed before the integration',
        detail: 'Deploying it before the integration that reads its address',
    },
    fetchingUpdate: {
        label: 'Fetching the latest version',
        expectation: 'Usually a few seconds',
        detail: 'From GitHub',
    },
    installingUpdateDependencies: {
        label: "Installing the new version's dependencies",
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
