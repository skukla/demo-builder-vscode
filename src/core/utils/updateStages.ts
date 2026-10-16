/**
 * Check for Updates' steps and applying what it found, in the one stage table
 * (`operationStages.ts`, which spreads them into `OPERATION_STAGES`). The same rules
 * hold: a label of at most 25 characters, an expectation and a detail.
 *
 * WHY (progress vocabulary slice 7, owner 2026-10-16): the update notifications called
 * VS Code's progress themselves, so an agent heard none of them, and their messages
 * were whatever came to hand: a project's name, "api-mesh in demo", "Installing".
 *
 * The check's steps measured from three checks in the Debug Logs (2026-10-16, two
 * projects each): reading source repos about a second, components and templates about
 * two, add-ons under one. A template update took 6 seconds with nothing to merge
 * (2026-10-14). Where a line says FIRST ESTIMATE it was not in those runs.
 */

export const UPDATE_STAGES = {
    // FIRST ESTIMATE, NOT MEASURED: no log line marks its start or end.
    checkingExtension: {
        label: 'Checking the extension',
        expectation: 'Usually a few seconds',
        detail: 'Its newest release on GitHub',
    },
    // FIRST ESTIMATE, NOT MEASURED: no log line marks its start or end.
    checkingAllProjects: {
        label: 'Checking all projects',
        expectation: 'Usually a few seconds',
        detail: 'Reading each project on this machine',
    },
    checkingSourceRepos: {
        label: 'Checking source repos',
        expectation: 'Usually a few seconds',
        detail: 'Whether each fork is behind its upstream',
    },
    checkingComponents: {
        label: 'Checking components',
        expectation: 'Usually a few seconds',
        detail: 'Their newest releases on GitHub',
    },
    checkingTemplates: {
        label: 'Checking EDS templates',
        expectation: 'Usually a few seconds',
        detail: 'New code in each storefront template',
    },
    checkingAddOns: {
        label: 'Checking add-ons',
        expectation: 'Usually a few seconds',
        detail: 'Block libraries and the Inspector SDK',
    },
    checkingAiTools: {
        label: 'Checking the AI tools',
        expectation: 'Usually a few seconds',
        detail: "Each storefront's Adobe MCP package",
    },
    checkingIntegrations: {
        label: 'Checking integrations',
        expectation: 'Usually a few seconds',
        detail: 'Newer code for each deployed pair',
    },
    // FIRST ESTIMATE, NOT MEASURED: a fork sync is one GitHub call per repo. Only the
    // agent's apply (`updateApplyService.ts`) reports it; the picker's runs silently.
    syncingSourceRepos: {
        label: 'Syncing source repos',
        expectation: 'Usually a few seconds',
        detail: 'Bringing each fork up to its upstream',
    },
    updatingTemplate: {
        label: 'Updating the template',
        expectation: 'Usually under a minute',
        detail: "Merging the template's new code",
    },
    // FIRST ESTIMATE, NOT MEASURED: no component update is in the logs.
    updatingComponents: {
        label: 'Updating components',
        expectation: 'Under a minute each',
        detail: 'Downloading and installing each release',
    },
    // FIRST ESTIMATE, NOT MEASURED: no Adobe MCP update is in the logs.
    updatingAiTools: {
        label: 'Updating the AI tools',
        expectation: 'Usually under a minute',
        detail: 'The Adobe MCP package, then the AI files',
    },
    // FIRST ESTIMATE, NOT MEASURED: a block library update is one commit; the
    // Inspector SDK only records its new commit. Reported by the agent's apply.
    updatingAddOns: {
        label: 'Updating add-ons',
        expectation: 'Usually under a minute',
        detail: 'Block libraries and the Inspector SDK',
    },
    // FIRST ESTIMATE, NOT MEASURED: no integration update is in the logs. Each pair
    // redeploys, so it is the deploy's 1–2 minutes.
    updatingIntegrations: {
        label: 'Updating integrations',
        expectation: 'Usually 1–2 minutes each',
        detail: "Redeploying each pair's newer code",
    },
    // FIRST ESTIMATE, NOT MEASURED: no extension update is in the logs.
    downloadingUpdate: {
        label: 'Downloading the update',
        expectation: 'Usually a few seconds',
        detail: 'The new release from GitHub',
    },
    // FIRST ESTIMATE, NOT MEASURED.
    installingUpdate: {
        label: 'Installing the update',
        expectation: 'Usually a few seconds',
        detail: 'VS Code installs it, then asks to reload',
    },
} as const satisfies Record<string, { label: string; expectation: string; detail: string }>;

/** Check for Updates' steps, in the order it runs them; each shows "(n of 8)". */
export const UPDATE_CHECK_STEPS: readonly string[] = [
    UPDATE_STAGES.checkingExtension.label,
    UPDATE_STAGES.checkingAllProjects.label,
    UPDATE_STAGES.checkingSourceRepos.label,
    UPDATE_STAGES.checkingComponents.label,
    UPDATE_STAGES.checkingTemplates.label,
    UPDATE_STAGES.checkingAddOns.label,
    UPDATE_STAGES.checkingAiTools.label,
    UPDATE_STAGES.checkingIntegrations.label,
];

/** The notification title every category of an update run carries, so they read as one run. */
export const APPLYING_UPDATES = 'Applying updates';
