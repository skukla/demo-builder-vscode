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
}

export const OPERATION_STAGES = {
    checkingRequirements: {
        label: 'Checking requirements',
        expectation: 'Usually a few seconds',
    },
    preparingNode: {
        label: 'Preparing Node',
        expectation: 'Up to 30 seconds, the first time only',
    },
    subscribingApis: {
        label: 'Subscribing Adobe APIs',
        expectation: 'Usually under a minute',
    },
    adding: {
        label: 'Adding integration',
        expectation: 'Usually a few seconds',
    },
    deploying: {
        label: 'Deploying',
        expectation: 'Usually a few seconds',
    },
    removing: {
        label: 'Removing integration',
        expectation: 'Usually under a minute',
    },
    generatingMeshConfig: {
        label: 'Generating mesh configuration',
        expectation: 'Usually a few seconds',
    },
    resolvingCommerceCredentials: {
        label: 'Resolving Commerce IMS credentials',
        expectation: 'Usually a few seconds',
    },
    updatingCli: {
        label: 'Updating Adobe CLI',
        expectation: 'A minute or two, and only when the CLI is out of date',
    },
    deployingApp: {
        label: 'Deploying the app',
        expectation: 'Usually 1–2 minutes',
    },
    resolvingAppUrl: {
        label: "Finding the app's address",
        expectation: 'Usually a few seconds',
    },
    installingIntoCommerce: {
        label: 'Installing into Commerce',
        expectation: 'Usually under a minute, longer if Commerce asks for a retry',
    },
    removingFromCommerce: {
        label: 'Removing the app from Commerce',
        expectation: 'Usually under a minute, longer if Commerce asks for a retry',
    },
} as const satisfies Record<string, OperationStage>;

const EXPECTATIONS: ReadonlyMap<string, string> = new Map(
    Object.values(OPERATION_STAGES).map((stage) => [stage.label, stage.expectation]),
);

/**
 * The expectation line for a reported stage, or `undefined` for a stage this table
 * does not name — which then shows no line rather than a guessed one.
 */
export function expectationFor(stage: string): string | undefined {
    return EXPECTATIONS.get(stage);
}
