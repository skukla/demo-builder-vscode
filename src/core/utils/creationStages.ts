/**
 * Project creation's own steps, in the one stage table (`operationStages.ts`, which
 * spreads them into `OPERATION_STAGES`), with an Edit's and a headless project reset's. Kept in their own file so the
 * table stays under the util size limit. The same rules hold: a label that fits beside
 * its operation's title, a verb from the one list, an expectation and a detail.
 *
 * Creation shows the SAME step where the work is the same as elsewhere: the mesh deploy
 * is 'Deploying the mesh', config.json is 'Publishing the settings', the product pages
 * are 'Warming product pages' (progress vocabulary, owner 2026-10-16). The steps only
 * creation has are here.
 *
 * Measured from five creations in the Debug Logs (2026-10-12, four runs, and
 * 2026-10-15), each one EDS storefront component and no mesh: the folders, settings and
 * definitions in milliseconds, downloading 2 to 4 seconds, installing 13 to 17 seconds,
 * the config files and the save in under 10 milliseconds. Where a line says FIRST
 * ESTIMATE it was not in those runs.
 */

export const CREATION_STAGES = {
    // Only when a folder is left from before (an earlier run that did not finish).
    // FIRST ESTIMATE, NOT MEASURED: no run in the logs had one.
    preparingProject: {
        label: 'Preparing the project',
        expectation: 'Usually a few seconds',
        detail: 'Removing previous files',
    },
    settingUpProject: {
        label: 'Setting up the project',
        expectation: 'Usually a few seconds',
        detail: 'Creating folders',
    },
    loadingComponents: {
        label: 'Loading the components',
        expectation: 'Usually a few seconds',
        detail: 'Reading components',
    },
    // A headless project's reset, before it downloads them again (`projectResetService`);
    // its other steps are creation's. FIRST ESTIMATE, NOT MEASURED: no reset of a
    // headless project is in the logs. It deletes one folder per component.
    removingComponents: {
        label: 'Deleting components',
        expectation: 'Usually a few seconds',
        detail: 'Removing component folders',
    },
    downloadingComponents: {
        label: 'Downloading components',
        expectation: 'Usually a few seconds',
        detail: 'Downloading from GitHub',
    },
    // One component in every measured run; components install side by side.
    installingComponents: {
        label: 'Installing components',
        expectation: 'Usually under a minute',
        detail: 'Installing dependencies',
    },
    // One step however many integrations: each one's own steps show under it, by name
    // (owner, 2026-10-16: "Fold"). FIRST ESTIMATE, NOT MEASURED in a creation.
    deployingIntegrations: {
        label: 'Deploying integrations',
        expectation: 'Usually 1–2 minutes each',
        detail: 'Deploying to Adobe I/O Runtime',
    },
    // An Edit that unticks integrations, the same way. FIRST ESTIMATE from one removal
    // (3 minutes, 39 seconds on 2026-09-21, `operationStages.ts`).
    removingIntegrations: {
        label: 'Undeploying integrations',
        expectation: 'A few minutes each',
        detail: 'Removing from Adobe I/O Runtime',
    },
    writingConfigFiles: {
        label: 'Writing configuration files',
        expectation: 'Usually a few seconds',
        detail: 'Writing component settings',
    },
    installingDatapack: {
        label: 'Installing the datapack',
        expectation: 'Usually a few minutes',
        detail: 'Checking for conflicts',
    },
    removingDatapack: {
        label: 'Uninstalling the datapack',
        expectation: 'Usually a few minutes',
        detail: 'Removing data from Commerce',
    },
    applyingChanges: {
        label: 'Applying the changes',
        expectation: 'Usually under a minute',
        detail: 'Replacing changed components',
    },
    // After Stop or the time limit: the step that was running finishes, then the run's
    // cleanup deletes what it made (F274).
    stoppingCreation: {
        label: 'Stopping after this step',
        expectation: 'Until this step finishes',
        detail: 'Waiting for the current step',
    },
    finishingProject: {
        label: 'Finishing the project',
        expectation: 'Usually a few seconds',
        detail: 'Saving project',
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;
